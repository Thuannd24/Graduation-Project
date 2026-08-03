package com.ecommerce.chatservice.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventListener {

    private final StringRedisTemplate redisTemplate;

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = headerAccessor.getUser();
        if (principal instanceof UsernamePasswordAuthenticationToken) {
            UsernamePasswordAuthenticationToken auth = (UsernamePasswordAuthenticationToken) principal;
            String userId = auth.getName();
            
            boolean isStaff = auth.getAuthorities().stream()
                    .anyMatch(a -> a.getAuthority().equals("ROLE_STAFF") || a.getAuthority().equals("ROLE_ADMIN"));
            
            if (isStaff) {
                Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
                if (sessionAttributes != null) {
                    String name = (String) sessionAttributes.get("name");
                    redisTemplate.opsForSet().add("chat:online_staff", userId);
                    if (name != null) {
                        redisTemplate.opsForHash().put("chat:staff_names", userId, name);
                    }
                    log.info("Staff member {} ({}) connected and added to online registry", name, userId);
                }
            }
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = headerAccessor.getUser();
        if (principal != null) {
            String userId = principal.getName();
            
            Boolean isStaff = redisTemplate.opsForSet().isMember("chat:online_staff", userId);
            if (Boolean.TRUE.equals(isStaff)) {
                redisTemplate.opsForSet().remove("chat:online_staff", userId);
                log.info("Staff member {} disconnected and removed from online registry", userId);
            }
        }
    }
}
