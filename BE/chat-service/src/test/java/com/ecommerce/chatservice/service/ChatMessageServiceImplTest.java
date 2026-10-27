package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.entity.ChatMessage;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatMessageRepository;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatMessageServiceImpl;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * PH10 — ChatMessageServiceImpl: lưu tin nhắn (cập nhật phòng, tự phân công khi WAITING, sự kiện offline Kafka),
 * xem lịch sử theo quyền, upload ảnh. Repository/Kafka/ObjectMapper/Storage đều mock (không gửi lên topic thật).
 */
@ExtendWith(MockitoExtension.class)
class ChatMessageServiceImplTest {

    @Mock private ChatMessageRepository chatMessageRepository;
    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private ChatRoomService chatRoomService;
    @Mock private KafkaTemplate<String, String> kafkaTemplate;
    @Mock private ObjectMapper objectMapper;
    @Mock private StorageService storageService;

    @InjectMocks private ChatMessageServiceImpl chatMessageService;

    private ChatMessageRequest req(String content, String type) {
        ChatMessageRequest r = new ChatMessageRequest();
        r.setRoomId("r1");
        r.setContent(content);
        r.setType(type);
        return r;
    }

    private ChatRoom room(String status) {
        return ChatRoom.builder().id("r1").customerId("cust-A").customerName("Lan").status(status).build();
    }

    @Test
    @DisplayName("TC_PH10_MSG_01: Gửi tin vào phòng ACTIVE -> lưu tin (isRead=false, giữ type IMAGE), cập nhật lastMessage/người gửi của phòng, không bắn Kafka")
    void saveMessage_updatesRoom() {
        ChatRoom r = room("ACTIVE");
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(r));
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(i -> i.getArgument(0));

        ChatMessageResponse res = chatMessageService.saveMessage(req("http://minio/chat/r1/a.png", "IMAGE"), "staff-1", "Minh", "STAFF");

        assertEquals("IMAGE", res.getType());
        assertFalse(res.isRead());
        assertEquals("http://minio/chat/r1/a.png", r.getLastMessage());
        assertEquals("staff-1", r.getLastMessageSenderId());
        assertNotNull(r.getLastMessageAt());
        verify(chatRoomRepository).save(r);
        verifyNoInteractions(kafkaTemplate);
        verify(chatRoomService, never()).autoAssignStaffIfPossible(any());
    }

    @Test
    @DisplayName("TC_PH10_MSG_02: Phòng WAITING -> thử tự phân công; nhân viên vừa online nhận phòng (ACTIVE) thì KHÔNG gửi email offline")
    void saveMessage_waitingThenAssigned_noOfflineEvent() {
        ChatRoom r = room("WAITING");
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(r));
        doAnswer(i -> { ((ChatRoom) i.getArgument(0)).setStatus("ACTIVE"); return null; })
                .when(chatRoomService).autoAssignStaffIfPossible(r);
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(i -> i.getArgument(0));

        chatMessageService.saveMessage(req("Alo", "TEXT"), "cust-A", "Lan", "CUSTOMER");

        verify(chatRoomService).autoAssignStaffIfPossible(r);
        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    @DisplayName("TC_PH10_MSG_03: Vẫn WAITING + người gửi là CUSTOMER -> gửi SupportChatOfflineEvent lên notification-events (key=roomId, email null -> chuỗi rỗng)")
    void saveMessage_offlineEventPayload() throws Exception {
        ChatRoom r = room("WAITING");
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(r));
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(i -> i.getArgument(0));
        when(objectMapper.writeValueAsString(any())).thenReturn("{json}");

        chatMessageService.saveMessage(req("Có ai không?", "TEXT"), "cust-A", "Lan", "CUSTOMER");

        ArgumentCaptor<Object> cap = ArgumentCaptor.forClass(Object.class);
        verify(objectMapper).writeValueAsString(cap.capture());
        @SuppressWarnings("unchecked") Map<String, Object> event = (Map<String, Object>) cap.getValue();
        assertEquals("SupportChatOfflineEvent", event.get("eventType"));
        @SuppressWarnings("unchecked") Map<String, Object> payload = (Map<String, Object>) event.get("payload");
        assertEquals("", payload.get("customerEmail"));
        assertEquals("Có ai không?", payload.get("content"));
        verify(kafkaTemplate).send("notification-events", "r1", "{json}");
    }

    @Test
    @DisplayName("TC_PH10_MSG_04: Phòng WAITING nhưng người gửi là STAFF -> không gửi email offline; lỗi serialize Kafka không làm mất tin nhắn")
    void saveMessage_staffNoEvent_andKafkaFailureSwallowed() throws Exception {
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(i -> i.getArgument(0));
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("WAITING")));
        chatMessageService.saveMessage(req("Chào bạn", "TEXT"), "staff-1", "Minh", "STAFF");
        verifyNoInteractions(objectMapper, kafkaTemplate);

        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("WAITING")));
        when(objectMapper.writeValueAsString(any())).thenThrow(new JsonProcessingException("boom") {});
        ChatMessageResponse res = assertDoesNotThrow(
                () -> chatMessageService.saveMessage(req("Alo", "TEXT"), "cust-A", "Lan", "CUSTOMER"));
        assertEquals("Alo", res.getContent());
        verify(chatMessageRepository, times(2)).save(any(ChatMessage.class));
    }

    @Test
    @DisplayName("TC_PH10_MSG_05: Gửi tin vào phòng không tồn tại -> 404, không lưu gì")
    void saveMessage_roomNotFound() {
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> chatMessageService.saveMessage(req("x", "TEXT"), "cust-A", "Lan", "CUSTOMER")).getStatusCode());
        verifyNoInteractions(chatMessageRepository);
    }

    @Test
    @DisplayName("TC_PH10_MSG_06: Xem lịch sử: khách vãng lai chủ phòng (ROLE_GUEST) và ADMIN được xem; phòng không tồn tại -> 404")
    void getMessages_guestOwnerAndAdmin() {
        ChatRoom guestRoom = ChatRoom.builder().id("r1").customerId("guest_x_1").status("AI_CHAT").build();
        PageRequest page = PageRequest.of(0, 20);
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(guestRoom));
        when(chatMessageRepository.findByRoomIdOrderByCreatedAtDesc("r1", page))
                .thenReturn(new PageImpl<>(List.of(ChatMessage.builder().id("m1").roomId("r1").content("hi").build())));

        assertEquals(1, chatMessageService.getMessages("r1", "guest_x_1", "ROLE_GUEST", page).getTotalElements());
        assertEquals("hi", chatMessageService.getMessages("r1", "admin-1", "ROLE_ADMIN", page).getContent().get(0).getContent());

        when(chatRoomRepository.findById("zz")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> chatMessageService.getMessages("zz", "admin-1", "ROLE_ADMIN", page)).getStatusCode());
    }

    @Test
    @DisplayName("TC_PH10_MSG_07: Upload ảnh: file không hợp lệ (storage ném IllegalArgumentException) -> 400; phòng không tồn tại -> 404")
    void uploadImage_invalidFileOrMissingRoom() {
        MockMultipartFile exe = new MockMultipartFile("file", "virus.exe", "application/octet-stream", new byte[]{1});
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("ACTIVE")));
        when(storageService.uploadFile(exe, "chat/r1")).thenThrow(new IllegalArgumentException("Chỉ chấp nhận file ảnh"));
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> chatMessageService.uploadImage("r1", exe));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Chỉ chấp nhận file ảnh", ex.getReason());

        when(chatRoomRepository.findById("r9")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> chatMessageService.uploadImage("r9", exe)).getStatusCode());
    }
}
