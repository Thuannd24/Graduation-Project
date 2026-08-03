package com.ecommerce.chatservice.repository;

import com.ecommerce.chatservice.entity.ChatRoom;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface ChatRoomRepository extends MongoRepository<ChatRoom, String> {
    Optional<ChatRoom> findByCustomerIdAndStatusNot(String customerId, String status);
    Optional<ChatRoom> findByCustomerId(String customerId);
    Page<ChatRoom> findByStatus(String status, Pageable pageable);
    Page<ChatRoom> findByStaffId(String staffId, Pageable pageable);
    long countByStaffIdAndStatus(String staffId, String status);
}
