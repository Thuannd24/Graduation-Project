package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.entity.ChatMessage;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatMessageRepository;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatMessageServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class ChatMessageServiceTest {

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private ChatMessageServiceImpl chatMessageService;

    @Test
    public void testSaveMessage_whenRoomIsActive() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .status("ACTIVE")
                .build();

        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("room123");
        request.setContent("Hello!");
        request.setType("TEXT");

        ChatMessage savedMsg = ChatMessage.builder()
                .id("msg999")
                .roomId("room123")
                .senderId("user1")
                .senderName("User One")
                .senderRole("CUSTOMER")
                .content("Hello!")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        when(chatMessageRepository.save(any(ChatMessage.class))).thenReturn(savedMsg);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(room);

        ChatMessageResponse response = chatMessageService.saveMessage(request, "user1", "User One", "CUSTOMER");

        assertNotNull(response);
        assertEquals("msg999", response.getId());
        assertEquals("Hello!", response.getContent());
        verify(chatRoomService, never()).autoAssignStaffIfPossible(any(ChatRoom.class));
        verify(kafkaTemplate, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    public void testSaveMessage_whenRoomIsClosed() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .status("CLOSED")
                .build();

        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("room123");

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));

        assertThrows(ResponseStatusException.class, () -> {
            chatMessageService.saveMessage(request, "user1", "User One", "CUSTOMER");
        });
    }

    @Test
    public void testSaveMessage_whenRoomIsWaiting_triggersOfflineKafkaEvent() throws Exception {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .customerName("Customer Name")
                .customerEmail("cust@mail.com")
                .status("WAITING")
                .build();

        ChatMessageRequest request = new ChatMessageRequest();
        request.setRoomId("room123");
        request.setContent("Emergency support needed");

        ChatMessage savedMsg = ChatMessage.builder()
                .id("msg999")
                .roomId("room123")
                .content("Emergency support needed")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        doAnswer(invocation -> {
            ChatRoom r = invocation.getArgument(0);
            r.setStatus("WAITING"); // staff remains offline
            return null;
        }).when(chatRoomService).autoAssignStaffIfPossible(any(ChatRoom.class));

        when(chatMessageRepository.save(any(ChatMessage.class))).thenReturn(savedMsg);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenReturn(room);
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"event\": \"json\"}");

        chatMessageService.saveMessage(request, "cust456", "Customer Name", "CUSTOMER");

        verify(chatRoomService, times(1)).autoAssignStaffIfPossible(room);
        verify(kafkaTemplate, times(1)).send(eq("notification-events"), eq("room123"), anyString());
    }

    @Test
    public void testGetMessages_authorizedOwner() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .build();

        PageImpl<ChatMessage> page = new PageImpl<>(List.of(
                ChatMessage.builder().content("Msg 1").build()
        ));

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        when(chatMessageRepository.findByRoomIdOrderByCreatedAtDesc(eq("room123"), any())).thenReturn(page);

        Page<ChatMessageResponse> response = chatMessageService.getMessages("room123", "cust456", "ROLE_USER", PageRequest.of(0, 10));

        assertNotNull(response);
        assertEquals(1, response.getContent().size());
        assertEquals("Msg 1", response.getContent().get(0).getContent());
    }

    @Test
    public void testGetMessages_forbiddenForOtherCustomer() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));

        assertThrows(ResponseStatusException.class, () -> {
            chatMessageService.getMessages("room123", "other_cust", "ROLE_USER", PageRequest.of(0, 10));
        });
    }

    @Test
    public void testGetMessages_authorizedStaff() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .build();

        PageImpl<ChatMessage> page = new PageImpl<>(List.of(
                ChatMessage.builder().content("Msg 1").build()
        ));

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        when(chatMessageRepository.findByRoomIdOrderByCreatedAtDesc(eq("room123"), any())).thenReturn(page);

        Page<ChatMessageResponse> response = chatMessageService.getMessages("room123", "other_user", "ROLE_STAFF", PageRequest.of(0, 10));

        assertNotNull(response);
        assertEquals(1, response.getContent().size());
    }
}
