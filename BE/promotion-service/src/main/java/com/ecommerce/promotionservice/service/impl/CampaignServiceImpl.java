package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.dto.CampaignDto;
import com.ecommerce.promotionservice.dto.ValidationResultDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.service.BpmnCompilerService;
import com.ecommerce.promotionservice.service.CampaignService;
import com.ecommerce.promotionservice.service.CampaignTriggerService;
import com.ecommerce.promotionservice.service.CampaignVariableEnricher;
import com.ecommerce.promotionservice.service.WorkflowTriggerResolver;
import com.ecommerce.promotionservice.service.WorkflowValidatorService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.HistoryService;
import org.camunda.bpm.engine.RepositoryService;
import org.camunda.bpm.engine.RuntimeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CampaignServiceImpl implements CampaignService {

    private final CampaignRepository  campaignRepository;
    private final RuntimeService       runtimeService;
    private final RepositoryService    repositoryService;
    private final HistoryService       historyService;
    private final WorkflowValidatorService validatorService;
    private final BpmnCompilerService  compilerService;
    private final ObjectMapper         objectMapper;
    private final CampaignTriggerService campaignTriggerService;
    private final CampaignVariableEnricher variableEnricher;
    private final WorkflowTriggerResolver triggerResolver;

    // ── Validate ──────────────────────────────────────────────────────────────
    @Override
    public ValidationResultDto validateWorkflow(WorkflowGraphDto graph) {
        return validatorService.validate(graph);
    }

    // ── Create ─────────────────────────────────────────────────────────────────
    @Override
    @Transactional
    public CampaignDto createCampaign(CampaignDto dto) {
        log.info("Creating campaign: {}", dto.getName());

        // ── Basic field validation ────────────────────────────────────────────
        if (dto.getName() == null || dto.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Tên chiến dịch không được để trống.");
        }
        if (dto.getTotalBudget() == null || dto.getTotalBudget().compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Tổng ngân sách chiến dịch phải lớn hơn 0.");
        }
        if (dto.getStartDate() == null) {
            throw new IllegalArgumentException("Ngày bắt đầu chiến dịch không được để trống.");
        }
        if (dto.getEndDate() == null) {
            throw new IllegalArgumentException("Ngày kết thúc chiến dịch không được để trống.");
        }
        if (dto.getEndDate().isBefore(dto.getStartDate())) {
            throw new IllegalArgumentException("Ngày kết thúc phải sau ngày bắt đầu.");
        }
        if (dto.getBpmnProcessDefinitionKey() == null || dto.getBpmnProcessDefinitionKey().trim().isEmpty()) {
            throw new IllegalArgumentException("Mã quy trình Camunda (BPMN Key) không được để trống.");
        }
        if (campaignRepository.existsByBpmnProcessDefinitionKey(dto.getBpmnProcessDefinitionKey().trim())) {
            throw new IllegalArgumentException("Mã quy trình BPMN Key '" + dto.getBpmnProcessDefinitionKey().trim() + "' đã tồn tại trong hệ thống. Vui lòng nhập mã khác.");
        }

        // ── Determine BPMN XML: compile from workflowJson if not already provided ──
        String bpmnXml = dto.getBpmnXml();

        if ((bpmnXml == null || bpmnXml.trim().isEmpty()) && dto.getWorkflowJson() != null) {
            log.info("No pre-compiled BPMN XML supplied. Validating and compiling from workflowJson...");
            try {
                WorkflowGraphDto graph = objectMapper.readValue(dto.getWorkflowJson(), WorkflowGraphDto.class);

                // Validate first – reject if invalid
                ValidationResultDto validation = validatorService.validate(graph);
                if (!validation.isValid()) {
                    String errorSummary = validation.getErrors().stream()
                            .map(e -> "[" + e.getNodeId() + "] " + e.getMessage())
                            .collect(Collectors.joining("; "));
                    throw new IllegalArgumentException(
                            "Workflow không hợp lệ, không thể deploy: " + errorSummary);
                }

                bpmnXml = compilerService.compile(graph,
                        dto.getBpmnProcessDefinitionKey(), dto.getName());
                log.info("Compiled BPMN XML successfully ({} chars)", bpmnXml.length());
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                log.error("Failed to compile workflowJson to BPMN XML: {}", e.getMessage(), e);
                throw new RuntimeException("Không thể biên dịch workflow JSON sang BPMN: " + e.getMessage());
            }
        }

        if (bpmnXml == null || bpmnXml.trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "Sơ đồ quy trình BPMN XML không được để trống. Hãy cung cấp workflowJson hoặc bpmnXml.");
        }

        // ── Deploy to Camunda engine ──────────────────────────────────────────
        try {
            String resourceName = dto.getBpmnProcessDefinitionKey() + ".bpmn";
            org.camunda.bpm.engine.repository.Deployment deployment = repositoryService.createDeployment()
                    .name(dto.getName())
                    .addString(resourceName, bpmnXml)
                    .deploy();
            log.info("Deployed process '{}' to Camunda. Deployment ID: {}",
                    dto.getBpmnProcessDefinitionKey(), deployment.getId());
        } catch (Exception e) {
            log.error("Camunda deployment failed: {}", e.getMessage(), e);
            throw new RuntimeException("Camunda deployment failed: " + e.getMessage());
        }

        // ── Persist campaign ──────────────────────────────────────────────────
        String triggerType = triggerResolver.resolveTriggerType(dto.getWorkflowJson()).orElse(null);

        Campaign campaign = Campaign.builder()
                .name(dto.getName())
                .totalBudget(dto.getTotalBudget())
                .remainingBudget(dto.getTotalBudget())
                .startDate(dto.getStartDate())
                .endDate(dto.getEndDate())
                .bpmnProcessDefinitionKey(dto.getBpmnProcessDefinitionKey())
                .triggerType(triggerType)
                .active(dto.getActive() != null ? dto.getActive() : Boolean.TRUE)
                .workflowJson(dto.getWorkflowJson())
                .bpmnXml(bpmnXml)
                .build();

        campaign = campaignRepository.save(campaign);
        log.info("Persisted campaign with id={}", campaign.getId());
        return mapToDto(campaign);
    }

    // ── Read ───────────────────────────────────────────────────────────────────
    @Override
    public CampaignDto getCampaign(Long id) {
        Campaign campaign = campaignRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Campaign not found with ID: " + id));
        return mapToDto(campaign);
    }

    @Override
    public List<CampaignDto> getAllCampaigns() {
        return campaignRepository.findAll().stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @Override
    public List<CampaignDto> getActiveCampaigns() {
        LocalDateTime now = LocalDateTime.now();
        return campaignRepository.findByActiveTrueAndStartDateBeforeAndEndDateAfter(now, now).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    @Override
    @Transactional
    public void deleteCampaign(Long id) {
        campaignRepository.deleteById(id);
        log.info("Deleted campaign id={}", id);
    }

    // ── Evaluate / trigger process instance ───────────────────────────────────
    @Override
    @Transactional
    public Map<String, Object> evaluateCampaign(String processKey, Map<String, Object> variables) {
        log.info("Evaluating campaign process '{}' with variables: {}", processKey, variables);

        Map<String, Object> vars = new HashMap<>(variables);
        List<Campaign> campaigns = campaignRepository.findByBpmnProcessDefinitionKeyAndActiveTrue(processKey);
        if (!campaigns.isEmpty()) {
            return campaignTriggerService.startCampaignProcess(campaigns.get(0), vars);
        }

        variableEnricher.enrich(vars);
        var processInstance = runtimeService.startProcessInstanceByKey(processKey, vars);
        Map<String, Object> resultVariables = getVariablesSafe(processInstance.getId());
        log.info("Evaluation result variables: {}", resultVariables);
        return resultVariables;
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

    @Override
    @Transactional
    public CampaignDto toggleCampaignActive(Long id, boolean active) {
        Campaign campaign = campaignRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy chiến dịch id=" + id));
        campaign.setActive(active);
        campaign = campaignRepository.save(campaign);

        try {
            String processKey = campaign.getBpmnProcessDefinitionKey();
            if (active) {
                log.info("Activating Camunda process definition for key: {}", processKey);
                repositoryService.activateProcessDefinitionByKey(processKey, true, null);
            } else {
                log.info("Suspending Camunda process definition for key: {}", processKey);
                repositoryService.suspendProcessDefinitionByKey(processKey, true, null);
            }
        } catch (Exception e) {
            log.warn("Could not sync suspension state with Camunda Engine for processKey '{}': {}", 
                    campaign.getBpmnProcessDefinitionKey(), e.getMessage());
        }

        log.info("Toggled campaign id={} active status to {}", id, active);
        return mapToDto(campaign);
    }

    // ── Mapper ─────────────────────────────────────────────────────────────────
    private CampaignDto mapToDto(Campaign campaign) {
        return CampaignDto.builder()
                .id(campaign.getId())
                .name(campaign.getName())
                .totalBudget(campaign.getTotalBudget())
                .remainingBudget(campaign.getRemainingBudget())
                .startDate(campaign.getStartDate())
                .endDate(campaign.getEndDate())
                .bpmnProcessDefinitionKey(campaign.getBpmnProcessDefinitionKey())
                .active(campaign.getActive())
                .workflowJson(campaign.getWorkflowJson())
                .bpmnXml(campaign.getBpmnXml())
                .build();
    }
}
