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
import com.ecommerce.notificationservice.service.RecipientEmailResolver;
import com.ecommerce.notificationservice.util.TemplateRenderer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailPreparationException;
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
    private static final List<String> OPTIONAL_HTML_PLACEHOLDERS =
            List.of("orderDetailsHtml", "trackingInfoHtml", "refundInfoHtml");

    private final NotificationRepository notificationRepository;
    private final NotificationTemplateRepository templateRepository;
    private final FCMTokenRepository fcmTokenRepository;
    private final Optional<JavaMailSender> mailSender;

    @Value("${app.mail.from}")
    private String mailFromAddress;

    /** Attempts per e-mail (1 = no retry). Transient SMTP/network errors are retried. */
    @Value("${app.mail.retry.max-attempts:3}")
    private int mailMaxAttempts = 3;

    /** Base back-off between attempts; attempt n waits n * base. */
    @Value("${app.mail.retry.backoff-ms:1000}")
    private long mailRetryBackoffMs = 200;

    /** Optional: looks up the customer's real address when the event carries none. */
    private RecipientEmailResolver recipientEmailResolver;

    @Autowired(required = false)
    public void setRecipientEmailResolver(RecipientEmailResolver recipientEmailResolver) {
        this.recipientEmailResolver = recipientEmailResolver;
    }

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
            String content = TemplateRenderer.renderHtml(template.getBodyTemplate(), variables,
                    trustedHtml(request));
            if (!hasText(subject)) {
                subject = DEFAULT_SUBJECT;
            }
            if (!hasText(content)) {
                content = TemplateRenderer.renderHtml(DEFAULT_BODY, variables, trustedHtml(request));
            }
            log.info("Resolved template '{}' for user {}", templateId, request.getUserId());
            return new ResolvedMessage(subject, content);
        }

        String subject = hasText(request.getSubject()) ? request.getSubject() : DEFAULT_SUBJECT;
        String content = hasText(request.getContent())
                ? TemplateRenderer.renderHtml(request.getContent(), variables, trustedHtml(request))
                : TemplateRenderer.renderHtml(DEFAULT_BODY, variables, trustedHtml(request));
        return new ResolvedMessage(subject, content);
    }

    /**
     * Server-built HTML fragments. Optional placeholders default to "" so a template that
     * references them never shows a raw "{{orderDetailsHtml}}" when the event lacks the data.
     */
    private Map<String, String> trustedHtml(SendNotificationRequest request) {
        Map<String, String> html = new HashMap<>();
        for (String key : OPTIONAL_HTML_PLACEHOLDERS) {
            html.put(key, "");
        }
        if (request.getTrustedHtmlVariables() != null) {
            request.getTrustedHtmlVariables().forEach((k, v) -> html.put(k, v != null ? v : ""));
        }
        return html;
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

        // TC_PH7_NOTI_07: never invent "<userId>@ecommerce.com" (a third-party domain). Use the
        // event's address, else look it up in user-service, else skip the e-mail channel.
        String emailRecipient = resolveRecipient(userId, email);

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

        String emailResult;
        int attemptsUsed = 0;
        if (emailRecipient == null) {
            emailResult = "SKIPPED";
            log.warn("No email address known for user {} (event {}, order {}). Email skipped.", userId, eventType, orderId);
        } else if (mailSender.isPresent()) {
            final String bodyText = content;
            final String subText = subject;
            final String toAddress = emailRecipient;
            MimeMessagePreparator preparator = mimeMessage -> {
                MimeMessageHelper messageHelper = new MimeMessageHelper(mimeMessage);
                messageHelper.setFrom(mailFromAddress);
                messageHelper.setTo(toAddress);
                messageHelper.setSubject(subText);
                messageHelper.setText(bodyText, true);
            };
            MailOutcome outcome = sendWithRetry(preparator, emailRecipient);
            attemptsUsed = outcome.attempts();
            emailResult = outcome.sent() ? "SENT" : "FAILED";
        } else {
            log.info("JavaMailSender is not initialized or configured. Simulating email dispatch to: {}", emailRecipient);
            emailResult = "SENT";
        }

        // TC_PH7_NOTI_08: report push only when there was a device to push to.
        String pushResult;
        List<FCMToken> fcmTokens = fcmTokenRepository.findByUserId(userId);
        if (fcmTokens != null && !fcmTokens.isEmpty()) {
            for (FCMToken token : fcmTokens) {
                log.info("Simulating FCM Push notification to Token: [{}] Platform: [{}] Device ID: [{}]. Title: {}",
                        token.getToken(), token.getPlatform(), token.getDeviceId(), subject);
            }
            pushResult = "SENT";
        } else {
            log.info("No FCM tokens registered for user {}. Skipping push notification.", userId);
            pushResult = "SKIPPED";
        }

        notification.setStatus(emailResult);
        notification.setRetryCount(Math.max(0, attemptsUsed - 1));
        notification.setDeliveryResults("EMAIL:" + emailResult + "; PUSH:" + pushResult);
        notificationRepository.save(notification);
    }

    private String resolveRecipient(String userId, String email) {
        if (hasText(email)) {
            return email.trim();
        }
        if (recipientEmailResolver != null) {
            return recipientEmailResolver.resolveEmail(userId).filter(this::hasText).orElse(null);
        }
        return null;
    }

    /**
     * Sends with a small bounded retry for transient SMTP/network failures.
     *
     * Permanent errors (authentication, malformed address/message) are not retried.
     */
    private MailOutcome sendWithRetry(MimeMessagePreparator preparator, String recipient) {
        int maxAttempts = Math.max(1, mailMaxAttempts);
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                mailSender.get().send(preparator);
                log.info("Email sent successfully to {} (attempt {})", recipient, attempt);
                return new MailOutcome(true, attempt);
            } catch (Exception e) {
                boolean permanent = e instanceof MailAuthenticationException
                        || e instanceof MailParseException
                        || e instanceof MailPreparationException;
                log.error("Failed to send email to {} (attempt {}/{}): {}", recipient, attempt, maxAttempts, e.getMessage());
                if (permanent || attempt == maxAttempts) {
                    return new MailOutcome(false, attempt);
                }
                try {
                    Thread.sleep(mailRetryBackoffMs * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return new MailOutcome(false, attempt);
                }
            }
        }
        return new MailOutcome(false, maxAttempts);
    }

    private record MailOutcome(boolean sent, int attempts) {
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
