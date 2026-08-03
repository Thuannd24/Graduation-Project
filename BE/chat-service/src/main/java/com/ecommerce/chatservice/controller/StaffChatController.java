package com.ecommerce.chatservice.controller;

import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import com.ecommerce.chatservice.dto.response.ChatRoomResponse;
import com.ecommerce.chatservice.service.ChatMessageService;
import com.ecommerce.chatservice.service.ChatRoomService;
import com.ecommerce.chatservice.util.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/chat")
@PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
@RequiredArgsConstructor
public class StaffChatController {

    private final ChatRoomService chatRoomService;
    private final ChatMessageService chatMessageService;

    // View rooms filtered by status (e.g. WAITING, ACTIVE, CLOSED)
    @GetMapping("/rooms")
    public ApiResponse<Page<ChatRoomResponse>> getRoomsByStatus(
            @RequestParam(defaultValue = "WAITING") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<ChatRoomResponse> rooms = chatRoomService.getRoomsByStatus(status, pageable);
        return ApiResponse.success(rooms);
    }

    // View active chat rooms assigned to the authenticated staff member
    @GetMapping("/rooms/my-assigned")
    public ApiResponse<Page<ChatRoomResponse>> getMyAssignedRooms(
            @RequestHeader("X-User-Id") String staffId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<ChatRoomResponse> rooms = chatRoomService.getRoomsByStaff(staffId, pageable);
        return ApiResponse.success(rooms);
    }

    // Manually accept/assign support room to current staff member
    @PutMapping("/rooms/{roomId}/assign")
    public ApiResponse<ChatRoomResponse> assignRoom(
            @PathVariable String roomId,
            @RequestHeader("X-User-Id") String staffId,
            @RequestHeader("X-User-Name") String staffName) {
        
        ChatRoomResponse response = chatRoomService.assignStaff(roomId, staffId, staffName);
        return ApiResponse.success(response);
    }

    // Close and complete chat room support session
    @PutMapping("/rooms/{roomId}/close")
    public ApiResponse<ChatRoomResponse> closeRoom(
            @PathVariable String roomId,
            @RequestHeader("X-User-Id") String staffId,
            @RequestHeader("X-User-Roles") String roles) {
        
        ChatRoomResponse response = chatRoomService.closeRoom(roomId, roles, staffId);
        return ApiResponse.success(response);
    }

    // View chat messages history for a specific room
    @GetMapping("/rooms/{roomId}/messages")
    public ApiResponse<Page<ChatMessageResponse>> getRoomMessages(
            @PathVariable String roomId,
            @RequestHeader("X-User-Id") String staffId,
            @RequestHeader("X-User-Roles") String roles,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<ChatMessageResponse> messages = chatMessageService.getMessages(roomId, staffId, roles, pageable);
        return ApiResponse.success(messages);
    }
}
