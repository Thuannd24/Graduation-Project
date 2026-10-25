package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.service.impl.CampaignBudgetServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Unit test CampaignBudgetServiceImpl (PH6): giữ/hoàn ngân sách chiến dịch khi phát/hết hạn voucher. */
@ExtendWith(MockitoExtension.class)
class CampaignBudgetServiceImplTest {

    @Mock private CampaignRepository campaignRepository;

    @InjectMocks
    private CampaignBudgetServiceImpl budgetService;

    @Test
    @DisplayName("TC_PH6_BUDGET_01: Giữ ngân sách: còn 100.000 giữ 50.000 -> còn 50.000 (khóa dòng FOR UPDATE); giữ 60.000 khi còn 50.000 -> IllegalStateException; hoàn voucher PERCENT trần 80.000 không vượt tổng quỹ; campaignId null bỏ qua")
    void reserve_and_release() {
        Campaign c = Campaign.builder().id(3L).totalBudget(new BigDecimal("100000")).remainingBudget(new BigDecimal("100000")).build();
        when(campaignRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(c));

        budgetService.reserveBudget(3L, new BigDecimal("50000"));
        assertEquals(0, new BigDecimal("50000").compareTo(c.getRemainingBudget()));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> budgetService.reserveBudget(3L, new BigDecimal("60000")));
        assertTrue(ex.getMessage().contains("Ngân sách chiến dịch không đủ"));
        assertEquals(0, new BigDecimal("50000").compareTo(c.getRemainingBudget()));

        budgetService.releaseReservedBudget(IssuedVoucher.builder().code("VPC-1").campaignId(3L)
                .voucherType(VoucherType.PERCENT).maxDiscountAmount(new BigDecimal("80000")).build());
        assertEquals(0, new BigDecimal("100000").compareTo(c.getRemainingBudget()));

        budgetService.reserveBudget(null, new BigDecimal("1"));
        budgetService.reserveBudget(3L, BigDecimal.ZERO);
        verify(campaignRepository, times(3)).findByIdForUpdate(3L);
        verify(campaignRepository, times(2)).save(any());
    }
}
