package com.ecommerce.chatservice.dto.response;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class ChatRoomResponse {
    private String id;
    private String customerId;
    private String customerName;
    private String customerEmail;
    private String customerAvatar;
    private String staffId;
    private String staffName;
    private String status;
    private String lastMessage;
    private LocalDateTime lastMessageAt;
    private LocalDateTime createdAt;
}
