package com.ecommerce.promotionservice.controller;

import com.ecommerce.promotionservice.dto.*;
import com.ecommerce.promotionservice.service.CampaignService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class CampaignController {

    private final CampaignService campaignService;

    /**
     * POST /api/v1/admin/campaigns/validate
     * Validates a workflow graph JSON. Returns ValidationResultDto.
     * Intended to be called before "Deploy" in the Campaign Builder UI.
     */
    @PostMapping("/api/v1/admin/campaigns/validate")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<ValidationResultDto> validateWorkflow(@RequestBody WorkflowGraphDto graph) {
        ValidationResultDto result = campaignService.validateWorkflow(graph);
        if (result.isValid()) {
            return ApiResponse.success(result);
        }
        return ApiResponse.validationFailed(result.getSummary(), result);
    }

    /**
     * POST /api/v1/admin/campaigns
     * Create + deploy a campaign. Accepts either:
     *   (a) workflowJson (graph DTO serialized as JSON string) → validates + compiles internally
     *   (b) pre-compiled bpmnXml directly
     */
    @PostMapping("/api/v1/admin/campaigns")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<CampaignDto> createCampaign(@RequestBody CampaignDto campaignDto) {
        return ApiResponse.success(campaignService.createCampaign(campaignDto));
    }

    /** GET /api/v1/admin/campaigns/{id} */
    @GetMapping("/api/v1/admin/campaigns/{id}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<CampaignDto> getCampaign(@PathVariable Long id) {
        return ApiResponse.success(campaignService.getCampaign(id));
    }

    /** GET /api/v1/admin/campaigns  – all campaigns (for load modal) */
    @GetMapping("/api/v1/admin/campaigns")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<List<CampaignDto>> getAllCampaigns() {
        return ApiResponse.success(campaignService.getAllCampaigns());
    }

    /** GET /api/v1/public/campaigns/active */
    @GetMapping("/api/v1/public/campaigns/active")
    public ApiResponse<List<CampaignDto>> getActiveCampaigns() {
        return ApiResponse.success(campaignService.getActiveCampaigns());
    }

    /** DELETE /api/v1/admin/campaigns/{id} */
    @DeleteMapping("/api/v1/admin/campaigns/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<Void> deleteCampaign(@PathVariable Long id) {
        campaignService.deleteCampaign(id);
        return ApiResponse.success(null);
    }

    /** PUT /api/v1/admin/campaigns/{id}/toggle-active */
    @PutMapping("/api/v1/admin/campaigns/{id}/toggle-active")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<CampaignDto> toggleCampaignActive(
            @PathVariable Long id,
            @RequestParam("active") boolean active) {
        return ApiResponse.success(campaignService.toggleCampaignActive(id, active));
    }

    /**
     * POST /api/v1/public/campaigns/evaluate
     * Trigger a running Camunda process instance for the given processKey.
     */
    @PostMapping("/api/v1/public/campaigns/evaluate")
    public ApiResponse<Map<String, Object>> evaluateCampaign(
            @RequestParam("processKey") String processKey,
            @RequestBody Map<String, Object> variables) {
        return ApiResponse.success(campaignService.evaluateCampaign(processKey, variables));
    }
}
