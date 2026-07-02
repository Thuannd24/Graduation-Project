package com.ecommerce.userservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserRegisteredEvent {
    private String eventId;
    private String eventType;
    private String timestamp;
    private Long userId;
    private String keycloakUserId;
    private String email;
    private String phone;
}
