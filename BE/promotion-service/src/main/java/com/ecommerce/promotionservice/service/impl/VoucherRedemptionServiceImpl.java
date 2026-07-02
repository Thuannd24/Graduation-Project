package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.InternalUserIdResolver;
import com.ecommerce.promotionservice.service.VoucherRedemptionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class VoucherRedemptionServiceImpl implements VoucherRedemptionService {

    private final IssuedVoucherRepository voucherRepository;
    private final InternalUserIdResolver userIdResolver;

    @Override
    @Transactional(readOnly = true)
    public VoucherApplyResult preview(VoucherApplyRequest request) {
        return evaluate(request, false);
    }

    @Override
    @Transactional
    public VoucherApplyResult apply(VoucherApplyRequest request) {
        if (request.getOrderId() == null) {
            return VoucherApplyResult.invalid("orderId bắt buộc khi apply voucher.");
        }
        return evaluate(request, true);
    }

    @Override
    @Transactional
    public void redeemByOrderId(Long orderId) {
        if (orderId == null) {
            return;
        }
        voucherRepository.findByUsedOrderId(orderId).ifPresent(voucher -> {
            if (voucher.getStatus() == VoucherStatus.RESERVED) {
                voucher.setStatus(VoucherStatus.USED);
                voucher.setUsedAt(LocalDateTime.now());
                voucherRepository.save(voucher);
                log.info("Redeemed voucher {} for order {}", voucher.getCode(), orderId);
            }
        });
    }

    @Override
    @Transactional
    public void releaseByOrderId(Long orderId) {
        if (orderId == null) {
            return;
        }
        voucherRepository.findByUsedOrderId(orderId).ifPresent(voucher -> {
            if (voucher.getStatus() == VoucherStatus.RESERVED) {
                voucher.setStatus(VoucherStatus.UNUSED);
                voucher.setUsedOrderId(null);
                voucher.setUsedAt(null);
                voucherRepository.save(voucher);
                log.info("Released voucher {} from order {}", voucher.getCode(), orderId);
            }
        });
    }

    private VoucherApplyResult evaluate(VoucherApplyRequest request, boolean reserve) {
        String code = normalizeCode(request.getCode());
        if (code.isBlank()) {
            return VoucherApplyResult.invalid("Mã voucher không được để trống.");
        }
        if (request.getOrderTotal() == null || request.getOrderTotal().compareTo(BigDecimal.ZERO) <= 0) {
            return VoucherApplyResult.invalid("Giá trị đơn hàng không hợp lệ.");
        }

        Long userDbId = userIdResolver.resolveDbUserId(request.getUserId()).orElse(null);
        if (userDbId == null) {
            return VoucherApplyResult.invalid("Không xác định được tài khoản người dùng.");
        }

        IssuedVoucher voucher = reserve
                ? voucherRepository.findWithLockByCode(code).orElse(null)
                : voucherRepository.findByCode(code).orElse(null);
        if (voucher == null) {
            return VoucherApplyResult.invalid("Mã voucher không tồn tại.");
        }

        String validationError = validateOwnershipAndState(voucher, userDbId, reserve);
        if (validationError != null) {
            return VoucherApplyResult.invalid(validationError);
        }

        BigDecimal discount;
        try {
            discount = calculateDiscount(voucher, request.getOrderTotal(), request.getShippingFee());
        } catch (IllegalArgumentException ex) {
            return VoucherApplyResult.invalid(ex.getMessage());
        }

        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            return VoucherApplyResult.invalid("Voucher không áp dụng được cho đơn hàng này.");
        }

        BigDecimal finalAmount = request.getOrderTotal().subtract(discount).max(BigDecimal.ZERO);

        if (reserve) {
            voucher.setStatus(VoucherStatus.RESERVED);
            voucher.setUsedOrderId(request.getOrderId());
            voucherRepository.save(voucher);
            log.info("Reserved voucher {} for user {} order {}", code, userDbId, request.getOrderId());
        }

        return VoucherApplyResult.builder()
                .applied(true)
                .message("Áp dụng voucher thành công.")
                .voucherCode(voucher.getCode())
                .voucherType(voucher.getVoucherType())
                .discountAmount(discount)
                .finalAmount(finalAmount)
                .campaignId(voucher.getCampaignId())
                .expiresAt(voucher.getExpiresAt())
                .build();
    }

    private String validateOwnershipAndState(IssuedVoucher voucher, Long userDbId, boolean reserve) {
        if (!userDbId.equals(voucher.getUserId())) {
            return "Mã voucher không thuộc tài khoản của bạn.";
        }
        if (voucher.getExpiresAt() != null && voucher.getExpiresAt().isBefore(LocalDateTime.now())) {
            return "Mã voucher đã hết hạn.";
        }
        if (reserve) {
            if (voucher.getStatus() != VoucherStatus.UNUSED) {
                return switch (voucher.getStatus()) {
                    case RESERVED -> "Mã voucher đang được giữ cho một đơn hàng khác.";
                    case USED -> "Mã voucher đã được sử dụng.";
                    case EXPIRED -> "Mã voucher đã hết hạn.";
                    case CANCELLED -> "Mã voucher đã bị hủy.";
                    default -> "Mã voucher không khả dụng.";
                };
            }
        } else if (voucher.getStatus() != VoucherStatus.UNUSED) {
            return switch (voucher.getStatus()) {
                case RESERVED -> "Mã voucher đang được giữ cho một đơn hàng khác.";
                case USED -> "Mã voucher đã được sử dụng.";
                case EXPIRED -> "Mã voucher đã hết hạn.";
                case CANCELLED -> "Mã voucher đã bị hủy.";
                default -> "Mã voucher không khả dụng.";
            };
        }
        return null;
    }

    private BigDecimal calculateDiscount(IssuedVoucher voucher, BigDecimal orderTotal, BigDecimal shippingFee) {
        return switch (voucher.getVoucherType()) {
            case PERCENT -> calculatePercentDiscount(voucher, orderTotal);
            case FIXED -> calculateFixedDiscount(voucher, orderTotal);
            case FREESHIP -> calculateFreeshipDiscount(voucher, orderTotal, shippingFee);
        };
    }

    private BigDecimal calculatePercentDiscount(IssuedVoucher voucher, BigDecimal orderTotal) {
        BigDecimal percent = voucher.getDiscountPercent();
        if (percent == null || percent.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Cấu hình voucher phần trăm không hợp lệ.");
        }
        BigDecimal raw = orderTotal.multiply(percent)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal max = voucher.getMaxDiscountAmount() != null ? voucher.getMaxDiscountAmount() : raw;
        return raw.min(max).min(orderTotal);
    }

    private BigDecimal calculateFixedDiscount(IssuedVoucher voucher, BigDecimal orderTotal) {
        BigDecimal minOrder = voucher.getMinOrderValue() != null ? voucher.getMinOrderValue() : BigDecimal.ZERO;
        if (orderTotal.compareTo(minOrder) < 0) {
            throw new IllegalArgumentException(
                    "Đơn hàng chưa đạt giá trị tối thiểu " + minOrder + " VND để dùng voucher.");
        }
        BigDecimal amount = voucher.getDiscountAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Cấu hình voucher giảm tiền không hợp lệ.");
        }
        return amount.min(orderTotal);
    }

    private BigDecimal calculateFreeshipDiscount(IssuedVoucher voucher, BigDecimal orderTotal,
                                                   BigDecimal shippingFee) {
        BigDecimal cap = voucher.getMaxShippingDiscount();
        if (cap == null || cap.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Cấu hình voucher freeship không hợp lệ.");
        }
        BigDecimal shipBase = shippingFee != null && shippingFee.compareTo(BigDecimal.ZERO) > 0
                ? shippingFee
                : cap;
        return shipBase.min(cap).min(orderTotal);
    }

    private String normalizeCode(String code) {
        return code != null ? code.trim().toUpperCase() : "";
    }
}
