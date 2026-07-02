package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressRequest {

    @NotBlank(message = "Recipient name is required")
    private String recipientName;

    @NotBlank(message = "Phone number is required")
    private String phoneNumber;

    @NotBlank(message = "Province is required")
    private String province;

    @NotBlank(message = "District/Ward is required")
    private String districtWard;

    @NotBlank(message = "Detail address is required")
    private String detailAddress;

    private Boolean isDefault;
}
