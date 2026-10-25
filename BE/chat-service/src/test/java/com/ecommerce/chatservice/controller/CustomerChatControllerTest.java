package com.ecommerce.chatservice.controller;

import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.service.ChatMessageService;
import com.ecommerce.chatservice.service.ChatRoomService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * PH10 — Danh tính khách hàng / khách vãng lai ở CustomerChatController (gọi trực tiếp, không dựng Spring context):
 * ưu tiên X-User-Id (gateway inject từ JWT), rơi về X-Guest-Id, giải mã tên URL-encode, role mặc định ROLE_GUEST.
 */
@ExtendWith(MockitoExtension.class)
class CustomerChatControllerTest {

    @Mock private ChatRoomService chatRoomService;
    @Mock private ChatMessageService chatMessageService;

    @InjectMocks private CustomerChatController controller;

    @Test
    @DisplayName("TC_PH10_GUEST_01: Có X-User-Id -> dùng id thành viên, bỏ qua X-Guest-Id; X-User-Id rỗng -> dùng X-Guest-Id")
    void memberIdPreferredOverGuestId() {
        when(chatRoomService.getOrCreateRoom(anyString(), anyString(), any(), any()))
                .thenReturn(ChatRoomResponse.builder().id("r1").build());
        controller.getOrCreateRoom("user-uuid-1", "Lan", "lan@mail.vn", null, "guest_x_1", "Khách");
        verify(chatRoomService).getOrCreateRoom("user-uuid-1", "Lan", "lan@mail.vn", null);
        controller.getOrCreateRoom("", null, null, null, "guest_x_1", null);
        verify(chatRoomService).getOrCreateRoom(eq("guest_x_1"), anyString(), isNull(), isNull());
    }

    @Test
    @DisplayName("TC_PH10_GUEST_02: Tên khách URL-encode được giải mã (tiếng Việt có dấu); không có tên -> 'Khách vãng lai'")
    void guestNameDecodedOrDefault() {
        when(chatRoomService.getOrCreateRoom(anyString(), anyString(), any(), any()))
                .thenReturn(ChatRoomResponse.builder().id("r1").build());
        controller.getOrCreateRoom(null, null, null, null, "guest_a_1", "Nguy%E1%BB%85n%20V%C4%83n%20A");
        verify(chatRoomService).getOrCreateRoom("guest_a_1", "Nguyễn Văn A", null, null);
        controller.getOrCreateRoom(null, null, null, null, "guest_b_2", "");
        verify(chatRoomService).getOrCreateRoom("guest_b_2", "Khách vãng lai", null, null);
    }

    @Test
    @DisplayName("TC_PH10_GUEST_03: Thiếu cả X-User-Id lẫn X-Guest-Id -> 400 ở mọi endpoint khách; xem lịch sử/đóng phòng của khách vãng lai dùng role mặc định ROLE_GUEST")
    void missingIdentityRejected_guestRoleDefault() {
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.getOrCreateRoom(null, null, null, null, null, null)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.getMyRoom("", "")).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.getMyMessages("r1", null, null, null, 0, 20)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.closeMyRoom("r1", null, null, null)).getStatusCode());
        verifyNoInteractions(chatRoomService, chatMessageService);

        when(chatMessageService.getMessages(eq("r1"), eq("guest_a_1"), eq("ROLE_GUEST"), any())).thenReturn(Page.empty());
        controller.getMyMessages("r1", null, null, "guest_a_1", 0, 20);
        verify(chatMessageService).getMessages("r1", "guest_a_1", "ROLE_GUEST", PageRequest.of(0, 20));
        controller.closeMyRoom("r1", null, "", "guest_a_1");
        verify(chatRoomService).closeRoom("r1", "ROLE_GUEST", "guest_a_1");
    }
}
