package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatMessageRepository;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatMessageServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * PH10 — BugCheck (surefire mặc định không chạy lớp *BugCheck). Khẳng định hành vi ĐÚNG nghiệp vụ mà code hiện tại chưa đạt.
 * Chạy riêng: mvn -pl chat-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class ChatMessageServiceImplBugCheck {

    @Mock private ChatMessageRepository chatMessageRepository;
    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private ChatRoomService chatRoomService;
    @Mock private KafkaTemplate<String, String> kafkaTemplate;
    @Mock private ObjectMapper objectMapper;
    @Mock private StorageService storageService;

    @InjectMocks private ChatMessageServiceImpl chatMessageService;

    @Test
    @DisplayName("TC_PH10_OWN_01: Khách B (CUSTOMER) gửi tin vào phòng của khách A phải bị chặn 403, không lưu tin")
    void customerCannotPostIntoAnotherCustomersRoom() {
        ChatRoom roomOfA = ChatRoom.builder().id("r1").customerId("cust-A").customerName("Lan").status("ACTIVE").build();
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(roomOfA));
        lenient().when(chatMessageRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        ChatMessageRequest req = new ChatMessageRequest();
        req.setRoomId("r1");
        req.setContent("Tin giả mạo chèn vào phòng người khác");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> chatMessageService.saveMessage(req, "cust-B", "Kẻ lạ", "CUSTOMER"));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(chatMessageRepository, never()).save(any());
    }
}
