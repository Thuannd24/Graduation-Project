package com.ecommerce.userservice.service;

import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.repository.LoyaltyPointTransactionRepository;
import com.ecommerce.userservice.repository.UserRepository;
import com.ecommerce.userservice.service.impl.LoyaltyPointServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật - chạy riêng: mvn -pl user-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class LoyaltyPointServiceImplBugCheck {

    @Mock
    private UserRepository userRepository;

    @Mock
    private LoyaltyPointTransactionRepository transactionRepository;

    @InjectMocks
    private LoyaltyPointServiceImpl loyaltyPointService;

    @Test
    @DisplayName("TC_PH1_POINT_09: calculationMode không hợp lệ ('BONUS_X') phải bị từ chối, không được âm thầm xử lý như FIXED và lưu mode rác vào lịch sử")
    void adjustPoints_unknownMode_mustBeRejected() {
        User u = User.builder().id(1L).keycloakUserId("kc-1").loyaltyPoints(100).customerTier("MEMBER").build();
        lenient().when(userRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(u));
        PointUpdateRequest req = new PointUpdateRequest();
        req.setCalculationMode("BONUS_X");
        req.setPointAmount(500);

        assertThrows(IllegalArgumentException.class, () -> loyaltyPointService.adjustPoints(1L, req));
        verify(transactionRepository, never()).save(any());
    }
}
