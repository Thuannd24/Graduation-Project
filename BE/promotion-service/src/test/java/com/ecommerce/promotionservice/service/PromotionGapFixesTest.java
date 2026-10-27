package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.client.ProductClient;
import com.ecommerce.promotionservice.dto.WorkflowEdgeDto;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.impl.VoucherRedemptionServiceImpl;
import com.ecommerce.promotionservice.service.support.ProvinceNormalizer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit test cho các thiếu sót nghiệp vụ mục 8: điều kiện "Địa chỉ" theo tỉnh và trả voucher khi hủy đơn.
 */
@ExtendWith(MockitoExtension.class)
class PromotionGapFixesTest {

    @Mock private IssuedVoucherRepository voucherRepository;
    @Mock private InternalUserIdResolver userIdResolver;
    @Mock private VoucherMaintenanceService voucherMaintenanceService;
    @Mock private ProductClient productClient;

    @Test
    @DisplayName("Chuẩn hóa tên tỉnh: bỏ tiền tố Thành phố/Tỉnh/TP., bỏ dấu, gộp alias HCM")
    void provinceNormalizer() {
        assertEquals("hanoi", ProvinceNormalizer.normalize("Thành phố Hà Nội"));
        assertEquals("hanoi", ProvinceNormalizer.normalize("Hà Nội"));
        assertEquals("hanoi", ProvinceNormalizer.normalize("Hanoi"));
        assertEquals("hochiminh", ProvinceNormalizer.normalize("TP. Hồ Chí Minh"));
        assertEquals("hochiminh", ProvinceNormalizer.normalize("TP.HCM"));
        assertEquals("hochiminh", ProvinceNormalizer.normalize("Thành phố Hồ Chí Minh"));
        assertEquals("danang", ProvinceNormalizer.normalize("Thành phố Đà Nẵng"));
        assertEquals("bacninh", ProvinceNormalizer.normalize("Tỉnh Bắc Ninh"));
        assertEquals("hanoi", ProvinceNormalizer.fromAddress("12 Láng Hạ, Phường Láng Hạ, Quận Đống Đa, Hà Nội, Việt Nam"));
        assertEquals("", ProvinceNormalizer.normalize("  "));
    }

    @Test
    @DisplayName("Nhánh Condition_Location được biên dịch thành so sánh theo targetProvinceKey (không phân biệt dấu/tiền tố)")
    void compileLocationBranch() {
        BpmnCompilerService compiler = new BpmnCompilerService();
        WorkflowEdgeDto eq = new WorkflowEdgeDto("f1", "c1", "a1", "${targetProvince == 'Thành phố Hà Nội'}", false,
                Map.of("operator", "EQUAL", "value", List.of("Thành phố Hà Nội")));
        assertEquals("${execution.getVariable('targetProvinceKey') == 'hanoi'}",
                compiler.buildLocationCondition(eq, eq.getCondition()));

        WorkflowEdgeDto legacy = new WorkflowEdgeDto("f2", "c1", "a2", "${targetProvince != 'TP. Hồ Chí Minh'}", false, null);
        assertEquals("${execution.getVariable('targetProvinceKey') != 'hochiminh'}",
                compiler.buildLocationCondition(legacy, legacy.getCondition()));
    }

    @Test
    @DisplayName("Hủy đơn trước giao: voucher USED còn hạn quay về UNUSED; gọi lại là no-op; voucher hết hạn thì EXPIRED")
    void restoreVoucherOnCancel() {
        VoucherRedemptionServiceImpl service = new VoucherRedemptionServiceImpl(
                voucherRepository, userIdResolver, voucherMaintenanceService, productClient);
        IssuedVoucher used = IssuedVoucher.builder().id(1L).code("VFX-1").userId(7L).voucherType(VoucherType.FIXED)
                .status(VoucherStatus.USED).usedOrderId(50L).usedAt(LocalDateTime.now())
                .expiresAt(LocalDateTime.now().plusDays(3)).build();
        IssuedVoucher expired = IssuedVoucher.builder().id(2L).code("VFX-2").userId(7L).voucherType(VoucherType.FIXED)
                .status(VoucherStatus.USED).usedOrderId(51L).expiresAt(LocalDateTime.now().minusDays(1)).build();
        when(voucherRepository.findWithLockByUsedOrderId(50L)).thenReturn(Optional.of(used), Optional.empty());
        when(voucherRepository.findWithLockByUsedOrderId(51L)).thenReturn(Optional.of(expired));
        doAnswer(inv -> {
            IssuedVoucher v = inv.getArgument(0);
            if (v.getExpiresAt().isBefore(LocalDateTime.now())) v.setStatus(VoucherStatus.EXPIRED);
            return null;
        }).when(voucherMaintenanceService).expireIfNeeded(any());

        assertEquals("RESTORED", service.restoreByOrderId(50L));
        assertEquals(VoucherStatus.UNUSED, used.getStatus());
        assertNull(used.getUsedOrderId());
        assertNull(used.getUsedAt());
        assertEquals("NOT_FOUND", service.restoreByOrderId(50L));
        assertEquals("EXPIRED", service.restoreByOrderId(51L));
        assertEquals("IGNORED", service.restoreByOrderId(null));
    }
}
