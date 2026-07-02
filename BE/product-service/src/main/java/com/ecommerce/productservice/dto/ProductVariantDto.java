package com.ecommerce.productservice.dto;

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
    private BigDecimal price;
    private BigDecimal costPrice;
    private BigDecimal weight;
    private String imageUrl;
    private Boolean active;
}
