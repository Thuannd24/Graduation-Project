package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.dto.CampaignDto;
import com.ecommerce.promotionservice.dto.CampaignStatsDto;
import com.ecommerce.promotionservice.dto.IssuedVoucherDto;
import com.ecommerce.promotionservice.dto.PromotionDashboardDto;
import com.ecommerce.promotionservice.dto.PublicCampaignDto;
import com.ecommerce.promotionservice.dto.ValidationResultDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.BpmnCompilerService;
import com.ecommerce.promotionservice.service.CampaignService;
import com.ecommerce.promotionservice.service.CampaignTriggerService;
import com.ecommerce.promotionservice.service.CampaignVariableEnricher;
import com.ecommerce.promotionservice.service.VoucherMaintenanceService;
import com.ecommerce.promotionservice.service.WorkflowTriggerResolver;
import com.ecommerce.promotionservice.service.WorkflowValidatorService;
import com.ecommerce.promotionservice.service.support.WorkflowBudgetHelper;
import com.ecommerce.promotionservice.service.support.BpmnKeyGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.HistoryService;
import org.camunda.bpm.engine.RepositoryService;
import org.camunda.bpm.engine.RuntimeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
    private final IssuedVoucherRepository voucherRepository;
    private final RuntimeService       runtimeService;
    private final RepositoryService    repositoryService;
    private final HistoryService       historyService;
    private final WorkflowValidatorService validatorService;
    private final BpmnCompilerService  compilerService;
    private final ObjectMapper         objectMapper;
    private final CampaignTriggerService campaignTriggerService;
    private final CampaignVariableEnricher variableEnricher;
    private final WorkflowTriggerResolver triggerResolver;
    private final VoucherMaintenanceService voucherMaintenanceService;

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
        WorkflowGraphDto workflowGraph = parseWorkflowGraph(dto.getWorkflowJson());
        BigDecimal normalizedBudget = normalizeBudget(
                WorkflowBudgetHelper.resolveTotalBudget(workflowGraph, dto.getTotalBudget()),
                workflowGraph);
        dto.setTotalBudget(normalizedBudget);
        if (dto.getStartDate() == null) {
            throw new IllegalArgumentException("Ngày bắt đầu chiến dịch không được để trống.");
        }
        if (dto.getEndDate() == null) {
            throw new IllegalArgumentException("Ngày kết thúc chiến dịch không được để trống.");
        }
        if (dto.getEndDate().isBefore(dto.getStartDate())) {
            throw new IllegalArgumentException("Ngày kết thúc phải sau ngày bắt đầu.");
        }

        String bpmnKey = dto.getBpmnProcessDefinitionKey();
        if (bpmnKey == null || bpmnKey.trim().isEmpty()) {
            bpmnKey = BpmnKeyGenerator.ensureUnique(campaignRepository, dto.getName());
            dto.setBpmnProcessDefinitionKey(bpmnKey);
            log.info("Auto-generated BPMN process key: {}", bpmnKey);
        } else {
            bpmnKey = bpmnKey.trim();
            if (campaignRepository.existsByBpmnProcessDefinitionKey(bpmnKey)) {
                throw new IllegalArgumentException(
                        "Mã quy trình BPMN Key '" + bpmnKey + "' đã tồn tại trong hệ thống.");
            }
            dto.setBpmnProcessDefinitionKey(bpmnKey);
        }

        // ── Determine BPMN XML: compile from workflowJson if not already provided ──
        String bpmnXml = dto.getBpmnXml();

        if ((bpmnXml == null || bpmnXml.trim().isEmpty()) && dto.getWorkflowJson() != null) {
            log.info("No pre-compiled BPMN XML supplied. Validating and compiling from workflowJson...");
            try {
                WorkflowGraphDto graph = workflowGraph != null
                        ? workflowGraph
                        : objectMapper.readValue(dto.getWorkflowJson(), WorkflowGraphDto.class);

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
    public List<PublicCampaignDto> getActiveCampaigns() {
        LocalDateTime now = LocalDateTime.now();
        return campaignRepository.findByActiveTrueAndStartDateBeforeAndEndDateAfter(now, now).stream()
                .map(this::mapToPublicDto)
                .collect(Collectors.toList());
    }

    // ── Update ─────────────────────────────────────────────────────────────────
    @Override
    @Transactional
    public CampaignDto updateCampaign(Long id, CampaignDto dto) {
        Campaign existing = campaignRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy chiến dịch id=" + id));

        // ── Basic field validation ────────────────────────────────────────────
        if (dto.getName() != null && dto.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Tên chiến dịch không được để trống.");
        }
        WorkflowGraphDto workflowGraph = dto.getWorkflowJson() != null && !dto.getWorkflowJson().isBlank()
                ? parseWorkflowGraph(dto.getWorkflowJson())
                : parseWorkflowGraph(existing.getWorkflowJson());
        if (dto.getTotalBudget() != null) {
            dto.setTotalBudget(normalizeBudget(
                    WorkflowBudgetHelper.resolveTotalBudget(workflowGraph, dto.getTotalBudget()),
                    workflowGraph));
        }
        if (dto.getStartDate() != null && dto.getEndDate() != null && dto.getEndDate().isBefore(dto.getStartDate())) {
            throw new IllegalArgumentException("Ngày kết thúc phải sau ngày bắt đầu.");
        }
        if (dto.getBpmnProcessDefinitionKey() != null && !dto.getBpmnProcessDefinitionKey().trim().isEmpty()) {
            String newKey = dto.getBpmnProcessDefinitionKey().trim();
            if (!newKey.equals(existing.getBpmnProcessDefinitionKey())
                    && campaignRepository.existsByBpmnProcessDefinitionKeyAndIdNot(newKey, id)) {
                throw new IllegalArgumentException("Mã BPMN Key '" + newKey + "' đã tồn tại trong hệ thống.");
            }
            existing.setBpmnProcessDefinitionKey(newKey);
        }

        if (dto.getName() != null) existing.setName(dto.getName());
        if (dto.getTotalBudget() != null) {
            BigDecimal oldTotal = existing.getTotalBudget();
            BigDecimal newTotal = dto.getTotalBudget();
            BigDecimal used = oldTotal.subtract(existing.getRemainingBudget());
            existing.setTotalBudget(newTotal);
            existing.setRemainingBudget(newTotal.subtract(used).max(BigDecimal.ZERO));
        }
        if (dto.getStartDate() != null) existing.setStartDate(dto.getStartDate());
        if (dto.getEndDate() != null) existing.setEndDate(dto.getEndDate());
        if (dto.getActive() != null) existing.setActive(dto.getActive());

        // ── Redeploy BPMN if workflow changed ─────────────────────────────────
        if (dto.getWorkflowJson() != null && !dto.getWorkflowJson().trim().isEmpty()
                && !dto.getWorkflowJson().equals(existing.getWorkflowJson())) {
            try {
                WorkflowGraphDto graph = objectMapper.readValue(dto.getWorkflowJson(), WorkflowGraphDto.class);
                ValidationResultDto validation = validatorService.validate(graph);
                if (!validation.isValid()) {
                    String errorSummary = validation.getErrors().stream()
                            .map(e -> "[" + e.getNodeId() + "] " + e.getMessage())
                            .collect(Collectors.joining("; "));
                    throw new IllegalArgumentException("Workflow không hợp lệ: " + errorSummary);
                }
                String bpmnXml = compilerService.compile(graph,
                        existing.getBpmnProcessDefinitionKey(), existing.getName());
                existing.setWorkflowJson(dto.getWorkflowJson());
                existing.setBpmnXml(bpmnXml);

                String triggerType = triggerResolver.resolveTriggerType(dto.getWorkflowJson()).orElse(null);
                existing.setTriggerType(triggerType);

                try {
                    String resourceName = existing.getBpmnProcessDefinitionKey() + ".bpmn";
                    org.camunda.bpm.engine.repository.Deployment deployment = repositoryService.createDeployment()
                            .name(existing.getName())
                            .addString(resourceName, bpmnXml)
                            .deploy();
                    log.info("Redeployed process '{}' revision. Deployment id: {}",
                            existing.getBpmnProcessDefinitionKey(), deployment.getId());
                } catch (Exception ex) {
                    log.error("Camunda re-deployment failed: {}", ex.getMessage(), ex);
                    throw new RuntimeException("Không thể triển khai lại BPMN: " + ex.getMessage());
                }
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                log.error("Failed to update workflow: {}", e.getMessage(), e);
                throw new RuntimeException("Không thể cập nhật workflow: " + e.getMessage());
            }
        }

        Campaign updated = campaignRepository.save(existing);
        log.info("Updated campaign id={}", updated.getId());
        return mapToDto(updated);
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    @Override
    @Transactional
    public void deleteCampaign(Long id) {
        campaignRepository.deleteById(id);
        log.info("Deleted campaign id={}", id);
    }

    // ── Stats ──────────────────────────────────────────────────────────────────
    @Override
    public CampaignStatsDto getCampaignStats(Long id) {
        voucherMaintenanceService.expireStaleVouchers();
        Campaign campaign = campaignRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy chiến dịch id=" + id));
        return buildCampaignStats(campaign);
    }

    @Override
    public PromotionDashboardDto getPromotionDashboard() {
        voucherMaintenanceService.expireStaleVouchers();
        List<Campaign> campaigns = campaignRepository.findAll();
        List<CampaignStatsDto> summaries = campaigns.stream()
                .map(this::buildCampaignStats)
                .collect(Collectors.toList());

        long totalIssued = summaries.stream().mapToLong(CampaignStatsDto::getTotalIssued).sum();
        long totalUsed = summaries.stream().mapToLong(CampaignStatsDto::getTotalUsed).sum();
        long totalUnused = summaries.stream().mapToLong(CampaignStatsDto::getTotalUnused).sum();
        long totalExpired = summaries.stream().mapToLong(CampaignStatsDto::getTotalExpired).sum();
        long totalReserved = summaries.stream().mapToLong(CampaignStatsDto::getTotalReserved).sum();

        BigDecimal totalBudget = campaigns.stream()
                .map(c -> c.getTotalBudget() != null ? c.getTotalBudget() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal remainingBudget = campaigns.stream()
                .map(c -> c.getRemainingBudget() != null ? c.getRemainingBudget() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        double avgConversion = summaries.stream()
                .mapToDouble(CampaignStatsDto::getConversionRate)
                .average()
                .orElse(0.0);

        return PromotionDashboardDto.builder()
                .totalCampaigns(campaigns.size())
                .activeCampaigns(campaigns.stream().filter(c -> Boolean.TRUE.equals(c.getActive())).count())
                .totalIssued(totalIssued)
                .totalUsed(totalUsed)
                .totalUnused(totalUnused)
                .totalExpired(totalExpired)
                .totalReserved(totalReserved)
                .totalPercent(voucherRepository.countByVoucherType(VoucherType.PERCENT))
                .totalFixed(voucherRepository.countByVoucherType(VoucherType.FIXED))
                .totalFreeship(voucherRepository.countByVoucherType(VoucherType.FREESHIP))
                .totalBudget(totalBudget)
                .remainingBudget(remainingBudget)
                .committedBudget(totalBudget.subtract(remainingBudget).max(BigDecimal.ZERO))
                .averageConversionRate(Math.round(avgConversion * 100.0) / 100.0)
                .campaigns(summaries)
                .build();
    }

    private CampaignStatsDto buildCampaignStats(Campaign campaign) {
        Long id = campaign.getId();
        long totalIssued = voucherRepository.countByCampaignId(id);
        long totalUnused = voucherRepository.countByCampaignIdAndStatus(id, VoucherStatus.UNUSED);
        long totalUsed = voucherRepository.countByCampaignIdAndStatus(id, VoucherStatus.USED);
        long totalExpired = voucherRepository.countByCampaignIdAndStatus(id, VoucherStatus.EXPIRED);
        long totalReserved = voucherRepository.countByCampaignIdAndStatus(id, VoucherStatus.RESERVED);

        long activeInstances = 0L;
        try {
            if (campaign.getBpmnProcessDefinitionKey() != null) {
                activeInstances = runtimeService.createProcessInstanceQuery()
                        .processDefinitionKey(campaign.getBpmnProcessDefinitionKey())
                        .active()
                        .count();
            }
        } catch (Exception ex) {
            log.warn("Không đọc được số instance đang chạy: {}", ex.getMessage());
        }

        BigDecimal totalBudget = campaign.getTotalBudget() != null ? campaign.getTotalBudget() : BigDecimal.ZERO;
        BigDecimal remainingBudget = campaign.getRemainingBudget() != null
                ? campaign.getRemainingBudget()
                : totalBudget;
        BigDecimal committedBudget = totalBudget.subtract(remainingBudget).max(BigDecimal.ZERO);
        double conversionRate = totalIssued > 0
                ? Math.round((totalUsed * 10000.0) / totalIssued) / 100.0
                : 0.0;

        return CampaignStatsDto.builder()
                .campaignId(id)
                .campaignName(campaign.getName())
                .bpmnProcessDefinitionKey(campaign.getBpmnProcessDefinitionKey())
                .triggerType(campaign.getTriggerType())
                .active(campaign.getActive())
                .startDate(campaign.getStartDate())
                .endDate(campaign.getEndDate())
                .totalBudget(totalBudget)
                .remainingBudget(remainingBudget)
                .committedBudget(committedBudget)
                .totalIssued(totalIssued)
                .totalUnused(totalUnused)
                .totalUsed(totalUsed)
                .totalExpired(totalExpired)
                .totalReserved(totalReserved)
                .totalPercent(voucherRepository.countByCampaignIdAndVoucherType(id, VoucherType.PERCENT))
                .totalFixed(voucherRepository.countByCampaignIdAndVoucherType(id, VoucherType.FIXED))
                .totalFreeship(voucherRepository.countByCampaignIdAndVoucherType(id, VoucherType.FREESHIP))
                .conversionRate(conversionRate)
                .activeProcessInstances(activeInstances)
                .build();
    }

    // ── Vouchers list per campaign ─────────────────────────────────────────────
    @Override
    public List<IssuedVoucherDto> listCampaignVouchers(Long id) {
        if (!campaignRepository.existsById(id)) {
            throw new IllegalArgumentException("Không tìm thấy chiến dịch id=" + id);
        }
        return voucherRepository.findByCampaignIdOrderByCreatedAtDesc(id).stream()
                .map(IssuedVoucherDto::from)
                .collect(Collectors.toList());
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
    private WorkflowGraphDto parseWorkflowGraph(String workflowJson) {
        if (workflowJson == null || workflowJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(workflowJson, WorkflowGraphDto.class);
        } catch (Exception ex) {
            log.warn("Cannot parse workflowJson for budget check: {}", ex.getMessage());
            return null;
        }
    }

    private BigDecimal normalizeBudget(BigDecimal budget, WorkflowGraphDto graph) {
        boolean requiresBudget = WorkflowBudgetHelper.requiresVoucherBudget(graph);
        if (requiresBudget) {
            if (budget == null || budget.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException(
                        "Quỹ ngân sách chiến dịch phải > 0 khi workflow có node Tặng Voucher. "
                                + "Thiết lập tại editor (meta.totalBudget).");
            }
            return budget;
        }
        if (budget == null || budget.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        return budget;
    }

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

    private PublicCampaignDto mapToPublicDto(Campaign campaign) {
        return PublicCampaignDto.builder()
                .id(campaign.getId())
                .name(campaign.getName())
                .startDate(campaign.getStartDate())
                .endDate(campaign.getEndDate())
                .active(campaign.getActive())
                .build();
    }
}
