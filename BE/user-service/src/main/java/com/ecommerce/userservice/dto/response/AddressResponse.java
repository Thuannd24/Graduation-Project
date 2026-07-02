package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressResponse {

    private Long id;
    private String recipientName;
    private String phoneNumber;
    private String province;
    private String districtWard;
    private String detailAddress;
    private Boolean isDefault;
    private LocalDateTime createdAt;
}
