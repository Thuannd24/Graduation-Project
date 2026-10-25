package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.client.ProductClient;
import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.impl.VoucherRedemptionServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test VoucherRedemptionServiceImpl (PH6): tính giảm giá PERCENT/FIXED/FREESHIP (trần, đơn tối thiểu),
 * xem trước, giữ voucher theo đơn (RESERVED), chốt dùng (USED), trả lại khi hủy đơn, ràng buộc danh mục/sản phẩm.
 */
@ExtendWith(MockitoExtension.class)
class VoucherRedemptionServiceImplTest {

    @Mock private IssuedVoucherRepository voucherRepository;
    @Mock private InternalUserIdResolver userIdResolver;
    @Mock private VoucherMaintenanceService voucherMaintenanceService;
    @Mock private ProductClient productClient;

    @InjectMocks
    private VoucherRedemptionServiceImpl service;

    private static IssuedVoucher.IssuedVoucherBuilder base(String code, VoucherType type) {
        return IssuedVoucher.builder().id(1L).code(code).userId(7L).campaignId(3L).voucherType(type)
                .status(VoucherStatus.UNUSED).expiresAt(LocalDateTime.now().plusDays(5));
    }

    private static VoucherApplyRequest req(String code, String total, String ship) {
        return VoucherApplyRequest.builder().code(code).userId("7").orderTotal(new BigDecimal(total))
                .shippingFee(ship == null ? null : new BigDecimal(ship)).build();
    }

