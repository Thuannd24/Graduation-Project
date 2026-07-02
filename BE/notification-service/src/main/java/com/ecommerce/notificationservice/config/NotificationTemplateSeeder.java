package com.ecommerce.notificationservice.config;

import com.ecommerce.notificationservice.entity.NotificationTemplate;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationTemplateSeeder implements ApplicationRunner {

    private final NotificationTemplateRepository templateRepository;

    @Override
    public void run(ApplicationArguments args) {
        seedIfMissing(
                "welcome_template",
                "Email chào mừng thành viên mới",
                "Chào mừng bạn đến E-Commerce",
                """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #2563eb;">Chào mừng bạn!</h2>
                  <p>Xin chào,</p>
                  <p>Cảm ơn bạn đã đăng ký tài khoản tại <strong>E-Commerce</strong>.</p>
                  <p>Email đăng ký: <strong>{{email}}</strong></p>
                  <p>Mã thành viên: <strong>{{userId}}</strong></p>
                  <p>Hãy khám phá ưu đãi dành riêng cho bạn ngay hôm nay!</p>
                  <p style="color: #6b7280; font-size: 12px;">Trân trọng,<br/>Đội ngũ E-Commerce</p>
                </div>
                """,
                "EMAIL"
        );
        seedIfMissing(
                "sms_otp_template",
                "SMS OTP xác thực",
                "Mã OTP E-Commerce",
                "Ma OTP cua ban la {{otpCode}}. Hieu luc trong {{expireMinutes}} phut.",
                "SMS"
        );
        seedIfMissing(
                "promotion_voucher_template",
                "Email thông báo voucher khuyến mãi",
                "Bạn nhận được voucher khuyến mãi!",
                """
                <p>Xin chào,</p>
                <p>Bạn vừa nhận được mã voucher: <strong>{{voucherCode}}</strong></p>
                <p>Hãy sử dụng mã này khi thanh toán để nhận ưu đãi.</p>
                """,
                "EMAIL"
        );
        seedIfMissing(
                "order_confirmed_template",
                "Email xác nhận đơn hàng thành công",
                "Đặt hàng thành công - Đơn hàng #{{orderId}}",
                """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                  <h2 style="color: #10b981; margin-top: 0;">Đặt hàng thành công!</h2>
                  <p>Chào khách hàng,</p>
                  <p>Đơn hàng <strong>#{{orderId}}</strong> của bạn đã được tiếp nhận và đang chờ xử lý thanh toán/vận chuyển.</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
                  <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">Trân trọng,<br/>Đội ngũ E-Commerce</p>
                </div>
                """,
                "EMAIL"
        );
        seedIfMissing(
                "order_cancelled_template",
                "Email thông báo đơn hàng bị hủy",
                "Đơn hàng #{{orderId}} đã bị hủy",
                """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                  <h2 style="color: #ef4444; margin-top: 0;">Đơn hàng đã bị hủy</h2>
                  <p>Chào khách hàng,</p>
                  <p>Đơn hàng <strong>#{{orderId}}</strong> của bạn đã bị hủy bỏ thành công trên hệ thống.</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
                  <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">Trân trọng,<br/>Đội ngũ E-Commerce</p>
                </div>
                """,
                "EMAIL"
        );
        seedIfMissing(
                "payment_success_template",
                "Email thông báo thanh toán thành công",
                "Thanh toán thành công đơn hàng #{{orderId}}",
                """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                  <h2 style="color: #10b981; margin-top: 0;">Thanh toán thành công!</h2>
                  <p>Chào khách hàng,</p>
                  <p>Yêu cầu thanh toán cho đơn hàng <strong>#{{orderId}}</strong> đã hoàn tất thành công thông qua cổng thanh toán.</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
                  <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">Trân trọng,<br/>Đội ngũ E-Commerce</p>
                </div>
                """,
                "EMAIL"
        );
        seedIfMissing(
                "payment_failed_template",
                "Email thông báo thanh toán thất bại",
                "Thanh toán thất bại đơn hàng #{{orderId}}",
                """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
                  <h2 style="color: #ef4444; margin-top: 0;">Thanh toán thất bại</h2>
                  <p>Chào khách hàng,</p>
                  <p>Thanh toán cho đơn hàng <strong>#{{orderId}}</strong> đã thất bại hoặc bị hủy bỏ. Vui lòng thực hiện lại giao dịch.</p>
                  <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
                  <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">Trân trọng,<br/>Đội ngũ E-Commerce</p>
                </div>
                """,
                "EMAIL"
        );
    }

    private void seedIfMissing(String code, String name, String titleTemplate, String bodyTemplate, String channel) {
        if (templateRepository.findByCode(code).isPresent()) {
            return;
        }
        templateRepository.save(NotificationTemplate.builder()
                .code(code)
                .name(name)
                .titleTemplate(titleTemplate)
                .bodyTemplate(bodyTemplate)
                .channel(channel)
                .build());
        log.info("Seeded notification template: {}", code);
    }
}
