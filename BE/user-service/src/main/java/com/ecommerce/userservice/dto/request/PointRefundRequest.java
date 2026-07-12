package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class PointRefundRequest {

    @NotNull
    private Long orderId;
}