    private void user7() {
        when(userIdResolver.resolveDbUserId("7")).thenReturn(Optional.of(7L));
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_01: Xem trước voucher PERCENT 10%: đơn 1.000.000 trần 50.000 -> giảm 50.000; đơn 300.000 -> 30.000 (dưới trần); mã nhập ' vpc-1 ' được chuẩn hóa; preview không ghi DB")
    void preview_percent_capAndNormalize() {
        user7();
        when(voucherRepository.findByCode("VPC-1")).thenReturn(Optional.of(
                base("VPC-1", VoucherType.PERCENT).discountPercent(new BigDecimal("10")).maxDiscountAmount(new BigDecimal("50000")).build()));

        VoucherApplyResult big = service.preview(req(" vpc-1 ", "1000000", "30000"));
        VoucherApplyResult small = service.preview(req("VPC-1", "300000", "30000"));

        assertTrue(big.isApplied());
        assertEquals(0, new BigDecimal("50000").compareTo(big.getProductDiscountAmount()));
        assertEquals(0, BigDecimal.ZERO.compareTo(big.getShippingDiscountAmount()));
        assertEquals(0, new BigDecimal("950000").compareTo(big.getFinalAmount()));
        assertEquals(0, new BigDecimal("30000").compareTo(small.getDiscountAmount()));
        assertEquals(0, new BigDecimal("270000").compareTo(small.getFinalAmount()));
        assertEquals(3L, big.getCampaignId());
        verify(voucherRepository, never()).save(any());
        verifyNoInteractions(voucherMaintenanceService);
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_02: Voucher FIXED 50.000 đơn tối thiểu 200.000: đơn 199.999 bị từ chối; đúng 200.000 giảm 50.000; voucher 500.000 cho đơn 300.000 chỉ giảm 300.000 (không âm)")
    void preview_fixed_minOrder_andCap() {
        user7();
        when(voucherRepository.findByCode("VPF-1")).thenReturn(Optional.of(
                base("VPF-1", VoucherType.FIXED).discountAmount(new BigDecimal("50000")).minOrderValue(new BigDecimal("200000")).build()));
        when(voucherRepository.findByCode("VPF-2")).thenReturn(Optional.of(
                base("VPF-2", VoucherType.FIXED).discountAmount(new BigDecimal("500000")).build()));

        VoucherApplyResult below = service.preview(req("VPF-1", "199999", null));
        VoucherApplyResult exact = service.preview(req("VPF-1", "200000", null));
        VoucherApplyResult over = service.preview(req("VPF-2", "300000", null));

        assertFalse(below.isApplied());
        assertTrue(below.getMessage().contains("chưa đạt giá trị tối thiểu 200000"));
        assertTrue(exact.isApplied());
        assertEquals(0, new BigDecimal("50000").compareTo(exact.getDiscountAmount()));
        assertEquals(0, new BigDecimal("150000").compareTo(exact.getFinalAmount()));
        assertEquals(0, new BigDecimal("300000").compareTo(over.getDiscountAmount()));
        assertEquals(0, BigDecimal.ZERO.compareTo(over.getFinalAmount()));
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_03: Voucher FREESHIP trần 20.000: phí ship 30.000 -> giảm ship 20.000 (không giảm tiền hàng); ship 15.000 -> 15.000; không có phí ship -> từ chối")
    void preview_freeship() {
        user7();
        when(voucherRepository.findByCode("VFS-1")).thenReturn(Optional.of(
                base("VFS-1", VoucherType.FREESHIP).maxShippingDiscount(new BigDecimal("20000")).build()));

        VoucherApplyResult capped = service.preview(req("VFS-1", "500000", "30000"));
        VoucherApplyResult under = service.preview(req("VFS-1", "500000", "15000"));
        VoucherApplyResult noShip = service.preview(req("VFS-1", "500000", null));

        assertTrue(capped.isApplied());
        assertEquals(0, new BigDecimal("20000").compareTo(capped.getShippingDiscountAmount()));
        assertEquals(0, BigDecimal.ZERO.compareTo(capped.getProductDiscountAmount()));
        assertEquals(0, new BigDecimal("500000").compareTo(capped.getFinalAmount()));
        assertEquals(0, new BigDecimal("15000").compareTo(under.getDiscountAmount()));
        assertFalse(noShip.isApplied());
        assertTrue(noShip.getMessage().contains("không có phí vận chuyển"));
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_04: Đầu vào không hợp lệ và quyền sở hữu: mã trống; tổng đơn 0/null; không xác định được user; mã không tồn tại; voucher của người khác; voucher đã quá hạn (preview không ghi DB)")
    void preview_invalidInputs_andOwnership() {
        assertEquals("Mã voucher không được để trống.", service.preview(req("  ", "100000", null)).getMessage());
        assertFalse(service.preview(req("A", "0", null)).isApplied());
        assertFalse(service.preview(VoucherApplyRequest.builder().code("A").userId("7").build()).isApplied());

        when(userIdResolver.resolveDbUserId("ghost")).thenReturn(Optional.empty());
        VoucherApplyRequest ghost = req("A", "100000", null);
        ghost.setUserId("ghost");
        assertTrue(service.preview(ghost).getMessage().contains("Không xác định được tài khoản"));

        user7();
        when(voucherRepository.findByCode("NOPE")).thenReturn(Optional.empty());
        when(voucherRepository.findByCode("OTHER")).thenReturn(Optional.of(
                base("OTHER", VoucherType.FIXED).userId(99L).discountAmount(new BigDecimal("10000")).build()));
        when(voucherRepository.findByCode("OLD")).thenReturn(Optional.of(
                base("OLD", VoucherType.FIXED).discountAmount(new BigDecimal("10000")).expiresAt(LocalDateTime.now().minusMinutes(1)).build()));
        assertEquals("Mã voucher không tồn tại.", service.preview(req("NOPE", "100000", null)).getMessage());
        assertEquals("Mã voucher không thuộc tài khoản của bạn.", service.preview(req("OTHER", "100000", null)).getMessage());
        assertEquals("Mã voucher đã hết hạn.", service.preview(req("OLD", "100000", null)).getMessage());
        verify(voucherRepository, never()).save(any());
        verifyNoInteractions(voucherMaintenanceService);
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_05: Áp dụng (apply) giữ voucher cho đơn: khóa dòng theo mã, kiểm tra hết hạn, chuyển UNUSED -> RESERVED gắn orderId; apply thiếu orderId bị từ chối")
    void apply_reservesVoucher() {
        user7();
        IssuedVoucher v = base("VPF-9", VoucherType.FIXED).discountAmount(new BigDecimal("50000")).build();
        when(voucherRepository.findWithLockByCode("VPF-9")).thenReturn(Optional.of(v));

        VoucherApplyRequest r = req("vpf-9", "400000", null);
        r.setOrderId(555L);
        VoucherApplyResult res = service.apply(r);

        assertTrue(res.isApplied());
        assertEquals(VoucherStatus.RESERVED, v.getStatus());
        assertEquals(555L, v.getUsedOrderId());
        verify(voucherMaintenanceService).expireIfNeeded(v);
        verify(voucherRepository).save(v);
        verify(voucherRepository, never()).findByCode(anyString());

        VoucherApplyResult noOrder = service.apply(req("VPF-9", "400000", null));
        assertFalse(noOrder.isApplied());
        assertTrue(noOrder.getMessage().contains("orderId bắt buộc"));
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_06: Apply voucher không ở trạng thái UNUSED bị từ chối đúng thông điệp: RESERVED, USED, CANCELLED, và hết hạn (expireIfNeeded chuyển EXPIRED); không ghi DB")
    void apply_statusRules() {
        user7();
        Map<String, VoucherStatus> statuses = Map.of("R", VoucherStatus.RESERVED, "U", VoucherStatus.USED, "C", VoucherStatus.CANCELLED);
        statuses.forEach((code, st) -> when(voucherRepository.findWithLockByCode(code)).thenReturn(Optional.of(
                base(code, VoucherType.FIXED).discountAmount(new BigDecimal("10000")).status(st).build())));
        IssuedVoucher exp = base("E", VoucherType.FIXED).discountAmount(new BigDecimal("10000")).build();
        when(voucherRepository.findWithLockByCode("E")).thenReturn(Optional.of(exp));
        doAnswer(inv -> {
            IssuedVoucher v = inv.getArgument(0);
            if ("E".equals(v.getCode())) v.setStatus(VoucherStatus.EXPIRED);
            return null;
        }).when(voucherMaintenanceService).expireIfNeeded(any());

        VoucherApplyRequest r = req("R", "100000", null);
        r.setOrderId(1L);
        assertEquals("Mã voucher đang được giữ cho một đơn hàng khác.", service.apply(r).getMessage());
        r.setCode("U");
        assertEquals("Mã voucher đã được sử dụng.", service.apply(r).getMessage());
        r.setCode("C");
        assertEquals("Mã voucher đã bị hủy.", service.apply(r).getMessage());
        r.setCode("E");
        assertEquals("Mã voucher đã hết hạn.", service.apply(r).getMessage());
        verify(voucherRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_07: Chốt dùng/trả lại theo đơn: thanh toán xong RESERVED -> USED có usedAt; hủy đơn RESERVED -> UNUSED xóa orderId; voucher USED không bị trả lại; orderId null bỏ qua")
    void redeem_and_release() {
        IssuedVoucher reserved1 = base("A", VoucherType.FIXED).status(VoucherStatus.RESERVED).usedOrderId(10L).build();
        IssuedVoucher reserved2 = base("B", VoucherType.FIXED).status(VoucherStatus.RESERVED).usedOrderId(11L).build();
        IssuedVoucher used = base("C", VoucherType.FIXED).status(VoucherStatus.USED).usedOrderId(12L).usedAt(LocalDateTime.now()).build();
        when(voucherRepository.findWithLockByUsedOrderId(10L)).thenReturn(Optional.of(reserved1));
        when(voucherRepository.findWithLockByUsedOrderId(11L)).thenReturn(Optional.of(reserved2));
        when(voucherRepository.findWithLockByUsedOrderId(12L)).thenReturn(Optional.of(used));

        service.redeemByOrderId(10L);
        service.releaseByOrderId(11L);
        service.releaseByOrderId(12L);
        service.redeemByOrderId(null);
        service.releaseByOrderId(null);

        assertEquals(VoucherStatus.USED, reserved1.getStatus());
        assertNotNull(reserved1.getUsedAt());
        assertEquals(VoucherStatus.UNUSED, reserved2.getStatus());
        assertNull(reserved2.getUsedOrderId());
        assertEquals(VoucherStatus.USED, used.getStatus());
        assertEquals(12L, used.getUsedOrderId());
        verify(voucherRepository, times(2)).save(any());
    }

    @Test
    @DisplayName("TC_PH6_VOUCHER_08: Ràng buộc sản phẩm/danh mục: voucher chỉ cho SP 5 áp được cho đơn [5,6]; voucher chỉ cho danh mục 3: đơn có SP thuộc danh mục 3 được, danh mục 4 bị từ chối; giỏ không gửi productIds bị từ chối")
    void restriction_productAndCategory() {
        user7();
        when(voucherRepository.findByCode("PROD")).thenReturn(Optional.of(
                base("PROD", VoucherType.FIXED).discountAmount(new BigDecimal("10000")).restrictedProductIds("5, 8").build()));
        when(voucherRepository.findByCode("CAT")).thenReturn(Optional.of(
                base("CAT", VoucherType.FIXED).discountAmount(new BigDecimal("10000")).restrictedCategoryIds("3").build()));
        when(productClient.getBulkProducts(List.of(20L))).thenReturn(Map.<String, Object>of("data", List.of(Map.of("id", 20, "categoryId", 3))));
        when(productClient.getBulkProducts(List.of(21L))).thenReturn(Map.<String, Object>of("data", List.of(Map.<String, Object>of("id", 21, "categoryId", "4"))));

        VoucherApplyRequest p = req("PROD", "100000", null);
        p.setProductIds(List.of(5L, 6L));
        assertTrue(service.preview(p).isApplied());

        VoucherApplyRequest c1 = req("CAT", "100000", null);
        c1.setProductIds(List.of(20L));
        assertTrue(service.preview(c1).isApplied());

        VoucherApplyRequest c2 = req("CAT", "100000", null);
        c2.setProductIds(List.of(21L));
        VoucherApplyResult rej = service.preview(c2);
        assertFalse(rej.isApplied());
        assertTrue(rej.getMessage().contains("không thuộc danh mục/sản phẩm"));

        VoucherApplyResult none = service.preview(req("CAT", "100000", null));
        assertFalse(none.isApplied());
        assertTrue(none.getMessage().contains("chỉ áp dụng cho một số sản phẩm/danh mục"));
    }
}
