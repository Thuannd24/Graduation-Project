package com.ecommerce.paymentservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentConfigResponse {
    /** Phương thức thanh toán được hỗ trợ: VNPAY, COD. */
    private List<String> supportedMethods;
    /** COD chỉ cho đơn có thành tiền <= giá trị này (VND). */
    private BigDecimal codMaxAmount;
}
