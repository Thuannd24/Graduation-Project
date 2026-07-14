package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.dto.UserVoucherDto;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.InternalUserIdResolver;
import com.ecommerce.promotionservice.service.VoucherQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VoucherQueryServiceImpl implements VoucherQueryService {

    private final IssuedVoucherRepository voucherRepository;
    private final InternalUserIdResolver userIdResolver;

    @Override
    @Transactional(readOnly = true)
    public List<UserVoucherDto> getVouchersForUser(String keycloakUserId) {
        Long userDbId = userIdResolver.resolveDbUserId(keycloakUserId).orElse(null);
        if (userDbId == null) {
            return List.of();
        }

        return voucherRepository.findByUserIdOrderByCreatedAtDesc(userDbId).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    private UserVoucherDto toDto(IssuedVoucher voucher) {
        boolean expired = voucher.getExpiresAt() != null
                && voucher.getExpiresAt().isBefore(LocalDateTime.now());
        boolean usable = voucher.getStatus() == VoucherStatus.UNUSED && !expired;

        return UserVoucherDto.builder()
                .id(voucher.getId())
                .code(voucher.getCode())
                .voucherType(voucher.getVoucherType())
                .status(expired && voucher.getStatus() == VoucherStatus.UNUSED
                        ? VoucherStatus.EXPIRED
                        : voucher.getStatus())
                .discountPercent(voucher.getDiscountPercent())
                .maxDiscountAmount(voucher.getMaxDiscountAmount())
                .discountAmount(voucher.getDiscountAmount())
                .minOrderValue(voucher.getMinOrderValue())
                .maxShippingDiscount(voucher.getMaxShippingDiscount())
                .expiresAt(voucher.getExpiresAt())
                .campaignId(voucher.getCampaignId())
                .title(buildTitle(voucher))
                .description(buildDescription(voucher))
                .usable(usable)
                .build();
    }

    private String buildTitle(IssuedVoucher voucher) {
        return switch (voucher.getVoucherType()) {
            case PERCENT -> "Giảm " + stripZeros(voucher.getDiscountPercent()) + "%";
            case FIXED -> "Giảm " + formatVnd(voucher.getDiscountAmount());
            case FREESHIP -> "Miễn phí vận chuyển";
        };
    }

    private String buildDescription(IssuedVoucher voucher) {
        return switch (voucher.getVoucherType()) {
            case PERCENT -> {
                String max = voucher.getMaxDiscountAmount() != null
                        && voucher.getMaxDiscountAmount().compareTo(BigDecimal.ZERO) > 0
                        ? "Tối đa " + formatVnd(voucher.getMaxDiscountAmount())
                        : "Không giới hạn";
                yield max;
            }
            case FIXED -> {
                BigDecimal min = voucher.getMinOrderValue();
                if (min != null && min.compareTo(BigDecimal.ZERO) > 0) {
                    yield "Đơn từ " + formatVnd(min);
                }
                yield "Áp dụng cho mọi đơn hàng";
            }
            case FREESHIP -> {
                BigDecimal cap = voucher.getMaxShippingDiscount();
                if (cap != null && cap.compareTo(BigDecimal.ZERO) > 0) {
                    yield "Giảm đến " + formatVnd(cap) + " phí ship";
                }
                yield "Giảm phí vận chuyển";
            }
        };
    }

    private String stripZeros(BigDecimal value) {
        if (value == null) {
            return "0";
        }
        return value.stripTrailingZeros().toPlainString();
    }

    private String formatVnd(BigDecimal amount) {
        if (amount == null) {
            return "0đ";
        }
        NumberFormat formatter = NumberFormat.getInstance(new Locale("vi", "VN"));
        return formatter.format(amount.longValue()) + "đ";
    }
}
