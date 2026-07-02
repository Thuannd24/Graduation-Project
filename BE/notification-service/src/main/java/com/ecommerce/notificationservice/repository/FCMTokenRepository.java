package com.ecommerce.notificationservice.repository;

import com.ecommerce.notificationservice.entity.FCMToken;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FCMTokenRepository extends MongoRepository<FCMToken, String> {
    List<FCMToken> findByUserId(String userId);
    Optional<FCMToken> findByToken(String token);
}
