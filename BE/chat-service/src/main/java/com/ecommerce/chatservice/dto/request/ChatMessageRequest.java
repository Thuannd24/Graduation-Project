package com.ecommerce.chatservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatMessageRequest {
    @NotBlank
    private String roomId;
    @NotBlank
    private String content;
    private String type = "TEXT"; // TEXT, IMAGE, FILE
}
