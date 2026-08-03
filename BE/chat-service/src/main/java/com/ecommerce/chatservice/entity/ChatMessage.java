package com.ecommerce.chatservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "chatMessages")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {
    @Id
    private String id;

    @Indexed
    private String roomId; // References chatRooms.id

    @Indexed
    private String senderId; // Keycloak UUID
    private String senderName;
    private String senderRole; // CUSTOMER, STAFF, AI
    private String content;
    private String type; // TEXT, IMAGE, FILE
    private boolean isRead;
    private LocalDateTime createdAt;
}
