package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.UserVoucherDto;

import java.util.List;

public interface VoucherQueryService {
    List<UserVoucherDto> getVouchersForUser(String keycloakUserId);
}
