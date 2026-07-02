package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.WorkflowNodeDto;
import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.HistoryService;
import org.camunda.bpm.engine.RepositoryService;
import org.camunda.bpm.engine.RuntimeService;
import org.camunda.bpm.engine.repository.ProcessDefinition;
import org.camunda.bpm.engine.runtime.ProcessInstance;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class CampaignTriggerService {

    private final CampaignRepository campaignRepository;
    private final RuntimeService runtimeService;
    private final RepositoryService repositoryService;
    private final HistoryService historyService;
    private final WorkflowTriggerResolver triggerResolver;
    private final CampaignVariableEnricher variableEnricher;

    @Transactional
    public void triggerByEventType(String triggerType, Map<String, Object> eventVariables) {
        LocalDateTime now = LocalDateTime.now();
        List<Campaign> campaigns = campaignRepository
                .findByActiveTrueAndTriggerTypeAndStartDateBeforeAndEndDateAfter(triggerType, now, now);

        if (campaigns.isEmpty()) {
            campaigns = campaignRepository.findByActiveTrueAndStartDateBeforeAndEndDateAfter(now, now).stream()
                    .filter(c -> triggerType.equals(resolveTriggerType(c)))
                    .toList();
        }

        if (campaigns.isEmpty()) {
            log.debug("No active campaigns for trigger type {}", triggerType);
            return;
        }

        log.info("Found {} active campaign(s) for trigger {}", campaigns.size(), triggerType);
        
        // Enrich variables first to ensure filter criteria (e.g. totalAmount) can be evaluated
        variableEnricher.enrich(eventVariables);

        for (Campaign campaign : campaigns) {
            if (!passesTriggerFilter(campaign, eventVariables)) {
                log.info("Campaign id={} key={} skipped — trigger filter not met",
                        campaign.getId(), campaign.getBpmnProcessDefinitionKey());
                continue;
            }
            backfillTriggerTypeIfMissing(campaign, triggerType);
            startCampaignProcess(campaign, eventVariables);
        }
    }

    private void backfillTriggerTypeIfMissing(Campaign campaign, String triggerType) {
        if (campaign.getTriggerType() == null || campaign.getTriggerType().isBlank()) {
            campaign.setTriggerType(triggerType);
            campaignRepository.save(campaign);
            log.info("Backfilled triggerType={} for campaign id={}", triggerType, campaign.getId());
        }
    }

    @Transactional
    public Map<String, Object> startCampaignProcess(Campaign campaign, Map<String, Object> inputVariables) {
        Map<String, Object> variables = new HashMap<>(inputVariables);
        variables.put("campaignId", campaign.getId());
        variables.put("campaignWorkflowJson", campaign.getWorkflowJson());

        variableEnricher.enrich(variables);

        log.info("Starting Camunda process '{}' for campaign id={} with variables keys={}",
                campaign.getBpmnProcessDefinitionKey(), campaign.getId(), variables.keySet());

        List<ProcessDefinition> pds = repositoryService.createProcessDefinitionQuery()
                .processDefinitionKey(campaign.getBpmnProcessDefinitionKey())
                .orderByProcessDefinitionVersion().desc()
                .list();

        ProcessInstance instance;
        if (!pds.isEmpty()) {
            String processDefinitionId = pds.get(0).getId();
            log.info("Resolved process definition key '{}' to unique ID '{}' (version {})",
                    campaign.getBpmnProcessDefinitionKey(), processDefinitionId, pds.get(0).getVersion());
            instance = runtimeService.startProcessInstanceById(processDefinitionId, variables);
        } else {
            log.warn("No deployed process definition found for key '{}'. Falling back to start by key.",
                    campaign.getBpmnProcessDefinitionKey());
            instance = runtimeService.startProcessInstanceByKey(campaign.getBpmnProcessDefinitionKey(), variables);
        }

        return getVariablesSafe(instance.getId());
    }

    private Map<String, Object> getVariablesSafe(String processInstanceId) {
        long count = runtimeService.createProcessInstanceQuery().processInstanceId(processInstanceId).count();
        if (count > 0) {
            return runtimeService.getVariables(processInstanceId);
        } else {
            Map<String, Object> result = new HashMap<>();
            historyService.createHistoricVariableInstanceQuery()
                    .processInstanceId(processInstanceId)
                    .list()
                    .forEach(varInstance -> result.put(varInstance.getName(), varInstance.getValue()));
            return result;
        }
    }

    public String resolveTriggerType(Campaign campaign) {
        if (campaign.getTriggerType() != null && !campaign.getTriggerType().isBlank()) {
            return campaign.getTriggerType();
        }
        return triggerResolver.resolveTriggerType(campaign.getWorkflowJson()).orElse(null);
    }

    private boolean passesTriggerFilter(Campaign campaign, Map<String, Object> eventVariables) {
        Optional<WorkflowNodeDto> triggerNode = triggerResolver.findTriggerNode(campaign.getWorkflowJson());
        if (triggerNode.isEmpty()) {
            return true;
        }

        Map<String, Object> props = triggerNode.get().getProperties() != null
                ? triggerNode.get().getProperties()
                : Map.of();
        String type = triggerNode.get().getType();

        if ("Trigger_Event_OrderSuccess".equals(type)) {
            BigDecimal minOrder = toBigDecimal(props.get("minOrderValue"));
            if (minOrder == null || minOrder.compareTo(BigDecimal.ZERO) <= 0) {
                return true;
            }
            BigDecimal amount = firstBigDecimal(eventVariables.get("totalAmount"), eventVariables.get("amount"));
            return amount != null && amount.compareTo(minOrder) >= 0;
        }

        if ("Trigger_Event_ReviewProduct".equals(type)) {
            int minRating = toInt(props.get("minRating"), 1);
            int rating = toInt(eventVariables.get("rating"), 0);
            return rating >= minRating;
        }

        return true;
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal bd) {
            return bd;
        }
        if (value instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal firstBigDecimal(Object... values) {
        for (Object v : values) {
            BigDecimal bd = toBigDecimal(v);
            if (bd != null) {
                return bd;
            }
        }
        return null;
    }

    private int toInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
