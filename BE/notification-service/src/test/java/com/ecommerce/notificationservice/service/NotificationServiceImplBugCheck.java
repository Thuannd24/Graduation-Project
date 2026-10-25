package com.ecommerce.notificationservice.service;

import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.entity.Notification;
import com.ecommerce.notificationservice.entity.NotificationTemplate;
import com.ecommerce.notificationservice.repository.FCMTokenRepository;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import com.ecommerce.notificationservice.service.impl.NotificationServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessagePreparator;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở NotificationServiceImpl / TemplateRenderer. Chạy riêng: mvn -pl notification-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class NotificationServiceImplBugCheck {

    @Mock private NotificationRepository notificationRepository;
    @Mock private NotificationTemplateRepository templateRepository;
    @Mock private FCMTokenRepository fcmTokenRepository;
    @Mock private JavaMailSender javaMailSender;

    private NotificationServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new NotificationServiceImpl(notificationRepository, templateRepository, fcmTokenRepository, Optional.of(javaMailSender));
        ReflectionTestUtils.setField(service, "mailFromAddress", "no-reply@shop.test");
        lenient().when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(fcmTokenRepository.findByUserId(any())).thenReturn(List.of());
    }

    private Notification lastSaved() {
        ArgumentCaptor<Notification> c = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository, atLeastOnce()).save(c.capture());
        return c.getValue();
    }

    @Test
    @DisplayName("TC_PH7_TPL_03: Biến do người dùng nhập (customerName) chèn vào email HTML phải được escape; '<img src=x onerror=...>' không được xuất hiện nguyên dạng thẻ HTML")
    void userSuppliedVariable_mustBeHtmlEscaped() {
        when(templateRepository.findByCode("welcome_template")).thenReturn(Optional.of(NotificationTemplate.builder()
                .titleTemplate("Chào mừng").bodyTemplate("<p>Xin chào {{customerName}}</p>").build()));

        service.sendNotification(SendNotificationRequest.builder().userId("u1").email("a@mail.com").templateId("welcome_template")
                .templateVariables(Map.of("customerName", "<img src=x onerror=alert(1)>")).build());

        String content = lastSaved().getContent();
        assertFalse(content.contains("<img"), "Nội dung email chứa thẻ HTML do người dùng chèn: " + content);
        assertTrue(content.contains("&lt;img"));
    }

    @Test
    @DisplayName("TC_PH7_NOTI_07: Sự kiện không có email người nhận thì không được gửi email tới địa chỉ bịa '<userId>@ecommerce.com' (domain của bên thứ ba)")
    void missingEmail_mustNotSendToFabricatedAddress() {
        service.sendNotification("kc-7f3a", null, 5L, "OrderConfirmedEvent", "S", "C");

        assertFalse(lastSaved().getRecipient() != null && lastSaved().getRecipient().endsWith("@ecommerce.com"),
                "recipient = " + lastSaved().getRecipient());
        verify(javaMailSender, never()).send(any(MimeMessagePreparator.class));
    }

    @Test
    @DisplayName("TC_PH7_NOTI_08: User không có token FCM nào thì deliveryResults không được ghi 'PUSH:SENT' (kết quả gửi phải phản ánh thực tế)")
    void noFcmToken_mustNotReportPushSent() {
        service.sendNotification("u9", "z@mail.com", 6L, "PaymentSuccessEvent", "S", "C");

        assertFalse(lastSaved().getDeliveryResults().contains("PUSH:SENT"), lastSaved().getDeliveryResults());
    }
}
