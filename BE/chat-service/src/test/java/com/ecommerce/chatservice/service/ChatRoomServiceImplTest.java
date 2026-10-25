package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.impl.ChatRoomServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * PH10 — ChatRoomServiceImpl: tạo/lấy phòng, chuyển AI -> nhân viên (handover), phân công theo tải, đóng phòng.
 * Repository Mongo, Redis và SimpMessagingTemplate đều mock.
 */
@ExtendWith(MockitoExtension.class)
class ChatRoomServiceImplTest {

    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private StringRedisTemplate redisTemplate;
    @Mock private SetOperations<String, String> setOperations;
    @Mock private HashOperations<String, Object, Object> hashOperations;
    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private ChatRoomServiceImpl chatRoomService;

    private ChatRoom room(String status) {
        return ChatRoom.builder().id("r1").customerId("cust-A").customerName("Lan").status(status).build();
    }

    @Test
    @DisplayName("TC_PH10_ROOM_01: Khách chưa có phòng mở -> tạo phòng mới trạng thái AI_CHAT, chỉ tìm phòng có status khác CLOSED")
    void getOrCreateRoom_createsAiChatRoom() {
        when(chatRoomRepository.findByCustomerIdAndStatusNot("cust-A", "CLOSED")).thenReturn(Optional.empty());
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        ChatRoomResponse res = chatRoomService.getOrCreateRoom("cust-A", "Lan", "lan@mail.vn", "/a.png");

        ArgumentCaptor<ChatRoom> cap = ArgumentCaptor.forClass(ChatRoom.class);
        verify(chatRoomRepository).save(cap.capture());
        assertEquals("AI_CHAT", cap.getValue().getStatus());
        assertEquals("lan@mail.vn", cap.getValue().getCustomerEmail());
        assertNotNull(cap.getValue().getCreatedAt());
        assertEquals("AI_CHAT", res.getStatus());
        assertNull(res.getStaffId());
    }

    @Test
    @DisplayName("TC_PH10_ROOM_02: Không có phòng đang mở -> getMyActiveRoom trả 404")
    void getMyActiveRoom_notFound() {
        when(chatRoomRepository.findByCustomerIdAndStatusNot("cust-A", "CLOSED")).thenReturn(Optional.empty());
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> chatRoomService.getMyActiveRoom("cust-A"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    @DisplayName("TC_PH10_HAND_01: Handover khi có nhân viên online -> giao cho người ít phòng ACTIVE nhất, status ACTIVE, lấy tên từ Redis")
    void handover_assignsLeastLoadedStaff() {
        ChatRoom r = room("AI_CHAT");
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(r));
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(setOperations.members("chat:online_staff")).thenReturn(new LinkedHashSet<>(List.of("staff-busy", "staff-free")));
        when(chatRoomRepository.countByStaffIdAndStatus("staff-busy", "ACTIVE")).thenReturn(3L);
        when(chatRoomRepository.countByStaffIdAndStatus("staff-free", "ACTIVE")).thenReturn(1L);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(hashOperations.get("chat:staff_names", "staff-free")).thenReturn("Minh");
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        ChatRoomResponse res = chatRoomService.handoverRoom("r1");

        assertEquals("ACTIVE", res.getStatus());
        assertEquals("staff-free", res.getStaffId());
        assertEquals("Minh", res.getStaffName());
    }

    @Test
    @DisplayName("TC_PH10_HAND_02: Nhân viên online nhưng chưa có tên trong Redis -> tên mặc định 'Nhân viên hỗ trợ'")
    void handover_defaultStaffName() {
        ChatRoom r = room("AI_CHAT");
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(r));
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(setOperations.members("chat:online_staff")).thenReturn(Set.of("staff-1"));
        when(chatRoomRepository.countByStaffIdAndStatus("staff-1", "ACTIVE")).thenReturn(0L);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(hashOperations.get("chat:staff_names", "staff-1")).thenReturn(null);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        assertEquals("Nhân viên hỗ trợ", chatRoomService.handoverRoom("r1").getStaffName());
    }

