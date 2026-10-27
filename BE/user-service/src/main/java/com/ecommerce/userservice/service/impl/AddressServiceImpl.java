package com.ecommerce.userservice.service.impl;

import com.ecommerce.userservice.dto.request.AddressRequest;
import com.ecommerce.userservice.dto.response.AddressResponse;
import com.ecommerce.userservice.entity.Address;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.AddressRepository;
import com.ecommerce.userservice.service.AddressService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AddressServiceImpl implements AddressService {

    private final AddressRepository addressRepository;

    @Override
    @Transactional(readOnly = true)
    public List<AddressResponse> getAddresses(Long userId) {
        log.info("Getting addresses for user: {}", userId);
        return addressRepository.findByUserId(userId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public AddressResponse addAddress(Long userId, AddressRequest request) {
        log.info("Adding address for user: {}", userId);
        String recipientName = requireText(request.getRecipientName(), "Tên người nhận không được để trống");
        String phoneNumber = normalizeVietnamesePhone(request.getPhoneNumber());
        String province = requireText(request.getProvince(), "Tỉnh/thành phố không được để trống");
        String districtWard = requireText(request.getDistrictWard(), "Phường/xã không được để trống");
        String detailAddress = requireText(request.getDetailAddress(), "Địa chỉ chi tiết không được để trống");

        // Dùng @Modifying bulk update thay vì N+1 save() trong vòng lặp
        if (Boolean.TRUE.equals(request.getIsDefault())) {
            addressRepository.unsetDefaultByUserId(userId);
        }

        Address address = Address.builder()
                .userId(userId)
                .recipientName(recipientName)
                .phoneNumber(phoneNumber)
                .province(province)
                .districtWard(districtWard)
                .detailAddress(detailAddress)
                .isDefault(Boolean.TRUE.equals(request.getIsDefault()))
                .build();

        return mapToResponse(addressRepository.save(address));
    }

    @Override
    @Transactional
    public void deleteAddress(Long userId, Long addressId) {
        log.info("Deleting address {} for user {}", addressId, userId);
        Address address = addressRepository.findByUserIdAndId(userId, addressId)
                .orElseThrow(() -> new ResourceNotFoundException("Address", "id", addressId));
        addressRepository.delete(address);
    }

    // ──────────────────────────────────────────────────────────────────────────
    private static final java.util.regex.Pattern VN_PHONE = java.util.regex.Pattern.compile("^(0[0-9]{9}|\\+84[0-9]{9})$");

    // Số điện thoại Việt Nam: 10 số bắt đầu bằng 0, hoặc +84 theo sau 9 số. Bỏ dấu cách/chấm/gạch trước khi kiểm tra.
    static String normalizeVietnamesePhone(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Số điện thoại không được để trống");
        }
        String phone = raw.replaceAll("[\\s.\\-]", "");
        if (!VN_PHONE.matcher(phone).matches()) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ (10 số bắt đầu bằng 0, hoặc +84 và 9 số)");
        }
        return phone;
    }

    private static String requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private AddressResponse mapToResponse(Address address) {
        return AddressResponse.builder()
                .id(address.getId())
                .recipientName(address.getRecipientName())
                .phoneNumber(address.getPhoneNumber())
                .province(address.getProvince())
                .districtWard(address.getDistrictWard())
                .detailAddress(address.getDetailAddress())
                .isDefault(address.getIsDefault())
                .createdAt(address.getCreatedAt())
                .build();
    }
}
