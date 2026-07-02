package com.ecommerce.promotionservice.dto;

import com.ecommerce.promotionservice.entity.VoucherType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class IssueVoucherResult {
    private Long voucherId;
    private String voucherCode;
    private VoucherType voucherType;
    private LocalDateTime expiresAt;
}
