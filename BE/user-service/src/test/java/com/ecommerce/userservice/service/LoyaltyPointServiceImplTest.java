package com.ecommerce.userservice.service;

import com.ecommerce.userservice.domain.LoyaltyPointPolicy;
import com.ecommerce.userservice.dto.request.PointRedeemRequest;
import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.dto.response.LoyaltyPointResponse;
import com.ecommerce.userservice.dto.response.PointRedeemResult;
import com.ecommerce.userservice.entity.LoyaltyPointTransaction;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.LoyaltyPointTransactionRepository;
import com.ecommerce.userservice.repository.UserRepository;
import com.ecommerce.userservice.service.impl.LoyaltyPointServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LoyaltyPointServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private LoyaltyPointTransactionRepository transactionRepository;

    @InjectMocks
    private LoyaltyPointServiceImpl loyaltyPointService;

    private User user(long id, int points, String tier) {
        return User.builder().id(id).keycloakUserId("kc-" + id).username("u" + id).email("u" + id + "@mail.com")
                .loyaltyPoints(points).customerTier(tier).build();
    }

    private PointUpdateRequest fixed(Integer amount) {
        PointUpdateRequest r = new PointUpdateRequest();
        r.setCalculationMode("FIXED");
        r.setPointAmount(amount);
        return r;
    }

    @Test
    @DisplayName("TC_PH1_POINT_01: Cộng điểm FIXED +100 cho user có 500 điểm -> số dư 600, ghi giao dịch kèm referenceId campaign")
    void adjustPoints_fixed_addsAndRecordsTransaction() {
        User u = user(1L, 500, "MEMBER");
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        PointUpdateRequest req = fixed(100);
        req.setCampaignId(5L);

        LoyaltyPointResponse res = loyaltyPointService.adjustPoints(1L, req);

        assertEquals(100, res.getPointsApplied());
        assertEquals(600, res.getNewPointBalance());
        assertEquals(600, u.getLoyaltyPoints());
        verify(userRepository).save(u);
        ArgumentCaptor<LoyaltyPointTransaction> tx = ArgumentCaptor.forClass(LoyaltyPointTransaction.class);
        verify(transactionRepository).save(tx.capture());
        assertEquals(100, tx.getValue().getDelta());
        assertEquals(600, tx.getValue().getBalanceAfter());
        assertEquals("campaign:5", tx.getValue().getReferenceId());
        assertEquals("CAMPAIGN", tx.getValue().getSourceType());
    }

    @Test
    @DisplayName("TC_PH1_POINT_02: FIXED với pointAmount = 0 hoặc null bị từ chối (IllegalArgumentException), không lưu gì")
    void adjustPoints_fixedZeroOrNull_rejected() {
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(user(1L, 500, "MEMBER")));

        assertThrows(IllegalArgumentException.class, () -> loyaltyPointService.adjustPoints(1L, fixed(0)));
        assertThrows(IllegalArgumentException.class, () -> loyaltyPointService.adjustPoints(1L, fixed(null)));
        verify(userRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH1_POINT_03: Trừ điểm vượt số dư (500 - 600) bị từ chối, số dư giữ nguyên; user không tồn tại -> ResourceNotFoundException")
    void adjustPoints_insufficientBalance_rejected() {
        User u = user(1L, 500, "MEMBER");
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.empty());

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> loyaltyPointService.adjustPoints(1L, fixed(-600)));
        assertTrue(ex.getMessage().contains("Số dư điểm không đủ"));
        assertEquals(500, u.getLoyaltyPoints());
        verify(userRepository, never()).save(any());

        assertThrows(ResourceNotFoundException.class, () -> loyaltyPointService.adjustPoints(2L, fixed(10)));
    }

    @Test
    @DisplayName("TC_PH1_POINT_04: ORDER_SPEND đơn 1.000.000đ hạng VIP + bonus 10 -> cộng 210 điểm; orderAmount <= 0 bị từ chối")
    void adjustPoints_orderSpend() {
        User u = user(1L, 0, "VIP");
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        PointUpdateRequest req = new PointUpdateRequest();
        req.setCalculationMode("order_spend");
        req.setOrderAmount(new BigDecimal("1000000"));
        req.setPointAmount(10);
        req.setOrderId(77L);

        LoyaltyPointResponse res = loyaltyPointService.adjustPoints(1L, req);
        assertEquals(210, res.getPointsApplied());
        assertEquals(210, res.getNewPointBalance());
        assertEquals("ORDER_SPEND", res.getCalculationMode());

        PointUpdateRequest bad = new PointUpdateRequest();
        bad.setCalculationMode("ORDER_SPEND");
        bad.setOrderAmount(BigDecimal.ZERO);
        assertThrows(IllegalArgumentException.class, () -> loyaltyPointService.adjustPoints(1L, bad));
    }

    @Test
    @DisplayName("TC_PH1_POINT_05: Đổi 200 điểm cho đơn 300.000đ (số dư 500) -> giảm 200.000đ, ghi giao dịch REDEMPTION delta -200")
    void redeemForOrder_success() {
        User u = user(1L, 500, "MEMBER");
        when(transactionRepository.findFirstByOrderIdAndSourceType(10L, LoyaltyPointPolicy.SOURCE_REDEMPTION))
                .thenReturn(Optional.empty());
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        PointRedeemRequest req = new PointRedeemRequest();
        req.setOrderId(10L);
        req.setPointsToRedeem(200);
        req.setOrderAmount(new BigDecimal("300000"));

        PointRedeemResult res = loyaltyPointService.redeemForOrder(1L, req);

        assertEquals(200, res.getPointsRedeemed());
        assertEquals(0, new BigDecimal("200000").compareTo(res.getDiscountAmount()));
        assertEquals(300, res.getNewPointBalance());
        ArgumentCaptor<LoyaltyPointTransaction> tx = ArgumentCaptor.forClass(LoyaltyPointTransaction.class);
        verify(transactionRepository).save(tx.capture());
        assertEquals(-200, tx.getValue().getDelta());
        assertEquals("REDEMPTION", tx.getValue().getSourceType());
        assertEquals(10L, tx.getValue().getOrderId());
    }

    @Test
    @DisplayName("TC_PH1_POINT_06: Đổi điểm vượt mức tối đa (đơn 150.000đ chỉ cho tối đa 150 điểm, yêu cầu 200) bị từ chối")
    void redeemForOrder_exceedsMax_rejected() {
        when(transactionRepository.findFirstByOrderIdAndSourceType(11L, LoyaltyPointPolicy.SOURCE_REDEMPTION))
                .thenReturn(Optional.empty());
        when(userRepository.findById(1L)).thenReturn(Optional.of(user(1L, 500, "MEMBER")));
        PointRedeemRequest req = new PointRedeemRequest();
        req.setOrderId(11L);
        req.setPointsToRedeem(200);
        req.setOrderAmount(new BigDecimal("150000"));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> loyaltyPointService.redeemForOrder(1L, req));
        assertTrue(ex.getMessage().contains("150"));
        verify(userRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH1_POINT_07: Gọi đổi điểm lặp lại cho cùng orderId (idempotent) -> trả kết quả cũ, không trừ điểm lần 2")
    void redeemForOrder_idempotent() {
        LoyaltyPointTransaction old = LoyaltyPointTransaction.builder()
                .userId(1L).orderId(12L).delta(-100).balanceAfter(400).sourceType("REDEMPTION").build();
        when(transactionRepository.findFirstByOrderIdAndSourceType(12L, LoyaltyPointPolicy.SOURCE_REDEMPTION))
                .thenReturn(Optional.of(old));
        PointRedeemRequest req = new PointRedeemRequest();
        req.setOrderId(12L);
        req.setPointsToRedeem(100);
        req.setOrderAmount(new BigDecimal("500000"));

        PointRedeemResult res = loyaltyPointService.redeemForOrder(1L, req);

        assertEquals(100, res.getPointsRedeemed());
        assertEquals(400, res.getNewPointBalance());
        assertEquals(0, new BigDecimal("100000").compareTo(res.getDiscountAmount()));
        verify(userRepository, never()).findByIdForUpdate(anyLong());
        verify(transactionRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH1_POINT_08: Hoàn điểm khi hủy đơn: lần đầu cộng lại 100 điểm (REFUND); đơn đã hoàn rồi thì không cộng lần 2")
    void refundForOrder_onceOnly() {
        User u = user(1L, 400, "MEMBER");
        LoyaltyPointTransaction redemption = LoyaltyPointTransaction.builder()
                .userId(1L).orderId(13L).delta(-100).balanceAfter(400).sourceType("REDEMPTION").build();
        when(transactionRepository.findFirstByOrderIdAndSourceType(13L, LoyaltyPointPolicy.SOURCE_REDEMPTION))
                .thenReturn(Optional.of(redemption));
        when(transactionRepository.findFirstByOrderIdAndSourceType(13L, LoyaltyPointPolicy.SOURCE_REFUND))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(LoyaltyPointTransaction.builder().delta(100).sourceType("REFUND").build()));
        when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        LoyaltyPointResponse first = loyaltyPointService.refundForOrder(1L, 13L);
        assertEquals(100, first.getPointsApplied());
        assertEquals(500, first.getNewPointBalance());

        LoyaltyPointResponse second = loyaltyPointService.refundForOrder(1L, 13L);
        assertEquals(0, second.getPointsApplied());
        assertEquals(500, second.getNewPointBalance());
        verify(transactionRepository, times(1)).save(any());
    }
}
