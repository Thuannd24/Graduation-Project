package com.ecommerce.userservice.event.producer;

import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.event.UserRegisteredEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class UserEventProducer {

    private static final String TOPIC = "user-created-events";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void publishUserRegistered(User user) {
        try {
            UserRegisteredEvent event = UserRegisteredEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("UserRegisteredEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .userId(user.getId())
                    .keycloakUserId(user.getKeycloakUserId())
                    .email(user.getEmail())
                    .phone(user.getPhoneNumber())
                    .build();

            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(TOPIC, String.valueOf(user.getId()), payload);
            log.info("Published UserRegisteredEvent for userId={} to {}", user.getId(), TOPIC);
        } catch (Exception e) {
            log.error("Failed to publish UserRegisteredEvent for userId={}: {}", user.getId(), e.getMessage());
        }
    }
}
