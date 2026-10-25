package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.delegate.support.CampaignUserContextResolver;
import com.ecommerce.promotionservice.dto.IssueVoucherResult;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.service.VoucherIssuanceService;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Unit test IssueVoucherPercentDelegate (PH6): Camunda delegate phát voucher phần trăm. */
@ExtendWith(MockitoExtension.class)
class IssueVoucherPercentDelegateTest {

    @Mock private VoucherIssuanceService voucherIssuanceService;
    @Mock private CampaignUserContextResolver userContextResolver;
    @Mock private DelegateExecution execution;

    @InjectMocks
    private IssueVoucherPercentDelegate delegate;

    @Test
    @DisplayName("TC_PH6_DELEGATE_01: Delegate phát voucher %: đọc tham số node (10%, trần 50.000, 7 ngày, danh mục [3]), idempotencyKey = processInstanceId:activityId, ghi biến voucherCode/voucherIssued=true; thiếu user thì voucherIssued=false và không phát")
    void execute_issuesVoucher_orSkipsWithoutUser() throws Exception {
        lenient().when(execution.getVariable(anyString())).thenReturn(null);
        when(execution.getVariable("discountPercent")).thenReturn("10");
        when(execution.getVariable("maxDiscountAmount")).thenReturn(50000);
        when(execution.getVariable("expireDays")).thenReturn("7");
        when(execution.getVariable("voucherRestrictedCategoryIds")).thenReturn(List.of("3", "x"));
        when(execution.getProcessInstanceId()).thenReturn("pi-1");
        when(execution.getCurrentActivityId()).thenReturn("a1");
        when(userContextResolver.resolveUserDbId(execution)).thenReturn(Optional.of(7L));
        when(userContextResolver.resolveCampaignId(execution)).thenReturn(Optional.of(3L));
        when(voucherIssuanceService.issuePercent(eq(7L), eq(3L), eq(new BigDecimal("10")), eq(new BigDecimal("50000.0")), eq(7),
                eq(List.of(3L)), eq(List.of()), eq("pi-1:a1")))
                .thenReturn(IssueVoucherResult.builder().voucherId(88L).voucherCode("VPC-123456").voucherType(VoucherType.PERCENT)
                        .expiresAt(LocalDateTime.of(2026, 10, 24, 0, 0)).build());

        delegate.execute(execution);

        verify(execution).setVariable("voucherCode", "VPC-123456");
        verify(execution).setVariable("percentVoucherId", 88L);
        verify(execution).setVariable("voucherExpiresAt", "2026-10-24T00:00");
        verify(execution).setVariable("voucherIssued", true);

        // thiếu user
        clearInvocations(execution, voucherIssuanceService);
        when(userContextResolver.resolveUserDbId(execution)).thenReturn(Optional.empty());
        delegate.execute(execution);
        verify(execution).setVariable("voucherIssued", false);
        verifyNoInteractions(voucherIssuanceService);
    }
}
