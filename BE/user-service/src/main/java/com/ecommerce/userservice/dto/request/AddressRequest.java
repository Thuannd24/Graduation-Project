package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressRequest {

    @NotBlank(message = "Tên người nhận không được để trống")
    @Size(max = 100, message = "Tên người nhận tối đa 100 ký tự")
    private String recipientName;

    // Cho phép khách gõ có dấu cách / chấm / gạch ("0912 345 678"); AddressServiceImpl chuẩn hóa
    // và kiểm tra chính xác: 10 số bắt đầu bằng 0, hoặc +84 theo sau 9 số.
    @NotBlank(message = "Số điện thoại không được để trống")
    @Pattern(regexp = "^\\s*(0|\\+84)[0-9 .-]{9,14}\\s*$",
            message = "Số điện thoại không hợp lệ (10 số bắt đầu bằng 0, hoặc +84 và 9 số)")
    private String phoneNumber;

    @NotBlank(message = "Tỉnh/thành phố không được để trống")
    @Size(max = 100, message = "Tỉnh/thành phố tối đa 100 ký tự")
    private String province;

    @NotBlank(message = "Phường/xã không được để trống")
    @Size(max = 100, message = "Phường/xã tối đa 100 ký tự")
    private String districtWard;

    @NotBlank(message = "Địa chỉ chi tiết không được để trống")
    @Size(max = 255, message = "Địa chỉ chi tiết tối đa 255 ký tự")
    private String detailAddress;

    private Boolean isDefault;
}
