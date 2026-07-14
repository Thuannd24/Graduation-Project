package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.CampaignDto;
import com.ecommerce.promotionservice.dto.CampaignStatsDto;
import com.ecommerce.promotionservice.dto.IssuedVoucherDto;
import com.ecommerce.promotionservice.dto.PromotionDashboardDto;
import com.ecommerce.promotionservice.dto.PublicCampaignDto;
import com.ecommerce.promotionservice.dto.ValidationResultDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;

import java.util.List;
import java.util.Map;

public interface CampaignService {

    /** Validate a workflow graph JSON against all BPMN / business rules. */
    ValidationResultDto validateWorkflow(WorkflowGraphDto graph);

    /**
     * Compile a validated workflow graph to Camunda BPMN XML,
     * deploy it to the Camunda engine, persist the Campaign, and return the DTO.
     */
    CampaignDto createCampaign(CampaignDto dto);

    /**
     * Update an existing campaign. If workflowJson changes, re-validate and re-compile,
     * then redeploy a new revision to the Camunda engine (same processKey → new version).
     */
    CampaignDto updateCampaign(Long id, CampaignDto dto);

    CampaignDto getCampaign(Long id);

    List<CampaignDto> getAllCampaigns();

    List<PublicCampaignDto> getActiveCampaigns();

    void deleteCampaign(Long id);

    /** Active/Suspend campaign and synchronize with Camunda process definition. */
    CampaignDto toggleCampaignActive(Long id, boolean active);

    /** Start a Camunda process instance for the given processKey with runtime variables. */
    Map<String, Object> evaluateCampaign(String processKey, Map<String, Object> variables);

    /** Return runtime statistics for a campaign (issued/used vouchers, budget usage). */
    CampaignStatsDto getCampaignStats(Long id);

    /** Aggregate promotion dashboard across all campaigns. */
    PromotionDashboardDto getPromotionDashboard();

    /** List all vouchers issued by this campaign. */
    List<IssuedVoucherDto> listCampaignVouchers(Long id);
}
