package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatRoomServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * PH10 — BugCheck (surefire mặc định không chạy lớp *BugCheck). Chạy riêng: -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class ChatRoomServiceImplBugCheck {

    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private StringRedisTemplate redisTemplate;
    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private ChatRoomServiceImpl chatRoomService;

    @Test
    @DisplayName("TC_PH10_CLOSE_04: Đóng phòng đã CLOSED phải bị từ chối 400 (như assignStaff), không ghi lại và không phát lại thông báo 'đã kết thúc'")
    void closingAlreadyClosedRoomRejected() {
        ChatRoom closed = ChatRoom.builder().id("r1").customerId("cust-A").status("CLOSED").build();
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(closed));
        lenient().when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> chatRoomService.closeRoom("r1", "ROLE_STAFF", "staff-1"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verifyNoInteractions(messagingTemplate);
    }
}
