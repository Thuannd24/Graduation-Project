package com.ecommerce.inventoryservice.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RestockRequestDto {

    @NotNull(message = "Vui lòng nhập số lượng nhập kho.")
    @Min(value = 1, message = "Số lượng nhập kho phải là số nguyên dương.")
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer quantity;

    private String supplier;
    private String note;
}
