package com.ecommerce.productservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReviewReplyRequest {

    @NotBlank(message = "Nội dung phản hồi không được để trống")
    private String content;
}
