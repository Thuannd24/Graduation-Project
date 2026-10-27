package com.ecommerce.chatservice.dto.response;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class ChatMessageResponse {
    private String id;
    private String roomId;
    private String senderId;
    private String senderName;
    private String senderRole;
    private String content;
    private String type;
    private boolean isRead;
    private LocalDateTime createdAt;
}
