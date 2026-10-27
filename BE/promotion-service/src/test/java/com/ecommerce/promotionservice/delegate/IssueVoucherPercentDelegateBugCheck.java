package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.delegate.support.CampaignUserContextResolver;
import com.ecommerce.promotionservice.service.VoucherIssuanceService;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.TransientDataAccessResourceException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở delegate Camunda. Chạy riêng: mvn -pl promotion-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class IssueVoucherPercentDelegateBugCheck {

    @Mock private VoucherIssuanceService voucherIssuanceService;
    @Mock private CampaignUserContextResolver userContextResolver;
    @Mock private DelegateExecution execution;

    @InjectMocks
    private IssueVoucherPercentDelegate delegate;

    @Test
    @DisplayName("TC_PH6_DELEGATE_02: Lỗi tạm thời khi phát voucher (DB/mạng chập chờn) phải được ném ra để Camunda job retry và tạo incident, không được nuốt lỗi rồi coi như xong (voucher mất vĩnh viễn)")
    void transientFailure_mustPropagateForCamundaRetry() {
        lenient().when(execution.getVariable(anyString())).thenReturn(null);
        lenient().when(execution.getVariable("discountPercent")).thenReturn("10");
        lenient().when(execution.getVariable("maxDiscountAmount")).thenReturn("50000");
        lenient().when(execution.getProcessInstanceId()).thenReturn("pi-2");
        lenient().when(execution.getCurrentActivityId()).thenReturn("a1");
        when(userContextResolver.resolveUserDbId(execution)).thenReturn(Optional.of(7L));
        lenient().when(userContextResolver.resolveCampaignId(execution)).thenReturn(Optional.of(3L));
        when(voucherIssuanceService.issuePercent(anyLong(), any(), any(), any(), anyInt(), anyList(), anyList(), anyString()))
                .thenThrow(new TransientDataAccessResourceException("Connection is not available, request timed out after 30000ms"));

        assertThrows(Exception.class, () -> delegate.execute(execution));
    }
}
