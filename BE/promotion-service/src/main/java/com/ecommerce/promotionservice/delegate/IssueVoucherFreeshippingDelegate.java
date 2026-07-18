package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.delegate.support.CampaignUserContextResolver;
import com.ecommerce.promotionservice.delegate.support.DelegateVariableHelper;
import com.ecommerce.promotionservice.dto.IssueVoucherResult;
import com.ecommerce.promotionservice.service.VoucherIssuanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

@Component("issueVoucherFreeshippingDelegate")
@RequiredArgsConstructor
@Slf4j
public class IssueVoucherFreeshippingDelegate implements JavaDelegate {

    private final VoucherIssuanceService voucherIssuanceService;
    private final CampaignUserContextResolver userContextResolver;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        var userDbId = userContextResolver.resolveUserDbId(execution);
        if (userDbId.isEmpty()) {
            log.warn("[IssueVoucherFreeship] Missing user db id, skipping.");
            execution.setVariable("voucherIssued", false);
            return;
        }

        BigDecimal maxShip = DelegateVariableHelper.getBigDecimal(execution, "maxShippingDiscount");
        int days = DelegateVariableHelper.getInt(execution, "expireDays", 7);
        Long campaignId = userContextResolver.resolveCampaignId(execution).orElse(null);
        List<Long> restrictedCategoryIds = DelegateVariableHelper.getLongList(execution, "voucherRestrictedCategoryIds");
        List<Long> restrictedProductIds = DelegateVariableHelper.getLongList(execution, "voucherRestrictedProductIds");

        log.info("[IssueVoucherFreeship] userId={} maxShippingDiscount={} expireDays={}",
                userDbId.get(), maxShip, days);

        String idempotencyKey = execution.getProcessInstanceId() + ":" + execution.getCurrentActivityId();
        try {
            IssueVoucherResult result = voucherIssuanceService.issueFreeship(
                    userDbId.get(), campaignId, maxShip, days, restrictedCategoryIds, restrictedProductIds,
                    idempotencyKey);
            applyResult(execution, result);
            log.info("[IssueVoucherFreeship] Issued voucher {} for user {}", result.getVoucherCode(), userDbId.get());
        } catch (Exception ex) {
            log.error("[IssueVoucherFreeship] Failed: {}", ex.getMessage());
            execution.setVariable("voucherIssued", false);
        }
    }

    private void applyResult(DelegateExecution execution, IssueVoucherResult result) {
        String expiresAt = result.getExpiresAt() != null ? result.getExpiresAt().toString() : null;
        execution.setVariable("voucherCode", result.getVoucherCode());
        execution.setVariable("voucherId", result.getVoucherId());
        execution.setVariable("voucherExpiresAt", expiresAt);
        execution.setVariable("freeshipVoucherCode", result.getVoucherCode());
        execution.setVariable("freeshipVoucherId", result.getVoucherId());
        execution.setVariable("freeshipVoucherExpiresAt", expiresAt);
        execution.setVariable("voucherIssued", true);
    }
}
