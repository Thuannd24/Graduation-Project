package com.ecommerce.orderservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WarrantyOtpRequest {

    @NotBlank(message = "Số điện thoại bắt buộc")
    private String phone;
}
