package com.ecommerce.userservice.service;

import com.ecommerce.userservice.client.KeycloakAdminClient;
import com.ecommerce.userservice.dto.request.CreateUserRequest;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.event.producer.UserEventProducer;
import com.ecommerce.userservice.exception.KeycloakSyncException;
import com.ecommerce.userservice.repository.UserRepository;
import com.ecommerce.userservice.service.impl.UserServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Các test khẳng định hành vi ĐÚNG nghiệp vụ mà code hiện tại vi phạm (bug thật).
 * Không chạy trong build mặc định; chạy riêng: mvn -pl user-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class UserServiceImplBugCheck {

    @Mock
    private UserRepository userRepository;

    @Mock
    private KeycloakAdminClient keycloakAdminClient;

    @Mock
    private StorageService storageService;

    @Mock
    private UserEventProducer userEventProducer;

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    @DisplayName("TC_PH1_ADMIN_06: Admin tạo user, Keycloak tạo xong nhưng lưu DB lỗi (trùng email) -> phải xóa user vừa tạo trên Keycloak (bù trừ), tránh tài khoản mồ côi")
    void adminCreateUser_dbFailure_mustCompensateKeycloak() {
        CreateUserRequest req = new CreateUserRequest();
        req.setUsername("dup");
        req.setEmail("dup@mail.com");
        req.setFullName("Dup");
        req.setPassword("secret123");
        when(keycloakAdminClient.createUser("dup", "dup@mail.com", "Dup", "secret123")).thenReturn("kc-orphan");
        when(userRepository.save(any(User.class))).thenThrow(new DataIntegrityViolationException("Duplicate entry 'dup@mail.com'"));

        assertThrows(DataIntegrityViolationException.class, () -> userService.adminCreateUser(req));

        // Kỳ vọng: tài khoản Keycloak vừa tạo được thu hồi. Thực tế: không có bước bù trừ.
        verify(keycloakAdminClient).deleteUser("kc-orphan");
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_07: Khóa tài khoản nhưng Keycloak lỗi -> phải báo lỗi KeycloakSyncException (như reset mật khẩu), không được báo 'đã khóa' khi user vẫn đăng nhập được")
    void updateBlacklist_keycloakFailure_mustNotSucceedSilently() {
        User target = User.builder().id(1L).keycloakUserId("kc-1").isBlacklisted(false).build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(target));
        doThrow(new RuntimeException("keycloak down")).when(keycloakAdminClient).setEnabled("kc-1", false);

        assertThrows(KeycloakSyncException.class, () -> userService.updateBlacklist(1L, true));
    }
}
