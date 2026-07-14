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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
    private final StringRedisTemplate stringRedisTemplate;

    // BUG FIX: the "already triggered?" check below was pure check-then-act (Camunda runtime +
    // history query, then start) with no lock, so two near-simultaneous events for the same
    // businessKey (e.g. order-events and payment-events both firing Trigger_Event_OrderSuccess
    // for the same order under Kafka at-least-once delivery) could both see "not yet triggered"
    // and both start a process instance - double-issuing vouchers/loyalty points for one order.
    private static final Duration TRIGGER_DEDUPE_LOCK_TTL = Duration.ofSeconds(30);

    private String resolveEventUniqueId(String triggerType, Map<String, Object> eventVariables) {
        if ("Trigger_Event_OrderSuccess".equals(triggerType)) {
            Object orderId = eventVariables.get("orderId");
            return orderId != null ? orderId.toString() : null;
        }
        if ("Trigger_Event_ReviewProduct".equals(triggerType)) {
            Object reviewId = eventVariables.get("reviewId");
            return reviewId != null ? reviewId.toString() : null;
        }
        if ("Trigger_Event_NewUser".equals(triggerType)) {
            Object userId = eventVariables.get("userId");
            if (userId == null) {
                userId = eventVariables.get("keycloakUserId");
            }
            return userId != null ? userId.toString() : null;
        }
        return null;
    }

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

            String eventUniqueId = resolveEventUniqueId(triggerType, eventVariables);
            if (eventUniqueId != null) {
                String businessKey = campaign.getId() + ":" + triggerType + ":" + eventUniqueId;

                // BUG FIX: acquire a short-lived distributed lock per businessKey so two
                // near-simultaneous calls (e.g. duplicate/at-least-once Kafka delivery) can't both
                // pass the "already triggered?" check below before either has started a process.
                String lockKey = "campaign-trigger:lock:" + businessKey;
                String lockValue = UUID.randomUUID().toString();
                Boolean acquired = stringRedisTemplate.opsForValue()
                        .setIfAbsent(lockKey, lockValue, TRIGGER_DEDUPE_LOCK_TTL);
                if (!Boolean.TRUE.equals(acquired)) {
                    log.info("Another in-flight trigger is already processing businessKey {}. Skipping to avoid duplicate.",
                            businessKey);
                    continue;
                }

                try {
                    // Check if a process instance with this business key already exists (active or completed)
                    long activeCount = runtimeService.createProcessInstanceQuery()
                            .processInstanceBusinessKey(businessKey)
                            .count();
                    long historicCount = historyService.createHistoricProcessInstanceQuery()
                            .processInstanceBusinessKey(businessKey)
                            .count();

                    if (activeCount > 0 || historicCount > 0) {
                        log.info("Campaign id={} key={} already triggered for event {}:{}. Skipping duplicate execution.",
                                campaign.getId(), campaign.getBpmnProcessDefinitionKey(), triggerType, eventUniqueId);
                        continue;
                    }

                    backfillTriggerTypeIfMissing(campaign, triggerType);
                    startCampaignProcess(campaign, businessKey, eventVariables);
                } finally {
                    // Only release if we still own the lock (avoid deleting a lock re-acquired by
                    // another request after TTL expiry)
                    String currentVal = stringRedisTemplate.opsForValue().get(lockKey);
                    if (lockValue.equals(currentVal)) {
                        stringRedisTemplate.delete(lockKey);
                    }
                }
            } else {
                backfillTriggerTypeIfMissing(campaign, triggerType);
                startCampaignProcess(campaign, eventVariables);
            }
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
        return startCampaignProcess(campaign, null, inputVariables);
    }

    @Transactional
    public Map<String, Object> startCampaignProcess(Campaign campaign, String businessKey, Map<String, Object> inputVariables) {
        Map<String, Object> variables = new HashMap<>(inputVariables);
        variables.put("campaignId", campaign.getId());
        variables.put("campaignWorkflowJson", campaign.getWorkflowJson());

        variableEnricher.enrich(variables);

        // Carry this campaign's category/product restriction (if it uses a
        // Condition_ContainsCategory / Condition_ContainsProduct node) into the process
        // variables so the voucher-issuance delegates can stamp it onto any voucher they issue -
        // otherwise a voucher earned for buying category X could be redeemed on any order.
        List<Long> restrictedCategoryIds = triggerResolver.findConditionTargetIds(
                campaign.getWorkflowJson(), "Condition_ContainsCategory");
        if (!restrictedCategoryIds.isEmpty()) {
            variables.put("voucherRestrictedCategoryIds", restrictedCategoryIds);
        }
        List<Long> restrictedProductIds = triggerResolver.findConditionTargetIds(
                campaign.getWorkflowJson(), "Condition_ContainsProduct");
        if (!restrictedProductIds.isEmpty()) {
            variables.put("voucherRestrictedProductIds", restrictedProductIds);
        }

        log.info("Starting Camunda process '{}' with businessKey '{}' for campaign id={} with variables keys={}",
                campaign.getBpmnProcessDefinitionKey(), businessKey, campaign.getId(), variables.keySet());

        List<ProcessDefinition> pds = repositoryService.createProcessDefinitionQuery()
                .processDefinitionKey(campaign.getBpmnProcessDefinitionKey())
                .orderByProcessDefinitionVersion().desc()
                .list();

        ProcessInstance instance;
        if (!pds.isEmpty()) {
            String processDefinitionId = pds.get(0).getId();
            log.info("Resolved process definition key '{}' to unique ID '{}' (version {})",
                    campaign.getBpmnProcessDefinitionKey(), processDefinitionId, pds.get(0).getVersion());
            if (businessKey != null) {
                instance = runtimeService.startProcessInstanceById(processDefinitionId, businessKey, variables);
            } else {
                instance = runtimeService.startProcessInstanceById(processDefinitionId, variables);
            }
        } else {
            log.warn("No deployed process definition found for key '{}'. Falling back to start by key.",
                    campaign.getBpmnProcessDefinitionKey());
            if (businessKey != null) {
                instance = runtimeService.startProcessInstanceByKey(campaign.getBpmnProcessDefinitionKey(), businessKey, variables);
            } else {
                instance = runtimeService.startProcessInstanceByKey(campaign.getBpmnProcessDefinitionKey(), variables);
            }
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
