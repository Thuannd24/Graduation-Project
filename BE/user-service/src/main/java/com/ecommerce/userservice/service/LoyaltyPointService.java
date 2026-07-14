package com.ecommerce.userservice.service;

import com.ecommerce.userservice.dto.request.PointRedeemRequest;
import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.dto.response.LoyaltyPointResponse;
import com.ecommerce.userservice.dto.response.LoyaltyTransactionDto;
import com.ecommerce.userservice.dto.response.PointRedeemResult;
import com.ecommerce.userservice.dto.response.RedeemPreviewResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;

public interface LoyaltyPointService {

    LoyaltyPointResponse adjustPoints(Long userId, PointUpdateRequest request);

    Integer getBalance(Long userId);

    Page<LoyaltyTransactionDto> getTransactionHistory(Long userId, Pageable pageable);

    RedeemPreviewResponse redeemPreview(Long userId, BigDecimal orderAmount);

    PointRedeemResult redeemForOrder(Long userId, PointRedeemRequest request);

    LoyaltyPointResponse refundForOrder(Long userId, Long orderId);
}
