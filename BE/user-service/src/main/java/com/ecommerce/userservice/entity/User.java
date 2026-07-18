package com.ecommerce.userservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "keycloak_user_id", unique = true, nullable = false)
    private String keycloakUserId;

    @Column(name = "username", unique = true, nullable = false)
    private String username;

    @Column(name = "email", unique = true, nullable = false)
    private String email;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "phone_number")
    private String phoneNumber;

    @Column(name = "avatar_url", length = 500)
    private String avatarUrl;

    // hạng thành viên (VIP, GOLD, SILVER, MEMBER)
    @Column(name = "customer_tier")
    @Builder.Default
    private String customerTier = "MEMBER";

    // phân khúc hành vi (Loyal, AtRisk, New, Dormant, Churned)
    @Column(name = "segmentation_label")
    private String segmentationLabel;

    // black-list để ngăn chặn mua hàng
    @Column(name = "is_blacklisted")
    @Builder.Default
    private Boolean isBlacklisted = false;

    /** Số dư điểm thưởng tích lũy hiện tại. */
    @Column(name = "loyalty_points", nullable = false)
    @Builder.Default
    private Integer loyaltyPoints = 0;

    @Column(name = "active")
    @Builder.Default
    private Boolean active = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (customerTier == null)
            customerTier = "MEMBER";
        if (isBlacklisted == null)
            isBlacklisted = false;
        if (loyaltyPoints == null)
            loyaltyPoints = 0;
        if (active == null)
            active = true;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
