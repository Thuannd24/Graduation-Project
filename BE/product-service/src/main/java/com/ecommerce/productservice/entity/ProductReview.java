package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "product_reviews")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(nullable = false)
    private Integer rating;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "image_urls", columnDefinition = "TEXT")
    private String imageUrls;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "staff_reply_content", columnDefinition = "TEXT")
    private String staffReplyContent;

    @Column(name = "staff_reply_at")
    private LocalDateTime staffReplyAt;

    @Column(name = "staff_replier_id")
    private String staffReplierId;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
