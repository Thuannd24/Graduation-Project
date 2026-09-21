package com.ecommerce.chatservice.controller;

import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.service.ChatMessageService;
import com.ecommerce.chatservice.service.ChatRoomService;
import com.ecommerce.chatservice.util.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

import org.springframework.web.multipart.MultipartFile;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/public/chat")
@RequiredArgsConstructor
@Slf4j
public class CustomerChatController {

    private final ChatRoomService chatRoomService;
    private final ChatMessageService chatMessageService;

    // Requests support (creates a new chat room starting at AI_CHAT, or retrieves active one)
    @PostMapping("/rooms")
    public ApiResponse<ChatRoomResponse> getOrCreateRoom(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Name", required = false) String name,
            @RequestHeader(value = "X-User-Email", required = false) String email,
            @RequestHeader(value = "X-User-Avatar", required = false) String avatar,
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId,
            @RequestHeader(value = "X-Guest-Name", required = false) String guestName) {

        String clientUserId = (userId != null && !userId.isEmpty()) ? userId : guestId;
        String decodedName = decodeHeaderValue(name);
        String decodedGuestName = decodeHeaderValue(guestName);
        String clientName = (decodedName != null && !decodedName.isEmpty())
                ? decodedName
                : (decodedGuestName != null && !decodedGuestName.isEmpty() ? decodedGuestName : "Khách vãng lai");
        
        if (clientUserId == null || clientUserId.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Missing client identifier");
        }
        
        ChatRoomResponse response = chatRoomService.getOrCreateRoom(clientUserId, clientName, email, avatar);
        return ApiResponse.success(response);
    }

    // Retrieves information about the active chat room for the client (member or guest)
    @GetMapping("/rooms/my")
    public ApiResponse<ChatRoomResponse> getMyRoom(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId) {
        
        String clientUserId = (userId != null && !userId.isEmpty()) ? userId : guestId;
        if (clientUserId == null || clientUserId.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Missing client identifier");
        }
        
        ChatRoomResponse response = chatRoomService.getMyActiveRoom(clientUserId);
        return ApiResponse.success(response);
    }

    // Fetches conversation message history for the customer's chat room
    @GetMapping("/rooms/{roomId}/messages")
    public ApiResponse<Page<ChatMessageResponse>> getMyMessages(
            @PathVariable String roomId,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String roles,
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        String clientUserId = (userId != null && !userId.isEmpty()) ? userId : guestId;
        String clientRoles = (roles != null && !roles.isEmpty()) ? roles : "ROLE_GUEST";
        
        if (clientUserId == null || clientUserId.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Missing client identifier");
        }
        
        Pageable pageable = PageRequest.of(page, size);
        Page<ChatMessageResponse> messages = chatMessageService.getMessages(roomId, clientUserId, clientRoles, pageable);
        return ApiResponse.success(messages);
    }

    // Customers close their own support session
    @PutMapping("/rooms/{roomId}/close")
    public ApiResponse<ChatRoomResponse> closeMyRoom(
            @PathVariable String roomId,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String roles,
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId) {
        
        String clientUserId = (userId != null && !userId.isEmpty()) ? userId : guestId;
        String clientRoles = (roles != null && !roles.isEmpty()) ? roles : "ROLE_GUEST";
        
        if (clientUserId == null || clientUserId.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Missing client identifier");
        }
        
        ChatRoomResponse response = chatRoomService.closeRoom(roomId, clientRoles, clientUserId);
        return ApiResponse.success(response);
    }

    // Uploads an image attachment for a chat room (used by both customer and staff before sending an IMAGE message via WebSocket)
    @PostMapping("/rooms/{roomId}/upload-image")
    public ApiResponse<Map<String, String>> uploadImage(
            @PathVariable String roomId,
            @RequestParam("file") MultipartFile file) {
        String url = chatMessageService.uploadImage(roomId, file);
        return ApiResponse.success(Map.of("url", url));
    }

    // Hands over conversation from AI Chatbot to human staff support
    @PutMapping("/rooms/{roomId}/handover")
    public ApiResponse<ChatRoomResponse> handoverToStaff(@PathVariable String roomId) {
        ChatRoomResponse response = chatRoomService.handoverRoom(roomId);
        return ApiResponse.success(response);
    }

    // X-User-Name (Gateway) và X-Guest-Name (FE) đều được URL-encode để tránh lỗi
    // "non ISO-8859-1 code point" khi tên có dấu tiếng Việt được gắn vào HTTP header.
    private String decodeHeaderValue(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("Failed to URL-decode header value '{}': {}", value, e.getMessage());
            return value;
        }
    }
}
