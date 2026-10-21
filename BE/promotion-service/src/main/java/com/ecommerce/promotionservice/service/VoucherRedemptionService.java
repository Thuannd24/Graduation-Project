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

    /**
     * Trả voucher về cho khách khi đơn bị hủy trước khi giao (kể cả đơn đã CONFIRMED/thanh toán,
     * voucher đã USED): RESERVED/USED → UNUSED nếu còn hạn, → EXPIRED (hoàn ngân sách chiến dịch)
     * nếu đã hết hạn. Idempotent: gọi lại cho cùng orderId là no-op.
     *
     * @return kết quả: RESTORED, EXPIRED, NOT_FOUND (không có voucher gắn đơn / đã trả trước đó),
     *         NOT_APPLICABLE (voucher ở trạng thái khác), IGNORED (orderId null)
     */
    String restoreByOrderId(Long orderId);
}
