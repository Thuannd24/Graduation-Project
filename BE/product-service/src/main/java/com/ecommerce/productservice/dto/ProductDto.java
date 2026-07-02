package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
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

    @NotNull(message = "Giá bán không được để trống")
    @DecimalMin(value = "0.0", message = "Giá bán không được phép âm")
    private BigDecimal price;

    @DecimalMin(value = "0.0", message = "Giá gốc không được phép âm")
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

    @NotBlank(message = "Trạng thái sản phẩm không được để trống")
    private String status; // DRAFT, PUBLISHED, OUT_OF_STOCK, ARCHIVED

    private Integer warrantyPeriod;
    private String warrantyPolicy;
    private Boolean active;
    private List<ProductVariantDto> variants;
    private List<String> tags;
}
