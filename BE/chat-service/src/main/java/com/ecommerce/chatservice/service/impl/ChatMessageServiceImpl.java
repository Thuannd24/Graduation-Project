package com.ecommerce.chatservice.service.impl;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.entity.ChatMessage;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatMessageRepository;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.ChatMessageService;
import com.ecommerce.chatservice.service.ChatRoomService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatMessageServiceImpl implements ChatMessageService {

    private final ChatMessageRepository chatMessageRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ChatRoomService chatRoomService;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public ChatMessageResponse saveMessage(ChatMessageRequest request, String senderId, String senderName, String senderRole) {
        ChatRoom room = chatRoomRepository.findById(request.getRoomId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phòng chat"));

        if ("CLOSED".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phòng chat đã đóng. Không thể gửi tin nhắn.");
        }

        // Auto-assign if the room is in WAITING state (e.g. staff came online in the meantime)
        if ("WAITING".equals(room.getStatus())) {
            chatRoomService.autoAssignStaffIfPossible(room);
        }

        // Save new message
        ChatMessage message = ChatMessage.builder()
                .roomId(request.getRoomId())
                .senderId(senderId)
                .senderName(senderName)
                .senderRole(senderRole)
                .content(request.getContent())
                .type(request.getType())
                .isRead(false)
                .createdAt(LocalDateTime.now())
                .build();
        ChatMessage saved = chatMessageRepository.save(message);

        // Update last message in the room
        room.setLastMessage(request.getContent());
        room.setLastMessageAt(LocalDateTime.now());
        room.setLastMessageSenderId(senderId);
        room.setUpdatedAt(LocalDateTime.now());
        chatRoomRepository.save(room);

        // Push offline email notification event via Kafka if still WAITING and sent by CUSTOMER
        if ("WAITING".equals(room.getStatus()) && "CUSTOMER".equals(senderRole)) {
            sendOfflineKafkaEvent(room, request.getContent());
        }

        return mapToResponse(saved);
    }

    private void sendOfflineKafkaEvent(ChatRoom room, String messageContent) {
        try {
            Map<String, Object> payload = Map.of(
                "roomId", room.getId(),
                "customerId", room.getCustomerId(),
                "customerName", room.getCustomerName(),
                "customerEmail", room.getCustomerEmail() != null ? room.getCustomerEmail() : "",
                "content", messageContent
            );
            
            Map<String, Object> event = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "eventType", "SupportChatOfflineEvent",
                "timestamp", LocalDateTime.now().toString(),
                "payload", payload
            );

            String eventJson = objectMapper.writeValueAsString(event);
            kafkaTemplate.send("notification-events", room.getId(), eventJson);
            log.info("Sent SupportChatOfflineEvent to Kafka for room {} (No staff online)", room.getId());
        } catch (Exception e) {
            log.error("Failed to send offline support chat event to Kafka", e);
        }
    }

    @Override
    public Page<ChatMessageResponse> getMessages(String roomId, String userId, String userRoles, Pageable pageable) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phòng chat"));

        boolean isStaff = userRoles.contains("STAFF") || userRoles.contains("ADMIN");
        boolean isOwner = room.getCustomerId().equals(userId);
        if (!isStaff && !isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Không có quyền xem lịch sử phòng chat này");
        }

        return chatMessageRepository.findByRoomIdOrderByCreatedAtDesc(roomId, pageable)
                .map(this::mapToResponse);
    }

    private ChatMessageResponse mapToResponse(ChatMessage msg) {
        return ChatMessageResponse.builder()
                .id(msg.getId())
                .roomId(msg.getRoomId())
                .senderId(msg.getSenderId())
                .senderName(msg.getSenderName())
                .senderRole(msg.getSenderRole())
                .content(msg.getContent())
                .type(msg.getType())
                .isRead(msg.isRead())
                .createdAt(msg.getCreatedAt())
                .build();
    }
}
