package com.ecommerce.chatservice.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebSocketMessageBroker
@Slf4j
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Autowired
    private JwtDecoder jwtDecoder;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/api/v1/public/chat/ws")
                .setAllowedOriginPatterns("*"); // Native WebSocket
        registry.addEndpoint("/api/v1/public/chat/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS(); // SockJS fallback
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String authHeader = accessor.getFirstNativeHeader("Authorization");
                    if (authHeader != null && authHeader.startsWith("Bearer ")) {
                        String token = authHeader.substring(7);
                        try {
                            Jwt jwt = jwtDecoder.decode(token);
                            String userId = jwt.getSubject();
                            
                            Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
                            List<String> roles = List.of();
                            if (realmAccess != null && realmAccess.containsKey("roles")) {
                                roles = (List<String>) realmAccess.get("roles");
                            }

                            List<GrantedAuthority> authorities = roles.stream()
                                    .map(String::toUpperCase)
                                    .map(r -> r.startsWith("ROLE_") ? r : "ROLE_" + r)
                                    .map(SimpleGrantedAuthority::new)
                                    .collect(Collectors.toList());

                            UsernamePasswordAuthenticationToken auth =
                                    new UsernamePasswordAuthenticationToken(userId, null, authorities);
                            
                            accessor.setUser(auth);
                            
                            accessor.getSessionAttributes().put("userId", userId);
                            accessor.getSessionAttributes().put("roles", roles);
                            accessor.getSessionAttributes().put("email", jwt.getClaimAsString("email"));
                            accessor.getSessionAttributes().put("name", jwt.getClaimAsString("name"));
                            log.info("WebSocket Authenticated: User={}, Roles={}", userId, roles);
                        } catch (Exception e) {
                            log.error("WebSocket Authentication failed: {}", e.getMessage());
                            throw new MessageDeliveryException("Unauthorized: " + e.getMessage());
                        }
                    } else {
                        // Support for anonymous guest users using a client-side generated Guest-Id
                        String guestId = accessor.getFirstNativeHeader("Guest-Id");
                        if (guestId == null || guestId.trim().isEmpty()) {
                            log.warn("WebSocket connection rejected: Missing Authorization token and Guest-Id");
                            throw new MessageDeliveryException("Missing Authorization token or Guest-Id");
                        }
                        
                        List<GrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_GUEST"));
                        UsernamePasswordAuthenticationToken auth =
                                new UsernamePasswordAuthenticationToken(guestId, null, authorities);
                        
                        accessor.setUser(auth);
                        accessor.getSessionAttributes().put("userId", guestId);
                        accessor.getSessionAttributes().put("roles", List.of("GUEST"));
                        accessor.getSessionAttributes().put("name", "Khách vãng lai");
                        accessor.getSessionAttributes().put("email", "");
                        log.info("WebSocket Anonymous Guest Connected: ID={}", guestId);
                    }
                }
                return message;
            }
        });
    }
}
