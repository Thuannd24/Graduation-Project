package com.ecommerce.notificationservice.service;

import com.ecommerce.notificationservice.dto.NotificationDto;
import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.entity.FCMToken;
import com.ecommerce.notificationservice.entity.Notification;
import com.ecommerce.notificationservice.entity.NotificationTemplate;
import com.ecommerce.notificationservice.repository.FCMTokenRepository;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import com.ecommerce.notificationservice.service.impl.NotificationServiceImpl;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessagePreparator;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit test NotificationServiceImpl (PH7): chọn template, thay biến, lưu thông báo, gửi email (JavaMailSender mock),
 * trạng thái SENT/FAILED, token FCM.
 */
@ExtendWith(MockitoExtension.class)
class NotificationServiceImplTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private NotificationTemplateRepository templateRepository;
    @Mock private FCMTokenRepository fcmTokenRepository;
    @Mock private JavaMailSender javaMailSender;

    private NotificationServiceImpl service(boolean withMail) {
        NotificationServiceImpl s = new NotificationServiceImpl(notificationRepository, templateRepository, fcmTokenRepository,
                withMail ? Optional.of(javaMailSender) : Optional.empty());
        ReflectionTestUtils.setField(s, "mailFromAddress", "no-reply@shop.test");
        ReflectionTestUtils.setField(s, "mailRetryBackoffMs", 1L);
        return s;
    }

    private void saveReturnsArg() {
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Notification lastSaved(int times) {
        ArgumentCaptor<Notification> c = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository, times(times)).save(c.capture());
        return c.getValue();
    }

    @Test
    @DisplayName("TC_PH7_NOTI_01: Gửi theo template order_confirmed_template: tiêu đề/nội dung thay {{orderId}}, {{customerName}}; biến templateVariables được ưu tiên hơn giá trị mặc định (userId)")
    void send_withTemplate_rendersVariables() {
        saveReturnsArg();
        when(fcmTokenRepository.findByUserId("u1")).thenReturn(List.of());
        when(templateRepository.findByCode("order_confirmed_template")).thenReturn(Optional.of(NotificationTemplate.builder()
                .code("order_confirmed_template").titleTemplate("Đơn hàng #{{orderId}} đã được xác nhận")
                .bodyTemplate("<p>Chào {{customerName}} ({{userId}}), đơn {{orderId}} đã xác nhận.</p>").build()));

        service(false).sendNotification(SendNotificationRequest.builder().userId("u1").email("a@mail.com").orderId(1024L)
                .eventType("OrderConfirmedEvent").templateId(" order_confirmed_template ")
                .templateVariables(Map.of("customerName", "Nguyễn Văn A", "userId", "Khách VIP")).build());

        Notification n = lastSaved(2);
        assertEquals("Đơn hàng #1024 đã được xác nhận", n.getSubject());
        assertEquals("<p>Chào Nguyễn Văn A (Khách VIP), đơn 1024 đã xác nhận.</p>", n.getContent());
        assertEquals("a@mail.com", n.getRecipient());
        assertEquals(1024L, n.getOrderId());
        assertEquals(List.of("EMAIL", "PUSH"), n.getChannels());
    }

    @Test
    @DisplayName("TC_PH7_NOTI_02: templateId không tồn tại -> IllegalArgumentException, không lưu, không gửi; subject truyền vào ghi đè tiêu đề template và cũng được thay biến")
    void send_templateNotFound_andSubjectOverride() {
        when(templateRepository.findByCode("ghost_template")).thenReturn(Optional.empty());
        NotificationServiceImpl s = service(true);

        assertThrows(IllegalArgumentException.class, () -> s.sendNotification(SendNotificationRequest.builder()
                .userId("u1").templateId("ghost_template").build()));
        verifyNoInteractions(notificationRepository, javaMailSender);

        saveReturnsArg();
        when(fcmTokenRepository.findByUserId("u1")).thenReturn(List.of());
        when(templateRepository.findByCode("payment_success_template")).thenReturn(Optional.of(NotificationTemplate.builder()
                .titleTemplate("Thanh toán thành công").bodyTemplate("").build()));
        s.sendNotification(SendNotificationRequest.builder().userId("u1").email("a@mail.com").orderId(7L)
                .templateId("payment_success_template").subject("Đã nhận tiền đơn #{{orderId}}").build());
        Notification n = lastSaved(2);
        assertEquals("Đã nhận tiền đơn #7", n.getSubject());
        assertTrue(n.getContent().contains("Chiến dịch khuyến mãi đã được kích hoạt"), "nội dung template rỗng -> dùng nội dung mặc định");
    }

    @Test
    @DisplayName("TC_PH7_NOTI_03: Không dùng template: nội dung thô được thay biến; thiếu subject -> tiêu đề mặc định 'Thông báo từ E-Commerce'; thiếu content -> nội dung mặc định")
    void send_rawContent_andDefaults() {
        saveReturnsArg();
        when(fcmTokenRepository.findByUserId("u2")).thenReturn(List.of());
        NotificationServiceImpl s = service(false);

        s.sendNotification(SendNotificationRequest.builder().userId("u2").email("b@mail.com")
                .content("<b>Mã của bạn: {{voucherCode}}</b>").templateVariables(Map.of("voucherCode", "VPC-123456")).build());
        Notification n1 = lastSaved(2);
        assertEquals("Thông báo từ E-Commerce", n1.getSubject());
        assertEquals("<b>Mã của bạn: VPC-123456</b>", n1.getContent());

        clearInvocations(notificationRepository);
        s.sendNotification(SendNotificationRequest.builder().userId("u2").email("b@mail.com").subject("Tiêu đề riêng").build());
        Notification n2 = lastSaved(2);
        assertEquals("Tiêu đề riêng", n2.getSubject());
        assertTrue(n2.getContent().startsWith("<p>Chào bạn!"));
    }

    @Test
    @DisplayName("TC_PH7_NOTI_04: Gửi email thành công: MimeMessage có from/to/tiêu đề/nội dung HTML đúng; bản ghi lưu PENDING rồi cập nhật SENT, deliveryResults 'EMAIL:SENT; PUSH:SENT'")
    void send_mailSuccess() throws Exception {
        saveReturnsArg();
        when(fcmTokenRepository.findByUserId("u3")).thenReturn(List.of(FCMToken.builder().token("tok-1").platform("WEB").build()));

        service(true).sendNotification("u3", "c@mail.com", 55L, "OrderShippedEvent", "Don #55 dang giao", "<p>Đơn đang giao</p>");

        ArgumentCaptor<MimeMessagePreparator> prep = ArgumentCaptor.forClass(MimeMessagePreparator.class);
        verify(javaMailSender).send(prep.capture());
        MimeMessage mm = new MimeMessage(Session.getInstance(new Properties()));
        prep.getValue().prepare(mm);
        mm.saveChanges();
        assertEquals("no-reply@shop.test", ((InternetAddress) mm.getFrom()[0]).getAddress());
        assertEquals("c@mail.com", ((InternetAddress) mm.getAllRecipients()[0]).getAddress());
        assertEquals("Don #55 dang giao", mm.getSubject()); // tiêu đề ASCII: MimeMessageHelper không đặt encoding -> phụ thuộc charset mặc định của JVM
        assertTrue(mm.getContentType().startsWith("text/html"));
        assertEquals("<p>Đơn đang giao</p>", mm.getContent());

        Notification n = lastSaved(2);
        assertEquals("SENT", n.getStatus());
        assertEquals("EMAIL:SENT; PUSH:SENT", n.getDeliveryResults());
    }

    @Test
    @DisplayName("TC_PH7_NOTI_05: SMTP lỗi -> không ném lỗi ra ngoài, trạng thái FAILED; không cấu hình JavaMailSender -> giả lập gửi, trạng thái SENT")
    void send_mailFailure_andSimulation() {
        saveReturnsArg();
        when(fcmTokenRepository.findByUserId(any())).thenReturn(List.of());
        doThrow(new MailSendException("SMTP 535 auth failed")).when(javaMailSender).send(any(MimeMessagePreparator.class));

        assertDoesNotThrow(() -> service(true).sendNotification("u4", "d@mail.com", 1L, "PaymentFailedEvent", "S", "C"));
        Notification failed = lastSaved(2);
        assertEquals("FAILED", failed.getStatus());
        // Không có token FCM -> push ghi SKIPPED (TC_PH7_NOTI_08: kết quả gửi phải phản ánh thực tế)
        assertEquals("EMAIL:FAILED; PUSH:SKIPPED", failed.getDeliveryResults());

        clearInvocations(notificationRepository);
        service(false).sendNotification("u4", "d@mail.com", 2L, "PaymentSuccessEvent", "S", "C");
        assertEquals("SENT", lastSaved(2).getStatus());
    }

    @Test
    @DisplayName("TC_PH7_NOTI_06: Đăng ký token FCM: token mới -> tạo bản ghi; token đã có (đổi tài khoản trên cùng thiết bị) -> gán lại userId/platform, không tạo trùng; lịch sử thông báo theo user được map sang DTO")
    void fcmToken_and_history() {
        when(fcmTokenRepository.findByToken("tok-new")).thenReturn(Optional.empty());
        FCMToken old = FCMToken.builder().id("t1").userId("u-old").token("tok-old").platform("IOS").build();
        when(fcmTokenRepository.findByToken("tok-old")).thenReturn(Optional.of(old));
        NotificationServiceImpl s = service(false);

        s.registerFcmToken("u5", "tok-new", "WEB", "dev-1");
        s.registerFcmToken("u5", "tok-old", "ANDROID", "dev-2");

        ArgumentCaptor<FCMToken> c = ArgumentCaptor.forClass(FCMToken.class);
        verify(fcmTokenRepository, times(2)).save(c.capture());
        assertNull(c.getAllValues().get(0).getId());
        assertEquals("tok-new", c.getAllValues().get(0).getToken());
        assertSame(old, c.getAllValues().get(1));
        assertEquals("u5", old.getUserId());
        assertEquals("ANDROID", old.getPlatform());
        assertNotNull(old.getLastUsedAt());

        when(notificationRepository.findByUserIdOrderByCreatedAtDesc("u5")).thenReturn(List.of(
                Notification.builder().id("n1").userId("u5").orderId(9L).eventType("OrderConfirmedEvent").subject("S")
                        .status("SENT").createdAt(LocalDateTime.of(2026, 10, 17, 9, 0)).build()));
        List<NotificationDto> list = s.getNotificationsByUser("u5");
        assertEquals(1, list.size());
        assertEquals("n1", list.get(0).getId());
        assertEquals("SENT", list.get(0).getStatus());
        assertEquals(9L, list.get(0).getOrderId());
    }
}
