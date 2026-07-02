package com.ecommerce.orderservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WarrantyItemResponse {
    private Long orderId;
    private Long productId;
    private String productName;
    private String variantAttr;       // JSON string: {"color":"Đen","storage":"256GB"}
    private String productImage;
    private LocalDate purchaseDate;   // Ngày mua (từ order.createdAt)
    private Integer warrantyMonths;   // Số tháng bảo hành (từ product-service)
    private LocalDate warrantyExpiry; // Ngày hết bảo hành
    private boolean active;           // Còn trong thời hạn bảo hành
    private long daysRemaining;       // Số ngày còn lại (âm nếu đã hết hạn)
}
