package com.ecommerce.inventoryservice.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryUpdateRequest {

    /** Tồn kho mới (đặt tuyệt đối). Bắt buộc, số nguyên >= 0: để trống không được hiểu thành 0. */
    @NotNull(message = "Vui lòng nhập số lượng tồn kho.")
    @Min(value = 0, message = "Số lượng tồn kho không được âm.")
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Integer quantity;

    /** Lý do điều chỉnh (kiểm kê, hư hỏng, mất mát...) - lưu vào ghi chú của giao dịch kho để truy vết. */
    @NotBlank(message = "Vui lòng nhập lý do điều chỉnh tồn kho.")
    @Size(max = 500, message = "Lý do điều chỉnh tối đa 500 ký tự.")
    private String reason;
}
