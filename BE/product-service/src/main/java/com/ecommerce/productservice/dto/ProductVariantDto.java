package com.ecommerce.productservice.dto;

import jakarta.validation.constraints.DecimalMin;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductVariantDto {
    private Long id;
    private Long productId;
    private String sku;
    private Object variantAttr; // JSON representation of variant attributes

    @DecimalMin(value = "0.01", message = "Giá biến thể phải lớn hơn 0")
    private BigDecimal price;

    @DecimalMin(value = "0.0", message = "Giá khuyến mãi biến thể không được phép âm")
    private BigDecimal salePrice;

    @DecimalMin(value = "0.0", message = "Giá vốn biến thể không được phép âm")
    private BigDecimal costPrice;
    private BigDecimal weight;
    private String imageUrl;
    private Boolean active;
}
