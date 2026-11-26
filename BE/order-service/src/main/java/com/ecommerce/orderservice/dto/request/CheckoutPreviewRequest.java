package com.ecommerce.orderservice.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutPreviewRequest {
    private String couponCode;
    private Integer pointsToRedeem;
    /** Danh sách sản phẩm mua trực tiếp (Mua ngay); null/rỗng = xem trước giỏ hàng. */
    private List<CartItemRequest> items;
}
