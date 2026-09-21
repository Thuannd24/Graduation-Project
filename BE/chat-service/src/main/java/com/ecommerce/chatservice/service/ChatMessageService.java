package com.ecommerce.chatservice.service;

import com.ecommerce.chatservice.dto.request.ChatMessageRequest;
import com.ecommerce.chatservice.dto.response.ChatMessageResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

public interface ChatMessageService {
    ChatMessageResponse saveMessage(ChatMessageRequest request, String senderId, String senderName, String senderRole);
    Page<ChatMessageResponse> getMessages(String roomId, String userId, String userRoles, Pageable pageable);
    String uploadImage(String roomId, MultipartFile file);
}
