package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.entity.IssuedVoucher;

public interface VoucherMaintenanceService {

    int expireStaleVouchers();

    void expireIfNeeded(IssuedVoucher voucher);
}
