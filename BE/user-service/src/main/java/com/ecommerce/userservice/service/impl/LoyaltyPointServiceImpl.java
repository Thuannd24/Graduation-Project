package com.ecommerce.userservice.service.impl;

import com.ecommerce.userservice.domain.LoyaltyPointPolicy;
import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.dto.response.LoyaltyPointResponse;
import com.ecommerce.userservice.dto.response.LoyaltyTransactionDto;
import com.ecommerce.userservice.entity.LoyaltyPointTransaction;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.LoyaltyPointTransactionRepository;
import com.ecommerce.userservice.repository.UserRepository;
import com.ecommerce.userservice.service.LoyaltyPointService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
@Slf4j
public class LoyaltyPointServiceImpl implements LoyaltyPointService {

    private final UserRepository userRepository;
    private final LoyaltyPointTransactionRepository transactionRepository;

    @Override
    @Transactional
    public LoyaltyPointResponse adjustPoints(Long userId, PointUpdateRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        String mode = normalizeMode(request.getCalculationMode());
        int delta;
        String detail;

        switch (mode) {
            case LoyaltyPointPolicy.MODE_ORDER_SPEND -> {
                BigDecimal orderAmount = request.getOrderAmount();
                if (orderAmount == null || orderAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new IllegalArgumentException(
                            "ORDER_SPEND yêu cầu orderAmount > 0 (giá trị đơn hàng sau giảm giá).");
                }
                int earned = LoyaltyPointPolicy.calculateEarnFromOrderSpend(
                        orderAmount, user.getCustomerTier());
                int bonus = request.getPointAmount() != null ? request.getPointAmount() : 0;
                delta = earned + bonus;
                detail = String.format(
                        "ORDER_SPEND: %s VND → %d điểm (×%.1f %s)%s",
                        orderAmount,
                        earned,
                        LoyaltyPointPolicy.tierMultiplier(user.getCustomerTier()),
                        user.getCustomerTier(),
                        bonus > 0 ? " + bonus " + bonus : "");
            }
            default -> {
                if (request.getPointAmount() == null || request.getPointAmount() == 0) {
                    throw new IllegalArgumentException(
                            "FIXED yêu cầu pointAmount khác 0 (dương = cộng, âm = trừ).");
                }
                delta = request.getPointAmount();
                detail = "FIXED: " + delta + " điểm";
            }
        }

        int currentBalance = user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0;
        int newBalance = currentBalance + delta;
        if (newBalance < 0) {
            throw new IllegalArgumentException(
                    "Số dư điểm không đủ. Hiện có " + currentBalance + ", yêu cầu thay đổi " + delta);
        }

        user.setLoyaltyPoints(newBalance);
        userRepository.save(user);

        String sourceType = request.getSourceType() != null ? request.getSourceType() : "CAMPAIGN";
        String referenceId = buildReferenceId(request);

        LoyaltyPointTransaction tx = LoyaltyPointTransaction.builder()
                .userId(userId)
                .delta(delta)
                .balanceAfter(newBalance)
                .calculationMode(mode)
                .sourceType(sourceType)
                .referenceId(referenceId)
                .orderId(request.getOrderId())
                .campaignId(request.getCampaignId())
                .description(request.getReason() != null ? request.getReason() : detail)
                .build();
        transactionRepository.save(tx);

        log.info("Loyalty points adjusted userId={} delta={} balance={} mode={}",
                userId, delta, newBalance, mode);

        return LoyaltyPointResponse.builder()
                .userId(userId)
                .pointsApplied(delta)
                .newPointBalance(newBalance)
                .calculationMode(mode)
                .calculationDetail(detail)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Integer getBalance(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<LoyaltyTransactionDto> getTransactionHistory(Long userId, Pageable pageable) {
        return transactionRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(tx -> LoyaltyTransactionDto.builder()
                        .id(tx.getId())
                        .delta(tx.getDelta())
                        .balanceAfter(tx.getBalanceAfter())
                        .calculationMode(tx.getCalculationMode())
                        .sourceType(tx.getSourceType())
                        .description(tx.getDescription())
                        .createdAt(tx.getCreatedAt())
                        .build());
    }

    private String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return LoyaltyPointPolicy.MODE_FIXED;
        }
        return mode.trim().toUpperCase();
    }

    private String buildReferenceId(PointUpdateRequest request) {
        if (request.getCampaignId() != null) {
            return "campaign:" + request.getCampaignId();
        }
        if (request.getOrderId() != null) {
            return "order:" + request.getOrderId();
        }
        return null;
    }
}
