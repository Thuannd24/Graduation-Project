package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductDto {
    private Long id;

    @NotBlank(message = "Tên sản phẩm không được để trống")
    private String name;

    @NotBlank(message = "Slug sản phẩm không được để trống")
    private String slug;

    private String description;
    private Object attributes; // JSON format
    private Object specsRaw; // Bản thô toàn bộ thông số crawl được, kể cả phần chưa map vào attribute chuẩn

    @NotNull(message = "Giá niêm yết không được để trống")
    @DecimalMin(value = "0.01", message = "Giá niêm yết phải lớn hơn 0")
    private BigDecimal price;

    @DecimalMin(value = "0.0", message = "Giá vốn không được phép âm")
    private BigDecimal costPrice;

    @DecimalMin(value = "0.0", message = "Giá khuyến mãi không được phép âm")
    private BigDecimal salePrice;

    private BigDecimal weight;
    private BigDecimal length;
    private BigDecimal width;
    private BigDecimal height;

    @NotNull(message = "Danh mục sản phẩm không được để trống")
    private Long categoryId;

    private Long brandId;
    private String brand;
    private String imageUrl;
    private List<String> images; // Gallery ảnh phụ
    private Integer salesCount;
    private BigDecimal ratingAvg;

    private Integer warrantyPeriod;
    private String warrantyPolicy;
    private Boolean active;

    @Valid
    private List<ProductVariantDto> variants;
    private List<String> tags;

    @AssertTrue(message = "Giá khuyến mãi phải nhỏ hơn giá niêm yết và lớn hơn 0")
    public boolean isSalePriceValid() {
        if (salePrice == null || price == null) {
            return true;
        }
        return salePrice.compareTo(BigDecimal.ZERO) > 0 && salePrice.compareTo(price) < 0;
    }
}
