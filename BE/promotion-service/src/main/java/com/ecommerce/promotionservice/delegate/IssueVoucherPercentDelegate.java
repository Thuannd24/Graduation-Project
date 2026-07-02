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

@Component("issueVoucherPercentDelegate")
@RequiredArgsConstructor
@Slf4j
public class IssueVoucherPercentDelegate implements JavaDelegate {

    private final VoucherIssuanceService voucherIssuanceService;
    private final CampaignUserContextResolver userContextResolver;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        var userDbId = userContextResolver.resolveUserDbId(execution);
        if (userDbId.isEmpty()) {
            log.warn("[IssueVoucherPercent] Missing user db id, skipping.");
            execution.setVariable("voucherIssued", false);
            return;
        }

        BigDecimal percent = DelegateVariableHelper.getBigDecimal(execution, "discountPercent");
        BigDecimal maxAmt = DelegateVariableHelper.getBigDecimal(execution, "maxDiscountAmount");
        int days = DelegateVariableHelper.getInt(execution, "expireDays", 7);
        Long campaignId = userContextResolver.resolveCampaignId(execution).orElse(null);

        log.info("[IssueVoucherPercent] userId={} discount={}% maxAmt={} expireDays={}",
                userDbId.get(), percent, maxAmt, days);

        try {
            IssueVoucherResult result = voucherIssuanceService.issuePercent(
                    userDbId.get(), campaignId, percent, maxAmt, days);
            applyResult(execution, result);
            log.info("[IssueVoucherPercent] Issued voucher {} for user {}", result.getVoucherCode(), userDbId.get());
        } catch (Exception ex) {
            log.error("[IssueVoucherPercent] Failed: {}", ex.getMessage());
            execution.setVariable("voucherIssued", false);
        }
    }

    private void applyResult(DelegateExecution execution, IssueVoucherResult result) {
        execution.setVariable("voucherCode", result.getVoucherCode());
        execution.setVariable("voucherId", result.getVoucherId());
        execution.setVariable("voucherExpiresAt", result.getExpiresAt() != null ? result.getExpiresAt().toString() : null);
        execution.setVariable("voucherIssued", true);
    }
}
