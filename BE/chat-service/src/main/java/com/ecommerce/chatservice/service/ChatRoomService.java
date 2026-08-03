package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.entity.ChatRoom;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ChatRoomService {
    ChatRoomResponse getOrCreateRoom(String customerId, String name, String email, String avatar);
    ChatRoomResponse getMyActiveRoom(String customerId);
    ChatRoomResponse assignStaff(String roomId, String staffId, String staffName);
    ChatRoomResponse closeRoom(String roomId, String userRoles, String userId);
    ChatRoomResponse handoverRoom(String roomId);
    Page<ChatRoomResponse> getRoomsByStatus(String status, Pageable pageable);
    Page<ChatRoomResponse> getRoomsByStaff(String staffId, Pageable pageable);
    void autoAssignStaffIfPossible(ChatRoom room);
}
