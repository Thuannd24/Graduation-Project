package com.ecommerce.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Bảng ghi nhận hành vi thô (xem sản phẩm / thao tác giỏ hàng) phục vụ pipeline churn-risk
 * detection (xem docs/canvas/churn-risk-implementation-plan.md Phase 2). Entity này CHỈ để
 * Hibernate `ddl-auto: update` tự tạo/quản lý schema — order-service không tự ghi vào bảng này,
 * việc ghi do forecast-service/behavior_consumer.py (Phase 4) thực hiện qua raw SQL sau khi
 * consume Kafka topic `product-viewed-events`/`cart-updated-events`.
 *
 * `itemId`/`categoryId` KHÔNG dùng {@code @JoinColumn}/FK dù trỏ tới dữ liệu của product-service:
 * mỗi microservice sở hữu DB riêng, ràng buộc FK xuyên service là phản pattern (không thể đảm
 * bảo toàn vẹn tham chiếu khi 2 DB độc lập) — giữ như BIGINT tham chiếu mềm.
 */
@Entity
@Table(
        name = "user_events",
        indexes = {
                @Index(name = "idx_user_events_user_created", columnList = "user_id, created_at"),
                @Index(name = "idx_user_events_session", columnList = "session_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", length = 100)
    private String userId;

    @Column(name = "session_id", length = 100)
    private String sessionId;

    @Column(name = "item_id")
    private Long itemId;

    @Column(name = "category_id")
    private Long categoryId;

    @Column(name = "action_type", length = 30, nullable = false)
    private String actionType;

    @Column(name = "weight")
    private Double weight;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
