package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoryAttributeDto {
    private Long id;
    private Long categoryId;
    private Long attributeId;
    
    // Auxiliary fields for convenience
    private String attributeCode;
    private String attributeName;
    private String attributeValueType;
    private String attributeAllowedValues;
    private Boolean attributeIsColor;
    
    private Boolean isVariant;
    private Boolean isRequired;
}
