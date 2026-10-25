package com.ecommerce.chatservice.controller;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.service.ChatMessageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * PH10 — ChatWebSocketController (@MessageMapping /chat.sendMessage): xác định vai trò người gửi từ session
 * attributes (do WebSocketConfig gắn lúc CONNECT), lưu tin và broadcast. Service và broker đều mock.
 */
@ExtendWith(MockitoExtension.class)
class ChatWebSocketControllerTest {

    @Mock private ChatMessageService chatMessageService;
    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private ChatWebSocketController controller;

    private final Principal principal = () -> "user";

    private ChatMessageRequest req() {
        ChatMessageRequest r = new ChatMessageRequest();
        r.setRoomId("r1");
        r.setContent("Xin chào");
        return r;
    }

    private SimpMessageHeaderAccessor session(String userId, String name, List<String> roles) {
        SimpMessageHeaderAccessor acc = SimpMessageHeaderAccessor.create();
        Map<String, Object> attrs = new HashMap<>();
        attrs.put("userId", userId);
        attrs.put("name", name);
        attrs.put("roles", roles);
        acc.setSessionAttributes(attrs);
        return acc;
    }

    @Test
    @DisplayName("TC_PH10_WS_01: Kết nối chưa xác thực (principal null) hoặc thiếu session attributes -> bỏ qua, không lưu, không broadcast")
    void unauthenticatedOrNoSession_ignored() {
        controller.handleMessage(req(), session("u", "n", List.of()), null);
        SimpMessageHeaderAccessor noAttrs = SimpMessageHeaderAccessor.create();
        controller.handleMessage(req(), noAttrs, principal);
        verifyNoInteractions(chatMessageService, messagingTemplate);
    }

    @Test
    @DisplayName("TC_PH10_WS_02: Khách (role CUSTOMER / GUEST) gửi tin -> senderRole CUSTOMER, broadcast tới /topic/room/{id} và /topic/rooms.updates")
    void customerAndGuest_broadcast() {
        ChatMessageResponse saved = ChatMessageResponse.builder().id("m1").roomId("r1").build();
        when(chatMessageService.saveMessage(any(), anyString(), anyString(), eq("CUSTOMER"))).thenReturn(saved);

        controller.handleMessage(req(), session("cust-A", "Lan", List.of("CUSTOMER")), principal);
        controller.handleMessage(req(), session("guest_abc_1", "Khách vãng lai", List.of("GUEST")), principal);

        verify(chatMessageService).saveMessage(any(), eq("cust-A"), eq("Lan"), eq("CUSTOMER"));
        verify(chatMessageService).saveMessage(any(), eq("guest_abc_1"), eq("Khách vãng lai"), eq("CUSTOMER"));
        verify(messagingTemplate, times(2)).convertAndSend("/topic/room/r1", saved);
        verify(messagingTemplate, times(2)).convertAndSend("/topic/rooms.updates", saved);
    }

    @Test
    @DisplayName("TC_PH10_WS_03: Role staff/admin (không phân biệt hoa thường, có hoặc không tiền tố ROLE_) -> senderRole STAFF")
    void staffRoles_detected() {
        when(chatMessageService.saveMessage(any(), anyString(), anyString(), anyString()))
                .thenReturn(ChatMessageResponse.builder().roomId("r1").build());
        for (List<String> roles : List.of(List.of("staff"), List.of("ROLE_ADMIN"), List.of("offline_access", "ADMIN"))) {
            controller.handleMessage(req(), session("s-1", "Minh", roles), principal);
        }
        verify(chatMessageService, times(3)).saveMessage(any(), eq("s-1"), eq("Minh"), eq("STAFF"));
    }

    @Test
    @DisplayName("TC_PH10_WS_04: Gửi tin qua WebSocket vào phòng đã CLOSED -> lỗi 400 từ service lan ra, KHÔNG broadcast tin nào")
    void sendToClosedRoom_noBroadcast() {
        when(chatMessageService.saveMessage(any(), anyString(), anyString(), anyString()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phòng chat đã đóng. Không thể gửi tin nhắn."));
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> controller.handleMessage(req(), session("cust-A", "Lan", List.of("CUSTOMER")), principal));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(messagingTemplate);
    }
}
