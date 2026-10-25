package com.ecommerce.userservice.service;

import com.ecommerce.userservice.client.KeycloakAdminClient;
import com.ecommerce.userservice.dto.request.CreateUserRequest;
import com.ecommerce.userservice.dto.request.UpdateProfileRequest;
import com.ecommerce.userservice.dto.request.UpdateUserAdminRequest;
import com.ecommerce.userservice.dto.response.UserAdminDetailResponse;
import com.ecommerce.userservice.dto.response.UserProfileResponse;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.event.producer.UserEventProducer;
import com.ecommerce.userservice.exception.KeycloakSyncException;
import com.ecommerce.userservice.service.impl.UserServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.representations.idm.RoleRepresentation;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private com.ecommerce.userservice.repository.UserRepository userRepository;

    @Mock
    private KeycloakAdminClient keycloakAdminClient;

    @Mock
    private StorageService storageService;

    @Mock
    private UserEventProducer userEventProducer;

    @InjectMocks
    private UserServiceImpl userService;

    private static RoleRepresentation role(String name) {
        RoleRepresentation r = new RoleRepresentation();
        r.setName(name);
        return r;
    }

    @Test
    @DisplayName("TC_PH1_PROFILE_01: Lần đầu gọi /users/me (chưa có hồ sơ, token thiếu email) -> tự tạo hồ sơ MEMBER với email placeholder, phát sự kiện UserRegistered")
    void getCurrentUser_autoProvision() {
        when(userRepository.findByKeycloakUserId("kc-abcdef123")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(1L);
            return u;
        });

        UserProfileResponse res = userService.getCurrentUser("kc-abcdef123", null, null, null, null);

        assertEquals(1L, res.getId());
        assertEquals("kc-abcdef123@placeholder.com", res.getEmail());
        assertEquals("user_kc-abcde", res.getUsername());
        assertEquals("MEMBER", res.getCustomerTier());
        assertEquals(0, res.getLoyaltyPoints());
        verify(userEventProducer).publishUserRegistered(any(User.class));
    }

    @Test
    @DisplayName("TC_PH1_PROFILE_02: Đăng nhập bằng phương thức khác (keycloakId mới, email đã tồn tại) -> liên kết lại hồ sơ cũ, không tạo user mới; username là SĐT thì tự điền phoneNumber")
    void getCurrentUser_relinkByEmail_andSyncPhone() {
        User existing = User.builder().id(9L).keycloakUserId("kc-old").email("a@mail.com")
                .username("0912345678").fullName("A").customerTier("GOLD").loyaltyPoints(120).build();
        when(userRepository.findByKeycloakUserId("kc-new")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("a@mail.com")).thenReturn(Optional.of(existing));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        UserProfileResponse res = userService.getCurrentUser("kc-new", "a@mail.com", null, null, null);

        assertEquals(9L, res.getId());
        assertEquals("kc-new", existing.getKeycloakUserId());
        assertEquals("GOLD", res.getCustomerTier());
        assertEquals(120, res.getLoyaltyPoints());
        assertEquals("0912345678", res.getPhoneNumber());
        verify(userEventProducer, never()).publishUserRegistered(any());
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_01: Admin tạo người dùng -> tạo trên Keycloak, lưu DB hạng mặc định MEMBER, active, phát sự kiện, trả về roles từ Keycloak")
    void adminCreateUser_success() {
        CreateUserRequest req = new CreateUserRequest();
        req.setUsername("newuser");
        req.setEmail("new@mail.com");
        req.setFullName("New User");
        req.setPassword("secret123");
        req.setCustomerTier(null);
        when(keycloakAdminClient.createUser("newuser", "new@mail.com", "New User", "secret123")).thenReturn("kc-77");
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(77L);
            return u;
        });
        when(keycloakAdminClient.getUserRealmRoles("kc-77")).thenReturn(List.of(role("ROLE_CUSTOMER")));

        UserAdminDetailResponse res = userService.adminCreateUser(req);

        assertEquals(77L, res.getId());
        assertEquals("kc-77", res.getKeycloakUserId());
        assertEquals("MEMBER", res.getCustomerTier());
        assertTrue(res.isActive());
        assertFalse(res.isBlacklisted());
        assertEquals(List.of("ROLE_CUSTOMER"), res.getRoles());
        verify(userEventProducer).publishUserRegistered(any(User.class));
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_02: Admin đổi email sang email đã thuộc tài khoản khác -> IllegalArgumentException, không lưu DB, không đồng bộ Keycloak")
    void adminUpdateUser_emailConflict() {
        User target = User.builder().id(1L).keycloakUserId("kc-1").email("a@mail.com").build();
        User other = User.builder().id(2L).keycloakUserId("kc-2").email("b@mail.com").build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(target));
        when(userRepository.findByEmail("b@mail.com")).thenReturn(Optional.of(other));
        UpdateUserAdminRequest req = new UpdateUserAdminRequest();
        req.setEmail("b@mail.com");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> userService.adminUpdateUser(1L, req));
        assertTrue(ex.getMessage().contains("Email đã được sử dụng"));
        assertEquals("a@mail.com", target.getEmail());
        verify(userRepository, never()).save(any());
        verify(keycloakAdminClient, never()).updateUser(anyString(), any(), any());
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_03: Admin xóa người dùng khi Keycloak lỗi -> vẫn xóa mềm trong DB (active=false), không xóa cứng bản ghi")
    void adminDeleteUser_softDeleteEvenIfKeycloakFails() {
        User target = User.builder().id(1L).keycloakUserId("kc-1").active(true).build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(target));
        doThrow(new RuntimeException("keycloak down")).when(keycloakAdminClient).deleteUser("kc-1");

        userService.adminDeleteUser(1L);

        assertFalse(target.getActive());
        verify(userRepository).save(target);
        verify(userRepository, never()).delete(any());
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_04: Khóa tài khoản (blacklist=true) -> lưu cờ isBlacklisted và vô hiệu hóa đăng nhập trên Keycloak (enabled=false)")
    void updateBlacklist_syncsKeycloak() {
        User target = User.builder().id(1L).keycloakUserId("kc-1").isBlacklisted(false).build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(target));

        userService.updateBlacklist(1L, true);

        assertTrue(target.getIsBlacklisted());
        verify(userRepository).save(target);
        verify(keycloakAdminClient).setEnabled("kc-1", false);
    }

    @Test
    @DisplayName("TC_PH1_ADMIN_05: Đặt lại mật khẩu khi Keycloak lỗi -> ném KeycloakSyncException (502) chứ không báo thành công")
    void adminResetPassword_keycloakFailure() {
        User target = User.builder().id(1L).keycloakUserId("kc-1").build();
        when(userRepository.findById(1L)).thenReturn(Optional.of(target));
        doThrow(new RuntimeException("timeout")).when(keycloakAdminClient).setPassword("kc-1", "newpass1");

        KeycloakSyncException ex = assertThrows(KeycloakSyncException.class,
                () -> userService.adminResetPassword(1L, "newpass1"));
        assertTrue(ex.getMessage().contains("timeout"));
        ArgumentCaptor<String> pwd = ArgumentCaptor.forClass(String.class);
        verify(keycloakAdminClient).setPassword(eq("kc-1"), pwd.capture());
        assertEquals("newpass1", pwd.getValue());
    }

    @Test
    @DisplayName("UI_PH1_FR02_002: Khách đã đổi họ tên -> lần tải hồ sơ sau KHÔNG bị ghi đè bằng tên trong token Keycloak; avatar tự tải lên cũng không bị ảnh Google ghi đè")
    void getCurrentUser_keepsEditedFullNameAndAvatar() {
        User u = User.builder().id(3L).keycloakUserId("kc-3").email("c@mail.com").username("c")
                .fullName("Tên Mới").avatarUrl("http://minio/avatars/me.jpg").build();
        when(userRepository.findByKeycloakUserId("kc-3")).thenReturn(Optional.of(u));

        UserProfileResponse res = userService.getCurrentUser("kc-3", "c@mail.com", "c", "Tên Cũ Keycloak", "http://google/pic.jpg");

        assertEquals("Tên Mới", res.getFullName());
        assertEquals("http://minio/avatars/me.jpg", res.getAvatarUrl());
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("Hồ sơ còn tên placeholder ('Keycloak User') -> điền tên thật từ token")
    void getCurrentUser_fillsPlaceholderFullName() {
        User u = User.builder().id(4L).keycloakUserId("kc-4").email("d@mail.com").username("d")
                .fullName("Keycloak User").build();
        when(userRepository.findByKeycloakUserId("kc-4")).thenReturn(Optional.of(u));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        UserProfileResponse res = userService.getCurrentUser("kc-4", "d@mail.com", "d", "Nguyễn Văn D", null);

        assertEquals("Nguyễn Văn D", res.getFullName());
    }

    @Test
    @DisplayName("Đổi họ tên -> lưu DB và đồng bộ lên Keycloak; Keycloak lỗi vẫn giữ tên mới trong DB")
    void updateProfile_persistsNameAndSyncsKeycloakBestEffort() {
        User u = User.builder().id(5L).keycloakUserId("kc-5").fullName("Cũ").build();
        when(userRepository.findByKeycloakUserId("kc-5")).thenReturn(Optional.of(u));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        doThrow(new RuntimeException("keycloak down")).when(keycloakAdminClient).updateUser("kc-5", null, "Mới");

        UpdateProfileRequest req = new UpdateProfileRequest();
        req.setFullName("  Mới ");
        UserProfileResponse res = userService.updateProfile("kc-5", req);

        assertEquals("Mới", res.getFullName());
        verify(keycloakAdminClient).updateUser("kc-5", null, "Mới");
    }
}
