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
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * PH10 — BugCheck (surefire mặc định không chạy lớp *BugCheck). Chạy riêng: -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class CustomerChatControllerBugCheck {

    @Mock private ChatRoomService chatRoomService;
    @Mock private ChatMessageService chatMessageService;

    @InjectMocks private CustomerChatController controller;

    @Test
    @DisplayName("TC_PH10_GUEST_04: Request không có X-User-Id mà X-Guest-Id mang UUID của thành viên (không phải dạng 'guest_*' FE sinh ra) phải bị từ chối, không trả phòng chat của thành viên đó")
    void guestHeaderCannotImpersonateMember() {
        String memberUuid = "42d23463-560c-4491-b0d2-b4a5d65412ef";
        lenient().when(chatRoomService.getMyActiveRoom(anyString()))
                .thenReturn(ChatRoomResponse.builder().id("room-of-member").customerId(memberUuid).build());

        assertThrows(ResponseStatusException.class, () -> controller.getMyRoom(null, memberUuid));
        verify(chatRoomService, never()).getMyActiveRoom(memberUuid);
    }
}
