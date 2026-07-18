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

@Component("issueVoucherFixedDelegate")
@RequiredArgsConstructor
@Slf4j
public class IssueVoucherFixedDelegate implements JavaDelegate {

    private final VoucherIssuanceService voucherIssuanceService;
    private final CampaignUserContextResolver userContextResolver;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        var userDbId = userContextResolver.resolveUserDbId(execution);
        if (userDbId.isEmpty()) {
            log.warn("[IssueVoucherFixed] Missing user db id, skipping.");
            execution.setVariable("voucherIssued", false);
            return;
        }

        BigDecimal discountAmount = DelegateVariableHelper.getBigDecimal(execution, "discountAmount");
        BigDecimal minOrderValue = DelegateVariableHelper.getBigDecimal(execution, "minOrderValue");
        int days = DelegateVariableHelper.getInt(execution, "expireDays", 7);
        Long campaignId = userContextResolver.resolveCampaignId(execution).orElse(null);
        List<Long> restrictedCategoryIds = DelegateVariableHelper.getLongList(execution, "voucherRestrictedCategoryIds");
        List<Long> restrictedProductIds = DelegateVariableHelper.getLongList(execution, "voucherRestrictedProductIds");

        log.info("[IssueVoucherFixed] userId={} discountAmount={} minOrderValue={} expireDays={}",
                userDbId.get(), discountAmount, minOrderValue, days);

        String idempotencyKey = execution.getProcessInstanceId() + ":" + execution.getCurrentActivityId();
        try {
            IssueVoucherResult result = voucherIssuanceService.issueFixed(
                    userDbId.get(), campaignId, discountAmount, minOrderValue, days, restrictedCategoryIds, restrictedProductIds,
                    idempotencyKey);
            applyResult(execution, result);
            log.info("[IssueVoucherFixed] Issued voucher {} for user {}", result.getVoucherCode(), userDbId.get());
        } catch (Exception ex) {
            log.error("[IssueVoucherFixed] Failed: {}", ex.getMessage());
            execution.setVariable("voucherIssued", false);
        }
    }

    private void applyResult(DelegateExecution execution, IssueVoucherResult result) {
        String expiresAt = result.getExpiresAt() != null ? result.getExpiresAt().toString() : null;
        execution.setVariable("voucherCode", result.getVoucherCode());
        execution.setVariable("voucherId", result.getVoucherId());
        execution.setVariable("voucherExpiresAt", expiresAt);
        execution.setVariable("fixedVoucherCode", result.getVoucherCode());
        execution.setVariable("fixedVoucherId", result.getVoucherId());
        execution.setVariable("fixedVoucherExpiresAt", expiresAt);
        execution.setVariable("voucherIssued", true);
    }
}
