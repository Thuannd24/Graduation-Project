package com.ecommerce.chatservice.service.impl;

import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.entity.ChatRoom;
import com.ecommerce.chatservice.repository.ChatRoomRepository;
import com.ecommerce.chatservice.service.ChatRoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatRoomServiceImpl implements ChatRoomService {

    private final ChatRoomRepository chatRoomRepository;
    private final StringRedisTemplate redisTemplate;

    @Override
    public ChatRoomResponse getOrCreateRoom(String customerId, String name, String email, String avatar) {
        ChatRoom room = chatRoomRepository.findByCustomerIdAndStatusNot(customerId, "CLOSED")
                .orElseGet(() -> {
                    ChatRoom newRoom = ChatRoom.builder()
                            .customerId(customerId)
                            .customerName(name)
                            .customerEmail(email)
                            .customerAvatar(avatar)
                            .status("AI_CHAT") // Default to AI handling first
                            .createdAt(LocalDateTime.now())
                            .updatedAt(LocalDateTime.now())
                            .build();
                    return chatRoomRepository.save(newRoom);
                });
        return mapToResponse(room);
    }

    @Override
    public void autoAssignStaffIfPossible(ChatRoom room) {
        Set<String> onlineStaffIds = redisTemplate.opsForSet().members("chat:online_staff");
        if (onlineStaffIds != null && !onlineStaffIds.isEmpty()) {
            String assignedStaffId = null;
            long minRooms = Long.MAX_VALUE;
            
            // Workload distribution: find online staff with the least active chats
            for (String staffId : onlineStaffIds) {
                long activeCount = chatRoomRepository.countByStaffIdAndStatus(staffId, "ACTIVE");
                if (activeCount < minRooms) {
                    minRooms = activeCount;
                    assignedStaffId = staffId;
                }
            }
            
            if (assignedStaffId != null) {
                String staffName = (String) redisTemplate.opsForHash().get("chat:staff_names", assignedStaffId);
                room.setStaffId(assignedStaffId);
                room.setStaffName(staffName != null ? staffName : "Nhân viên hỗ trợ");
                room.setStatus("ACTIVE");
                log.info("Auto-assigned ChatRoom {} to online staff member {} (Active chats count: {})", 
                        room.getId(), room.getStaffName(), minRooms);
            }
        } else {
            room.setStatus("WAITING");
            log.info("No staff online. Room ChatRoom {} set to WAITING status.", room.getId());
        }
    }

    @Override
    public ChatRoomResponse getMyActiveRoom(String customerId) {
        ChatRoom room = chatRoomRepository.findByCustomerIdAndStatusNot(customerId, "CLOSED")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phiên hỗ trợ hoạt động"));
        return mapToResponse(room);
    }

    @Override
    public ChatRoomResponse assignStaff(String roomId, String staffId, String staffName) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phòng chat"));
        
        if ("CLOSED".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phòng chat đã đóng.");
        }

        room.setStaffId(staffId);
        room.setStaffName(staffName);
        room.setStatus("ACTIVE");
        room.setUpdatedAt(LocalDateTime.now());
        
        return mapToResponse(chatRoomRepository.save(room));
    }

    @Override
    public ChatRoomResponse closeRoom(String roomId, String userRoles, String userId) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phòng chat"));
        
        boolean isStaff = userRoles.contains("STAFF") || userRoles.contains("ADMIN");
        boolean isOwner = room.getCustomerId().equals(userId);
        
        if (!isStaff && !isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Không có quyền thực hiện thao tác này");
        }

        room.setStatus("CLOSED");
        room.setUpdatedAt(LocalDateTime.now());
        return mapToResponse(chatRoomRepository.save(room));
    }

    @Override
    public ChatRoomResponse handoverRoom(String roomId) {
        ChatRoom room = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy phòng chat"));

        if (!"AI_CHAT".equals(room.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phòng chat không ở trạng thái trò chuyện với AI.");
        }

        autoAssignStaffIfPossible(room);
        room.setUpdatedAt(LocalDateTime.now());
        
        return mapToResponse(chatRoomRepository.save(room));
    }

    @Override
    public Page<ChatRoomResponse> getRoomsByStatus(String status, Pageable pageable) {
        return chatRoomRepository.findByStatus(status, pageable).map(this::mapToResponse);
    }

    @Override
    public Page<ChatRoomResponse> getRoomsByStaff(String staffId, Pageable pageable) {
        return chatRoomRepository.findByStaffId(staffId, pageable).map(this::mapToResponse);
    }

    private ChatRoomResponse mapToResponse(ChatRoom room) {
        return ChatRoomResponse.builder()
                .id(room.getId())
                .customerId(room.getCustomerId())
                .customerName(room.getCustomerName())
                .customerEmail(room.getCustomerEmail())
                .customerAvatar(room.getCustomerAvatar())
                .staffId(room.getStaffId())
                .staffName(room.getStaffName())
                .status(room.getStatus())
                .lastMessage(room.getLastMessage())
                .lastMessageAt(room.getLastMessageAt())
                .createdAt(room.getCreatedAt())
                .build();
    }
}
