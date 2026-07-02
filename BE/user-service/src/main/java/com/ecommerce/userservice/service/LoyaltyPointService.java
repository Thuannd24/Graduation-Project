package com.ecommerce.userservice.service;

import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.dto.response.LoyaltyPointResponse;
import com.ecommerce.userservice.dto.response.LoyaltyTransactionDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LoyaltyPointService {

    LoyaltyPointResponse adjustPoints(Long userId, PointUpdateRequest request);

    Integer getBalance(Long userId);

    Page<LoyaltyTransactionDto> getTransactionHistory(Long userId, Pageable pageable);
}
