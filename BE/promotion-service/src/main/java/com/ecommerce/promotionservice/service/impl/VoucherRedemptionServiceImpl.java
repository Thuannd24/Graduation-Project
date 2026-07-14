package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.client.ProductClient;
import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.InternalUserIdResolver;
import com.ecommerce.promotionservice.service.VoucherMaintenanceService;
import com.ecommerce.promotionservice.service.VoucherRedemptionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class VoucherRedemptionServiceImpl implements VoucherRedemptionService {

    private final IssuedVoucherRepository voucherRepository;
    private final InternalUserIdResolver userIdResolver;
    private final VoucherMaintenanceService voucherMaintenanceService;
    private final ProductClient productClient;

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

        // BUG FIX: expireIfNeeded() writes to the DB (status -> EXPIRED, releases campaign
        // budget). preview() runs in a @Transactional(readOnly = true) transaction — Spring/
        // Hibernate may set the flush mode to MANUAL/NEVER for read-only transactions, so an
        // entity mutated here could silently never be flushed to the database at all. Only run
        // the mutating expiry check on the real (non-read-only) apply() path; preview() instead
        // relies on the plain date comparison in validateOwnershipAndState() below, which reports
        // the same "hết hạn" result without writing anything.
        if (reserve) {
            voucherMaintenanceService.expireIfNeeded(voucher);
            if (voucher.getStatus() == VoucherStatus.EXPIRED) {
                return VoucherApplyResult.invalid("Mã voucher đã hết hạn.");
            }
        }

        String validationError = validateOwnershipAndState(voucher, userDbId, reserve);
        if (validationError != null) {
            return VoucherApplyResult.invalid(validationError);
        }

        // BUG FIX: previously a voucher's Condition_ContainsCategory/ContainsProduct only gated
        // who RECEIVED it, not what it could be redeemed against - a voucher earned by buying
        // category X could be applied to any unrelated order. Now checked against whatever
        // category/product restriction was stamped onto the voucher at issuance time.
        String restrictionError = validateProductCategoryRestriction(voucher, request.getProductIds());
        if (restrictionError != null) {
            return VoucherApplyResult.invalid(restrictionError);
        }

        BigDecimal productDiscount;
        BigDecimal shippingDiscount;
        try {
            productDiscount = calculateProductDiscount(voucher, request.getOrderTotal());
            shippingDiscount = calculateShippingDiscount(voucher, request.getShippingFee());
        } catch (IllegalArgumentException ex) {
            return VoucherApplyResult.invalid(ex.getMessage());
        }

        BigDecimal totalDiscount = productDiscount.add(shippingDiscount);
        if (totalDiscount.compareTo(BigDecimal.ZERO) <= 0) {
            return VoucherApplyResult.invalid("Voucher không áp dụng được cho đơn hàng này.");
        }

        BigDecimal finalAmount = request.getOrderTotal().subtract(productDiscount).max(BigDecimal.ZERO);

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
                .discountAmount(totalDiscount)
                .productDiscountAmount(productDiscount)
                .shippingDiscountAmount(shippingDiscount)
                .finalAmount(finalAmount)
                .campaignId(voucher.getCampaignId())
                .expiresAt(voucher.getExpiresAt())
                .build();
    }

    /** Null = no restriction violated (either the voucher has no restriction, or the current
     *  order's products/categories satisfy it). Non-null = rejection message. */
    private String validateProductCategoryRestriction(IssuedVoucher voucher, List<Long> orderProductIds) {
        List<Long> restrictedProductIds = parseCsvIds(voucher.getRestrictedProductIds());
        List<Long> restrictedCategoryIds = parseCsvIds(voucher.getRestrictedCategoryIds());
        if (restrictedProductIds.isEmpty() && restrictedCategoryIds.isEmpty()) {
            return null;
        }

        List<Long> productIds = orderProductIds != null ? orderProductIds : List.of();
        if (productIds.isEmpty()) {
            return "Voucher này chỉ áp dụng cho một số sản phẩm/danh mục nhất định.";
        }

        if (!restrictedProductIds.isEmpty() && productIds.stream().anyMatch(restrictedProductIds::contains)) {
            return null;
        }

        if (!restrictedCategoryIds.isEmpty()) {
            List<Long> orderCategoryIds = resolveCategoryIds(productIds);
            if (orderCategoryIds.stream().anyMatch(restrictedCategoryIds::contains)) {
                return null;
            }
        }

        return "Đơn hàng hiện tại không thuộc danh mục/sản phẩm được áp dụng cho voucher này.";
    }

    private List<Long> parseCsvIds(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(Long::parseLong)
                .toList();
    }

    @SuppressWarnings("unchecked")
    private List<Long> resolveCategoryIds(List<Long> productIds) {
        try {
            Map<String, Object> response = productClient.getBulkProducts(productIds);
            Object dataObj = response != null ? response.get("data") : null;
            if (!(dataObj instanceof List<?> products)) {
                return List.of();
            }
            return products.stream()
                    .filter(p -> p instanceof Map)
                    .map(p -> ((Map<String, Object>) p).get("categoryId"))
                    .filter(java.util.Objects::nonNull)
                    .map(id -> Long.parseLong(id.toString()))
                    .distinct()
                    .toList();
        } catch (Exception ex) {
            log.warn("Could not resolve category ids for products {}: {}", productIds, ex.getMessage());
            return List.of();
        }
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

    private BigDecimal calculateProductDiscount(IssuedVoucher voucher, BigDecimal orderTotal) {
        return switch (voucher.getVoucherType()) {
            case PERCENT -> calculatePercentDiscount(voucher, orderTotal);
            case FIXED -> calculateFixedDiscount(voucher, orderTotal);
            case FREESHIP -> BigDecimal.ZERO;
        };
    }

    private BigDecimal calculateShippingDiscount(IssuedVoucher voucher, BigDecimal shippingFee) {
        if (voucher.getVoucherType() != VoucherType.FREESHIP) {
            return BigDecimal.ZERO;
        }
        return calculateFreeshipDiscount(voucher, shippingFee);
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

    private BigDecimal calculateFreeshipDiscount(IssuedVoucher voucher, BigDecimal shippingFee) {
        BigDecimal cap = voucher.getMaxShippingDiscount();
        if (cap == null || cap.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Cấu hình voucher freeship không hợp lệ.");
        }
        if (shippingFee == null || shippingFee.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Đơn hàng không có phí vận chuyển để áp dụng voucher freeship.");
        }
        return shippingFee.min(cap);
    }

    private String normalizeCode(String code) {
        return code != null ? code.trim().toUpperCase() : "";
    }
}
