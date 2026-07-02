package com.ecommerce.notificationservice.service.impl;

import com.ecommerce.notificationservice.dto.NotificationDto;
import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.entity.FCMToken;
import com.ecommerce.notificationservice.entity.Notification;
import com.ecommerce.notificationservice.entity.NotificationTemplate;
import com.ecommerce.notificationservice.repository.FCMTokenRepository;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import com.ecommerce.notificationservice.service.NotificationService;
import com.ecommerce.notificationservice.util.TemplateRenderer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.mail.javamail.MimeMessagePreparator;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationServiceImpl implements NotificationService {

    private static final String DEFAULT_SUBJECT = "Thông báo từ E-Commerce";
    private static final String DEFAULT_BODY =
            "<p>Chào bạn! Chiến dịch khuyến mãi đã được kích hoạt cho tài khoản của bạn.</p>";

    private final NotificationRepository notificationRepository;
    private final NotificationTemplateRepository templateRepository;
    private final FCMTokenRepository fcmTokenRepository;
    private final Optional<JavaMailSender> mailSender;

    @Override
    public void sendNotification(SendNotificationRequest request) {
        Map<String, String> variables = buildVariables(request);
        ResolvedMessage message = resolveMessage(request, variables);
        dispatch(request.getUserId(), request.getEmail(), request.getOrderId(),
                request.getEventType(), message.subject(), message.content());
    }

    @Override
    public void sendNotification(String userId, String email, Long orderId, String eventType, String subject, String content) {
        dispatch(userId, email, orderId, eventType, subject, content);
    }

    private ResolvedMessage resolveMessage(SendNotificationRequest request, Map<String, String> variables) {
        String templateId = request.getTemplateId();
        if (templateId != null && !templateId.isBlank()) {
            NotificationTemplate template = templateRepository.findByCode(templateId.trim())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Notification template not found: " + templateId));
            String subject = hasText(request.getSubject())
                    ? TemplateRenderer.render(request.getSubject(), variables)
                    : TemplateRenderer.render(template.getTitleTemplate(), variables);
            String content = TemplateRenderer.render(template.getBodyTemplate(), variables);
            if (!hasText(subject)) {
                subject = DEFAULT_SUBJECT;
            }
            if (!hasText(content)) {
                content = TemplateRenderer.render(DEFAULT_BODY, variables);
            }
            log.info("Resolved template '{}' for user {}", templateId, request.getUserId());
            return new ResolvedMessage(subject, content);
        }

        String subject = hasText(request.getSubject()) ? request.getSubject() : DEFAULT_SUBJECT;
        String content = hasText(request.getContent())
                ? TemplateRenderer.render(request.getContent(), variables)
                : TemplateRenderer.render(DEFAULT_BODY, variables);
        return new ResolvedMessage(subject, content);
    }

    private Map<String, String> buildVariables(SendNotificationRequest request) {
        Map<String, String> variables = new HashMap<>();
        if (request.getTemplateVariables() != null) {
            variables.putAll(request.getTemplateVariables());
        }
        putIfAbsent(variables, "userId", request.getUserId());
        putIfAbsent(variables, "email", request.getEmail());
        if (request.getOrderId() != null) {
            putIfAbsent(variables, "orderId", String.valueOf(request.getOrderId()));
        }
        return variables;
    }

    private void putIfAbsent(Map<String, String> map, String key, String value) {
        if (value != null && !value.isBlank() && !map.containsKey(key)) {
            map.put(key, value);
        }
    }

    private void dispatch(String userId, String email, Long orderId, String eventType, String subject, String content) {
        log.info("Preparing notification for user {}, Event: {}", userId, eventType);

        String emailRecipient = (email != null && !email.trim().isEmpty()) ? email : userId + "@ecommerce.com";

        Notification notification = Notification.builder()
                .userId(userId)
                .orderId(orderId)
                .eventType(eventType)
                .channels(Arrays.asList("EMAIL", "PUSH"))
                .recipient(emailRecipient)
                .subject(subject)
                .content(content)
                .status("PENDING")
                .createdAt(LocalDateTime.now())
                .build();

        notification = notificationRepository.save(notification);

        boolean mailSuccess = false;
        if (mailSender.isPresent()) {
            try {
                final String bodyText = content;
                final String subText = subject;
                final String toAddress = emailRecipient;

                MimeMessagePreparator preparator = mimeMessage -> {
                    MimeMessageHelper messageHelper = new MimeMessageHelper(mimeMessage);
                    messageHelper.setTo(toAddress);
                    messageHelper.setSubject(subText);
                    messageHelper.setText(bodyText, true);
                };
                mailSender.get().send(preparator);
                mailSuccess = true;
                log.info("Email sent successfully to {}", emailRecipient);
            } catch (Exception e) {
                log.error("Failed to send real email (JavaMailSender exception): {}. Falling back to simulation.", e.getMessage());
            }
        } else {
            log.info("JavaMailSender is not initialized or configured. Simulating email dispatch to: {}", emailRecipient);
        }

        List<FCMToken> fcmTokens = fcmTokenRepository.findByUserId(userId);
        if (!fcmTokens.isEmpty()) {
            for (FCMToken token : fcmTokens) {
                log.info("Simulating FCM Push notification to Token: [{}] Platform: [{}] Device ID: [{}]. Title: {}, Body: {}",
                        token.getToken(), token.getPlatform(), token.getDeviceId(), subject, content);
            }
        } else {
            log.info("No FCM tokens registered for user {}. Skipping push notification.", userId);
        }

        notification.setStatus(mailSuccess || !mailSender.isPresent() ? "SENT" : "FAILED");
        notification.setDeliveryResults("EMAIL:" + notification.getStatus() + "; PUSH:SENT");
        notificationRepository.save(notification);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record ResolvedMessage(String subject, String content) {
    }

    @Override
    public List<NotificationDto> getNotificationsByUser(String userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(n -> NotificationDto.builder()
                        .id(n.getId())
                        .userId(n.getUserId())
                        .orderId(n.getOrderId())
                        .eventType(n.getEventType())
                        .channels(n.getChannels())
                        .recipient(n.getRecipient())
                        .subject(n.getSubject())
                        .content(n.getContent())
                        .status(n.getStatus())
                        .createdAt(n.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    @Override
    public void registerFcmToken(String userId, String token, String platform, String deviceId) {
        log.info("Registering FCM Token for User ID {}: {}", userId, token);
        Optional<FCMToken> existing = fcmTokenRepository.findByToken(token);

        FCMToken fcmToken;
        if (existing.isPresent()) {
            fcmToken = existing.get();
            fcmToken.setUserId(userId);
            fcmToken.setPlatform(platform);
            fcmToken.setDeviceId(deviceId);
            fcmToken.setLastUsedAt(LocalDateTime.now());
        } else {
            fcmToken = FCMToken.builder()
                    .userId(userId)
                    .token(token)
                    .platform(platform)
                    .deviceId(deviceId)
                    .lastUsedAt(LocalDateTime.now())
                    .build();
        }
        fcmTokenRepository.save(fcmToken);
        log.info("FCM Token registered successfully.");
    }
}
