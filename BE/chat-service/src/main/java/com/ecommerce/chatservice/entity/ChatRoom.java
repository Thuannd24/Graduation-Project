package com.ecommerce.chatservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "chatRooms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatRoom {
    @Id
    private String id;

    @Indexed(unique = true)
    private String customerId; // Keycloak User UUID
    private String customerName;
    private String customerEmail;
    private String customerAvatar;

    @Indexed
    private String staffId; // Keycloak User UUID
    private String staffName;
    private String staffAvatar;

    private String status; // AI_CHAT, WAITING, ACTIVE, CLOSED
    private String lastMessage;
    private LocalDateTime lastMessageAt;
    private String lastMessageSenderId;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
