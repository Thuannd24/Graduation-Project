package com.ecommerce.notificationservice.event.consumer;

import com.ecommerce.notificationservice.entity.Notification;
import com.ecommerce.notificationservice.repository.FCMTokenRepository;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import com.ecommerce.notificationservice.service.NotificationService;
import com.ecommerce.notificationservice.service.impl.NotificationServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessagePreparator;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/** Thiếu sót nghiệp vụ mục 9: email thật cho "Đang giao", chi tiết đơn, hoàn tiền, thử lại khi lỗi. */
@ExtendWith(MockitoExtension.class)
class NotificationGapFixesTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private NotificationTemplateRepository templateRepository;
    @Mock private FCMTokenRepository fcmTokenRepository;
    @Mock private JavaMailSender javaMailSender;

    private NotificationServiceImpl service() {
        NotificationServiceImpl s = new NotificationServiceImpl(notificationRepository, templateRepository,
                fcmTokenRepository, Optional.of(javaMailSender));
        ReflectionTestUtils.setField(s, "mailFromAddress", "no-reply@shop.test");
        ReflectionTestUtils.setField(s, "mailRetryBackoffMs", 1L);
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
        when(fcmTokenRepository.findByUserId(any())).thenReturn(List.of());
        return s;
    }

    private Notification lastSaved() {
        ArgumentCaptor<Notification> c = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository, atLeastOnce()).save(c.capture());
        return c.getValue();
    }

    @Test
    @DisplayName("Sự kiện không mang email: tra email thật qua user-service rồi gửi tới đó")
    void missingEmail_resolvedFromUserService() {
        NotificationServiceImpl s = service();
        s.setRecipientEmailResolver(userId -> "kc-1".equals(userId) ? Optional.of("real@mail.com") : Optional.empty());

        s.sendNotification("kc-1", "", 9L, "OrderShippedEvent", "S", "<p>C</p>");

        assertEquals("real@mail.com", lastSaved().getRecipient());
        assertEquals("SENT", lastSaved().getStatus());
        verify(javaMailSender).send(any(MimeMessagePreparator.class));
    }

    @Test
    @DisplayName("Lỗi SMTP tạm thời: thử lại, lần 2 thành công -> SENT, retryCount=1")
    void transientMailFailure_retried() {
        NotificationServiceImpl s = service();
        doThrow(new MailSendException("timeout")).doNothing().when(javaMailSender).send(any(MimeMessagePreparator.class));

        s.sendNotification("u1", "a@mail.com", 1L, "PaymentSuccessEvent", "S", "C");

        verify(javaMailSender, times(2)).send(any(MimeMessagePreparator.class));
        assertEquals("SENT", lastSaved().getStatus());
        assertEquals(1, lastSaved().getRetryCount());
    }

    @Test
    @DisplayName("Khối HTML chi tiết đơn/mã vận đơn/hoàn tiền dựng từ event và escape giá trị")
    void fragments_fromEvent() throws Exception {
        ObjectMapper om = new ObjectMapper();
        Map<String, String> confirmed = EventEmailFragments.build("OrderConfirmedEvent", om.readTree(
                "{\"items\":[{\"productName\":\"<b>iPhone</b>\",\"quantity\":2,\"unitPrice\":1000000}],\"finalAmount\":2030000}"));
        String html = confirmed.get("orderDetailsHtml");
        assertTrue(html.contains("&lt;b&gt;iPhone"));
        assertFalse(html.contains("<b>iPhone"));
        assertTrue(html.contains("2.000.000đ"));
        assertTrue(html.contains("2.030.000đ"));

        assertTrue(EventEmailFragments.build("OrderShippedEvent", om.readTree("{\"trackingCode\":\"MOCK-GHTK-1\"}"))
                .get("trackingInfoHtml").contains("MOCK-GHTK-1"));
        assertTrue(EventEmailFragments.build("RefundCompletedEvent", om.readTree("{\"amount\":150000}"))
                .get("refundInfoHtml").contains("150.000đ"));
        assertTrue(EventEmailFragments.build("OrderConfirmedEvent", om.readTree("{\"orderId\":1}")).isEmpty());
    }

    @Mock private NotificationService notificationService;
    @Mock private Acknowledgment ack;

    @Test
    @DisplayName("SupportChatOfflineEvent: chuyển tin nhắn tới hộp thư hỗ trợ (escape nội dung), mỗi phòng một email")
    void offlineSupportChat_forwardedToSupportMailbox() {
        NotificationKafkaConsumer consumer = new NotificationKafkaConsumer(notificationService, notificationRepository, new ObjectMapper());
        ReflectionTestUtils.setField(consumer, "supportEmail", "hotro@shop.test");
        when(notificationRepository.existsByEventType("SupportChatOfflineEvent:r1")).thenReturn(false, true);
        String ev = "{\"eventType\":\"SupportChatOfflineEvent\",\"payload\":{\"roomId\":\"r1\",\"customerName\":\"Lan\","
                + "\"customerEmail\":\"\",\"content\":\"<script>x</script>Cần hỗ trợ\"}}";

        consumer.consumeSupportChatEvent(ev, ack);
        consumer.consumeSupportChatEvent(ev, ack);

        verify(notificationService, times(1)).sendNotification(eq("support"), eq("hotro@shop.test"), isNull(),
                eq("SupportChatOfflineEvent:r1"), anyString(), contains("&lt;script&gt;x"));
        verify(ack, times(2)).acknowledge();
    }
}
