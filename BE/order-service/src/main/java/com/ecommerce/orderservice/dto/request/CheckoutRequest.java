package com.ecommerce.orderservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutRequest {

    @NotBlank(message = "Shipping address is required")
    private String shippingAddress;

    @NotBlank(message = "Vui lòng nhập số điện thoại người nhận.")
    private String phoneNumber;

    /** Tên người nhận hàng (lấy từ sổ địa chỉ hoặc nhập mới). Nên gửi; thiếu thì đơn không có tên người nhận. */
    @jakarta.validation.constraints.Size(max = 150, message = "Tên người nhận tối đa 150 ký tự.")
    private String recipientName;

    private String couponCode;

    /** Phí ship ước tính — dùng cho voucher FREESHIP (tùy chọn). */
    private BigDecimal shippingFee;

    /** Số điểm thưởng khách muốn đổi (1 điểm = 1.000 VND). */
    private Integer pointsToRedeem;

    private String note;
}
