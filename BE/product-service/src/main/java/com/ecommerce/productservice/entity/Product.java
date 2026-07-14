package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true, nullable = false)
    private String slug;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "LONGTEXT")
    private String attributes;

    // Bản chụp nguyên văn toàn bộ thông số từ nguồn crawl (kể cả label không map được vào Attribute chuẩn),
    // dùng làm nguồn dự phòng để backfill attribute mới sau này mà không cần crawl lại.
    @Column(name = "specs_raw", columnDefinition = "LONGTEXT")
    private String specsRaw;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal price;

    @Column(name = "cost_price", nullable = false, precision = 19, scale = 2)
    @Builder.Default
    private BigDecimal costPrice = BigDecimal.ZERO;

    @Column(name = "sale_price", precision = 19, scale = 2)
    private BigDecimal salePrice;

    @Column(precision = 10, scale = 3)
    private BigDecimal weight;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "brand_id")
    private Long brandId;

    private String brand; // Tên nhãn hàng (dùng để truy vấn nhanh hoặc fallback)

    @Column(name = "image_url", columnDefinition = "TEXT")
    private String imageUrl;

    // Kích thước vận chuyển (cm) - rất quan trọng cho các DV vận chuyển GHN/GHTK
    @Column(precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal length = BigDecimal.ZERO;

    @Column(precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal width = BigDecimal.ZERO;

    @Column(precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal height = BigDecimal.ZERO;

    // Trạng thái sản phẩm
    @Column(name = "status", nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ProductStatus status = ProductStatus.DRAFT;

    // Thông tin bảo hành
    @Column(name = "warranty_period")
    private Integer warrantyPeriod; // số tháng bảo hành

    @Column(name = "warranty_policy", columnDefinition = "TEXT")
    private String warrantyPolicy;

    @Column(name = "sales_count")
    @Builder.Default
    private Integer salesCount = 0;

    @Column(name = "rating_avg", precision = 3, scale = 2)
    @Builder.Default
    private BigDecimal ratingAvg = BigDecimal.ZERO;

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
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
