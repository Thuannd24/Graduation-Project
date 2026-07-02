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

        // Dùng @Modifying bulk update thay vì N+1 save() trong vòng lặp
        if (Boolean.TRUE.equals(request.getIsDefault())) {
            addressRepository.unsetDefaultByUserId(userId);
        }

        Address address = Address.builder()
                .userId(userId)
                .recipientName(request.getRecipientName())
                .phoneNumber(request.getPhoneNumber())
                .province(request.getProvince())
                .districtWard(request.getDistrictWard())
                .detailAddress(request.getDetailAddress())
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
