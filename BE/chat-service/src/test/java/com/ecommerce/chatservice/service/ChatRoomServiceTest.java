package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatRoomServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class ChatRoomServiceTest {

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private SetOperations<String, String> setOperations;

    @Mock
    private HashOperations<String, Object, Object> hashOperations;

    @InjectMocks
    private ChatRoomServiceImpl chatRoomService;

    @BeforeEach
    public void setUp() {
        // Setup Redis mocks if needed
    }

    @Test
    public void testGetOrCreateRoom_whenRoomExists() {
        ChatRoom existing = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .status("ACTIVE")
                .build();

        when(chatRoomRepository.findByCustomerIdAndStatusNot("cust456", "CLOSED"))
                .thenReturn(Optional.of(existing));

        ChatRoomResponse response = chatRoomService.getOrCreateRoom("cust456", "Cust Name", "cust@mail.com", "avatar");

        assertNotNull(response);
        assertEquals("room123", response.getId());
        assertEquals("ACTIVE", response.getStatus());
        verify(chatRoomRepository, never()).save(any(ChatRoom.class));
    }

    @Test
    public void testGetOrCreateRoom_whenRoomDoesNotExistAndNoStaffOnline() {
        when(chatRoomRepository.findByCustomerIdAndStatusNot("cust456", "CLOSED"))
                .thenReturn(Optional.empty());
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomResponse response = chatRoomService.getOrCreateRoom("cust456", "Cust Name", "cust@mail.com", "avatar");

        assertNotNull(response);
        assertEquals("AI_CHAT", response.getStatus());
        verify(chatRoomRepository, times(1)).save(any(ChatRoom.class));
    }

    @Test
    public void testAutoAssignStaffIfPossible_whenStaffOnline() {
        ChatRoom room = ChatRoom.builder().id("room1").build();

        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(setOperations.members("chat:online_staff")).thenReturn(Set.of("staff1", "staff2"));
        
        // Mock workload counts
        when(chatRoomRepository.countByStaffIdAndStatus("staff1", "ACTIVE")).thenReturn(5L);
        when(chatRoomRepository.countByStaffIdAndStatus("staff2", "ACTIVE")).thenReturn(2L); // staff2 has least active rooms
        
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(hashOperations.get("chat:staff_names", "staff2")).thenReturn("Staff Member 2");

        chatRoomService.autoAssignStaffIfPossible(room);

        assertEquals("ACTIVE", room.getStatus());
        assertEquals("staff2", room.getStaffId());
        assertEquals("Staff Member 2", room.getStaffName());
    }

    @Test
    public void testAssignStaff() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .status("WAITING")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomResponse response = chatRoomService.assignStaff("room123", "staff777", "Mr. Staff");

        assertNotNull(response);
        assertEquals("ACTIVE", response.getStatus());
        assertEquals("staff777", response.getStaffId());
        assertEquals("Mr. Staff", response.getStaffName());
    }

    @Test
    public void testCloseRoom_byOwner() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .status("ACTIVE")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomResponse response = chatRoomService.closeRoom("room123", "ROLE_USER", "cust456");

        assertNotNull(response);
        assertEquals("CLOSED", response.getStatus());
    }

    @Test
    public void testCloseRoom_forbidden() {
        ChatRoom room = ChatRoom.builder()
                .id("room123")
                .customerId("cust456")
                .status("ACTIVE")
                .build();

        when(chatRoomRepository.findById("room123")).thenReturn(Optional.of(room));

        assertThrows(ResponseStatusException.class, () -> {
            chatRoomService.closeRoom("room123", "ROLE_USER", "other_user");
        });
    }
}
