package com.ecommerce.userservice.client;

import jakarta.ws.rs.core.Response;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.admin.client.resource.UsersResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Client giao tiếp với Keycloak Admin REST API.
 * Dùng service account của client "ecommerce-backend" (client_credentials).
 */
@Service
@Slf4j
public class KeycloakAdminClient {

    @Value("${keycloak.admin.server-url:http://localhost:8083}")
    private String serverUrl;

    @Value("${keycloak.admin.realm:ecommerce-realm}")
    private String realm;

    @Value("${keycloak.admin.client-id:ecommerce-backend}")
    private String clientId;

    @Value("${keycloak.admin.client-secret:ZAyFzRoBJY8nWNg5dN5XMc3fRngDIei6}")
    private String clientSecret;

    private Keycloak keycloak;

    @PostConstruct
    public void init() {
        log.info("Initializing Keycloak Admin Client - server: {}, realm: {}", serverUrl, realm);
        this.keycloak = KeycloakBuilder.builder()
                .serverUrl(serverUrl).realm(realm)
                .clientId(clientId).clientSecret(clientSecret)
                .grantType("client_credentials").build();
        try {
            keycloak.tokenManager().getAccessToken();
            log.info("Keycloak Admin Client initialized");
        } catch (Exception e) {
            log.error("Keycloak connection failed: {}", e.getMessage());
        }
    }

    private RealmResource getRealmResource() { return keycloak.realm(realm); }
    private UsersResource getUsersResource() { return getRealmResource().users(); }

    /** Tạo user trong Keycloak. ROLE_CUSTOMER được gán tự động qua default realm role. */
    public String createUser(String username, String email, String fullName, String password) {
        log.info("Creating Keycloak user: username={}, email={}", username, email);
        UserRepresentation user = new UserRepresentation();
        user.setUsername(username);
        user.setEmail(email);
        user.setFirstName(fullName);
        user.setEnabled(true);

        try (Response response = getUsersResource().create(user)) {
            if (response.getStatus() != 201) {
                String error = response.readEntity(String.class);
                throw new RuntimeException("Failed to create Keycloak user: " + error);
            }
            String userId = response.getLocation().getPath();
            userId = userId.substring(userId.lastIndexOf('/') + 1);
            log.info("Keycloak user created: userId={}", userId);
            setPassword(userId, password);
            return userId;
        }
    }

    /** Lấy thông tin user từ Keycloak. */
    public UserRepresentation getUserById(String userId) {
        try { return getUsersResource().get(userId).toRepresentation(); }
        catch (Exception e) { return null; }
    }

    /** Cập nhật thông tin user trong Keycloak. */
    public void updateUser(String userId, String email, String fullName) {
        UserResource resource = getUsersResource().get(userId);
        UserRepresentation user = resource.toRepresentation();
        if (email != null) user.setEmail(email);
        if (fullName != null) user.setFirstName(fullName);
        resource.update(user);
    }

    /** Xóa user khỏi Keycloak. */
    public void deleteUser(String userId) {
        getUsersResource().get(userId).remove();
    }

    /** Bật/tắt đăng nhập của user trong Keycloak (dùng cho khóa/mở khóa tài khoản). */
    public void setEnabled(String userId, boolean enabled) {
        UserResource resource = getUsersResource().get(userId);
        UserRepresentation user = resource.toRepresentation();
        user.setEnabled(enabled);
        resource.update(user);
    }

    /** Đặt mật khẩu mới cho user. */
    public void setPassword(String userId, String newPassword) {
        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(newPassword);
        credential.setTemporary(false);
        getUsersResource().get(userId).resetPassword(credential);
    }

    /** Lấy tất cả realm roles. */
    public List<RoleRepresentation> getAllRealmRoles() {
        try { return getRealmResource().roles().list(); }
        catch (Exception e) { return List.of(); }
    }

    /** Lấy roles hiện tại của user. */
    public List<RoleRepresentation> getUserRealmRoles(String userId) {
        try { return getUsersResource().get(userId).roles().realmLevel().listAll(); }
        catch (Exception e) { return List.of(); }
    }

    /** Gán roles cho user. */
    public void assignRoles(String userId, List<String> roleNames) {
        List<RoleRepresentation> roles = roleNames.stream()
                .map(name -> { try { return getRealmResource().roles().get(name).toRepresentation(); }
                    catch (Exception e) { return null; }})
                .filter(Objects::nonNull).collect(Collectors.toList());
        if (!roles.isEmpty())
            getUsersResource().get(userId).roles().realmLevel().add(roles);
    }

    /** Ghi đè toàn bộ roles của user. */
    public void setUserRoles(String userId, List<String> roleNames) {
        List<RoleRepresentation> current = getUserRealmRoles(userId);
        if (!current.isEmpty())
            getUsersResource().get(userId).roles().realmLevel().remove(current);
        assignRoles(userId, roleNames);
    }
}
