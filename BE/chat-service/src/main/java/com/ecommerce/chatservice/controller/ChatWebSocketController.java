package com.ecommerce.chatservice.controller;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.service.ChatMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.List;
import java.util.Map;

@Controller
@RequiredArgsConstructor
@Slf4j
public class ChatWebSocketController {

    private final ChatMessageService chatMessageService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat.sendMessage")
    public void handleMessage(@Payload ChatMessageRequest request, SimpMessageHeaderAccessor headerAccessor, Principal principal) {
        if (principal == null) {
            log.warn("Unauthorized WebSocket message attempt rejected");
            return;
        }

        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes == null) {
            log.warn("Session attributes are missing");
            return;
        }

        String userId = (String) sessionAttributes.get("userId");
        String name = (String) sessionAttributes.get("name");
        @SuppressWarnings("unchecked")
        List<String> roles = (List<String>) sessionAttributes.get("roles");
        
        String senderRole = "CUSTOMER";
        if (roles != null && (roles.contains("STAFF") || roles.contains("ADMIN"))) {
            senderRole = "STAFF";
        }

        // Save message to MongoDB and update last message
        ChatMessageResponse savedMessage = chatMessageService.saveMessage(request, userId, name, senderRole);

        // Broadcast to subscribers of the room: /topic/room/{roomId}
        messagingTemplate.convertAndSend("/topic/room/" + request.getRoomId(), savedMessage);

        // Broadcast to administrative staff subscription channel for live update lists
        messagingTemplate.convertAndSend("/topic/rooms.updates", savedMessage);
    }
}