    @Test
    @DisplayName("TC_PH10_HAND_03: Handover khi không có nhân viên online (set rỗng hoặc null) -> phòng chuyển WAITING, chưa có staff")
    void handover_noStaffOnline_waiting() {
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("AI_CHAT")));
        when(setOperations.members("chat:online_staff")).thenReturn(Set.of());
        ChatRoomResponse res = chatRoomService.handoverRoom("r1");
        assertEquals("WAITING", res.getStatus());
        assertNull(res.getStaffId());

        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("AI_CHAT")));
        when(setOperations.members("chat:online_staff")).thenReturn(null);
        assertEquals("WAITING", chatRoomService.handoverRoom("r1").getStatus());
    }

    @Test
    @DisplayName("TC_PH10_HAND_04: Chỉ handover được phòng đang AI_CHAT; WAITING/ACTIVE/CLOSED -> 400, không lưu")
    void handover_rejectsWrongState() {
        for (String status : List.of("WAITING", "ACTIVE", "CLOSED")) {
            when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room(status)));
            ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> chatRoomService.handoverRoom("r1"));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode(), status);
        }
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH10_HAND_05: Handover / nhận phòng với roomId không tồn tại -> 404; nhân viên nhận phòng đã CLOSED -> 400")
    void handoverAndAssign_notFoundOrClosed() {
        when(chatRoomRepository.findById("ghost")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(ResponseStatusException.class, () -> chatRoomService.handoverRoom("ghost")).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(ResponseStatusException.class, () -> chatRoomService.assignStaff("ghost", "s1", "Minh")).getStatusCode());
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("CLOSED")));
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ResponseStatusException.class, () -> chatRoomService.assignStaff("r1", "s1", "Minh")).getStatusCode());
        verify(chatRoomRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH10_CLOSE_01: Nhân viên (ROLE_STAFF) đóng phòng của khách -> CLOSED + phát thông báo hệ thống 'Nhân viên đã kết thúc' tới /topic/room/{id}")
    void closeRoom_byStaff_broadcastsNotice() {
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("ACTIVE")));
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));

        ChatRoomResponse res = chatRoomService.closeRoom("r1", "ROLE_STAFF", "staff-9");

        assertEquals("CLOSED", res.getStatus());
        ArgumentCaptor<Object> cap = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/room/r1"), cap.capture());
        ChatMessageResponse notice = (ChatMessageResponse) cap.getValue();
        assertEquals("SYSTEM_ROOM_CLOSED", notice.getType());
        assertEquals("SYSTEM", notice.getSenderRole());
        assertEquals("Nhân viên đã kết thúc phiên hỗ trợ này.", notice.getContent());
    }

    @Test
    @DisplayName("TC_PH10_CLOSE_02: ADMIN đóng được mọi phòng; khách vãng lai (ROLE_GUEST) đóng phòng của chính mình -> thông báo 'Khách hàng đã kết thúc'")
    void closeRoom_adminAndGuestOwner() {
        when(chatRoomRepository.save(any(ChatRoom.class))).thenAnswer(i -> i.getArgument(0));
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("WAITING")));
        assertEquals("CLOSED", chatRoomService.closeRoom("r1", "ROLE_ADMIN", "admin-1").getStatus());

        ChatRoom guestRoom = ChatRoom.builder().id("r2").customerId("guest_abc_1").status("AI_CHAT").build();
        when(chatRoomRepository.findById("r2")).thenReturn(Optional.of(guestRoom));
        assertEquals("CLOSED", chatRoomService.closeRoom("r2", "ROLE_GUEST", "guest_abc_1").getStatus());
        ArgumentCaptor<Object> cap = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/room/r2"), cap.capture());
        assertEquals("Khách hàng đã kết thúc phiên hỗ trợ này.", ((ChatMessageResponse) cap.getValue()).getContent());
    }

    @Test
    @DisplayName("TC_PH10_CLOSE_03: Khách khác (không phải chủ phòng, không phải staff) đóng phòng -> 403, không lưu, không phát thông báo; phòng không tồn tại -> 404")
    void closeRoom_forbiddenOrNotFound() {
        when(chatRoomRepository.findById("r1")).thenReturn(Optional.of(room("ACTIVE")));
        assertEquals(HttpStatus.FORBIDDEN,
                assertThrows(ResponseStatusException.class, () -> chatRoomService.closeRoom("r1", "ROLE_CUSTOMER", "cust-B")).getStatusCode());
        when(chatRoomRepository.findById("nope")).thenReturn(Optional.empty());
        assertEquals(HttpStatus.NOT_FOUND,
                assertThrows(ResponseStatusException.class, () -> chatRoomService.closeRoom("nope", "ROLE_STAFF", "s")).getStatusCode());
        verify(chatRoomRepository, never()).save(any());
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("TC_PH10_ROOM_03: Danh sách phòng theo trạng thái / theo nhân viên được map sang DTO, giữ phân trang")
    void listRooms_mapped() {
        PageRequest page = PageRequest.of(0, 20);
        when(chatRoomRepository.findByStatus("WAITING", page)).thenReturn(new PageImpl<>(List.of(room("WAITING")), page, 1));
        ChatRoom assigned = room("ACTIVE");
        assigned.setStaffId("s1");
        when(chatRoomRepository.findByStaffId("s1", page)).thenReturn(new PageImpl<>(List.of(assigned), page, 1));

        assertEquals("cust-A", chatRoomService.getRoomsByStatus("WAITING", page).getContent().get(0).getCustomerId());
        assertEquals("s1", chatRoomService.getRoomsByStaff("s1", page).getContent().get(0).getStaffId());
    }
}
