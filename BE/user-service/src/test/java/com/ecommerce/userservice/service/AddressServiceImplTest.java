package com.ecommerce.userservice.service;

import com.ecommerce.userservice.dto.request.AddressRequest;
import com.ecommerce.userservice.dto.response.AddressResponse;
import com.ecommerce.userservice.entity.Address;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.AddressRepository;
import com.ecommerce.userservice.service.impl.AddressServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AddressServiceImplTest {

    @Mock
    private AddressRepository addressRepository;

    @InjectMocks
    private AddressServiceImpl addressService;

    private AddressRequest request(Boolean isDefault) {
        return AddressRequest.builder()
                .recipientName("Nguyễn Văn A").phoneNumber("0912345678")
                .province("Hà Nội").districtWard("Cầu Giấy").detailAddress("1 Xuân Thủy")
                .isDefault(isDefault).build();
    }

    @Test
    @DisplayName("TC_PH1_ADDR_01: Thêm địa chỉ mặc định -> bỏ cờ mặc định các địa chỉ cũ TRƯỚC rồi mới lưu địa chỉ mới isDefault=true")
    void addAddress_default_unsetsOthersFirst() {
        when(addressRepository.save(any(Address.class))).thenAnswer(inv -> {
            Address a = inv.getArgument(0);
            a.setId(100L);
            return a;
        });

        AddressResponse res = addressService.addAddress(7L, request(true));

        InOrder order = inOrder(addressRepository);
        order.verify(addressRepository).unsetDefaultByUserId(7L);
        order.verify(addressRepository).save(any(Address.class));
        assertEquals(100L, res.getId());
        assertTrue(res.getIsDefault());
    }

    @Test
    @DisplayName("TC_PH1_ADDR_02: Thêm địa chỉ không chọn mặc định (isDefault=null) -> không đụng địa chỉ cũ, lưu isDefault=false, gắn đúng userId")
    void addAddress_nonDefault() {
        when(addressRepository.save(any(Address.class))).thenAnswer(inv -> inv.getArgument(0));

        AddressResponse res = addressService.addAddress(7L, request(null));

        verify(addressRepository, never()).unsetDefaultByUserId(any());
        ArgumentCaptor<Address> saved = ArgumentCaptor.forClass(Address.class);
        verify(addressRepository).save(saved.capture());
        assertEquals(7L, saved.getValue().getUserId());
        assertFalse(saved.getValue().getIsDefault());
        assertFalse(res.getIsDefault());
    }

    @Test
    @DisplayName("TC_PH1_ADDR_03: Xóa địa chỉ của người khác (không khớp userId) -> ResourceNotFoundException, không xóa; địa chỉ của mình -> xóa")
    void deleteAddress_ownerCheck() {
        Address mine = Address.builder().id(5L).userId(7L).build();
        when(addressRepository.findByUserIdAndId(8L, 5L)).thenReturn(Optional.empty());
        when(addressRepository.findByUserIdAndId(7L, 5L)).thenReturn(Optional.of(mine));

        assertThrows(ResourceNotFoundException.class, () -> addressService.deleteAddress(8L, 5L));
        verify(addressRepository, never()).delete(any());

        addressService.deleteAddress(7L, 5L);
        verify(addressRepository).delete(mine);
    }

    @Test
    @DisplayName("UI_PH1_FR02_007: Số điện thoại 'abcxyz' -> IllegalArgumentException (400) tiếng Việt, không lưu")
    void addAddress_invalidPhone_rejected() {
        AddressRequest req = request(false);
        req.setPhoneNumber("abcxyz");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> addressService.addAddress(7L, req));
        assertTrue(ex.getMessage().contains("Số điện thoại không hợp lệ"));
        verify(addressRepository, never()).save(any());
    }

    @Test
    @DisplayName("Số điện thoại hợp lệ: 10 số bắt đầu bằng 0 (cho phép dấu cách) hoặc +84 và 9 số -> lưu dạng đã chuẩn hóa; sai độ dài -> từ chối")
    void addAddress_phoneFormats() {
        when(addressRepository.save(any(Address.class))).thenAnswer(inv -> inv.getArgument(0));

        AddressRequest spaced = request(false);
        spaced.setPhoneNumber("0912 345 678");
        assertEquals("0912345678", addressService.addAddress(7L, spaced).getPhoneNumber());

        AddressRequest intl = request(false);
        intl.setPhoneNumber("+84912345678");
        assertEquals("+84912345678", addressService.addAddress(7L, intl).getPhoneNumber());

        for (String bad : new String[]{"091234567", "09123456789", "84912345678", "+8491234567"}) {
            AddressRequest r = request(false);
            r.setPhoneNumber(bad);
            assertThrows(IllegalArgumentException.class, () -> addressService.addAddress(7L, r), bad);
        }
    }

    @Test
    @DisplayName("Thiếu trường bắt buộc (địa chỉ chi tiết trống) -> IllegalArgumentException, không lưu")
    void addAddress_missingRequiredField() {
        AddressRequest req = request(false);
        req.setDetailAddress("   ");

        assertThrows(IllegalArgumentException.class, () -> addressService.addAddress(7L, req));
        verify(addressRepository, never()).save(any());
    }
}
