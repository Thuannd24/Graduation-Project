package com.ecommerce.orderservice.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Lý do hủy đơn: reasonCode thuộc OrderPolicy.CANCEL_REASONS; OTHER bắt buộc kèm reason. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CancelOrderRequest {
    private String reasonCode;
    private String reason;
}
