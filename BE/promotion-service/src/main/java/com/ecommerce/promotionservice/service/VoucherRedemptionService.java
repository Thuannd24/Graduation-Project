package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;

public interface VoucherRedemptionService {

    /** Xem trước giảm giá — không đổi trạng thái voucher. */
    VoucherApplyResult preview(VoucherApplyRequest request);

    /** Validate + đặt RESERVED gắn orderId. */
    VoucherApplyResult apply(VoucherApplyRequest request);

    /** RESERVED → USED sau thanh toán thành công. */
    void redeemByOrderId(Long orderId);

    /** RESERVED → UNUSED khi hủy đơn / thanh toán thất bại. */
    void releaseByOrderId(Long orderId);
}
