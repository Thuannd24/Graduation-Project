package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import jakarta.validation.constraints.NotBlank;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttributeDto {
    private Long id;

    @NotBlank(message = "Mã thuộc tính không được để trống")
    private String code;

    @NotBlank(message = "Tên thuộc tính không được để trống")
    private String name;

    @NotBlank(message = "Kiểu dữ liệu thuộc tính không được để trống")
    private String valueType; // text, select, boolean

    private String allowedValues;

    private Boolean isColor;
}
