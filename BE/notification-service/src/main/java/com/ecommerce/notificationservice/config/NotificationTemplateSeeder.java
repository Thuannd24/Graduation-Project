package com.ecommerce.notificationservice.config;

import com.ecommerce.notificationservice.entity.NotificationTemplate;
import com.ecommerce.notificationservice.repository.NotificationTemplateRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationTemplateSeeder implements ApplicationRunner {

    private final NotificationTemplateRepository templateRepository;

    @Value("${app.brand.name:AuraTech}")
    private String brandName;

    @Value("${app.brand.tagline:Công nghệ chính hãng · Giao nhanh toàn quốc}")
    private String brandTagline;

    @Value("${app.brand.support-email:hotro@auratech.vn}")
    private String supportEmail;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${minio.public-endpoint:http://localhost:9000}")
    private String minioPublicEndpoint;

    @Value("${minio.bucket-name:product-images}")
    private String minioBucketName;

    @Value("${app.brand.logo-object:site/auratech-logo.png}")
    private String brandLogoObject;

    @Value("${app.brand.logo-url:}")
    private String brandLogoUrlOverride;

    private String brandLogoUrl;

    @PostConstruct
    void resolveBrandLogoUrl() {
        if (brandLogoUrlOverride != null && !brandLogoUrlOverride.isBlank()) {
            brandLogoUrl = brandLogoUrlOverride.trim();
            return;
        }
        String base = minioPublicEndpoint.endsWith("/")
                ? minioPublicEndpoint.substring(0, minioPublicEndpoint.length() - 1)
                : minioPublicEndpoint;
        brandLogoUrl = base + "/" + minioBucketName + "/" + brandLogoObject;
        log.info("Brand logo URL for email templates: {}", brandLogoUrl);
    }

    @Override
    public void run(ApplicationArguments args) {
        seedOrUpdate(
                "welcome_template",
                "Email chào mừng thành viên mới",
                "Chào mừng bạn đến với AuraTech ✨",
                emailShell(
                        "#6366f1",
                        "🎉",
                        "Chào mừng bạn đến với " + brandName + "!",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">
                          Cảm ơn bạn đã tin tưởng và đăng ký tài khoản tại <strong style="color:#4f46e5;">AuraTech</strong>.
                          Tài khoản của bạn đã sẵn sàng — hãy khám phá hàng ngàn sản phẩm công nghệ chính hãng với ưu đãi độc quyền dành riêng cho thành viên mới.
                        </p>
                        """
                        + infoCard(
                                "📧 Email đăng ký",
                                "{{email}}",
                                "Tài khoản này sẽ được dùng để đăng nhập và nhận thông báo đơn hàng."
                        )
                        + featureList(
                                "🛍️", "Mua sắm dễ dàng", "Hàng ngàn sản phẩm công nghệ chính hãng",
                                "🎁", "Ưu đãi thành viên", "Voucher và khuyến mãi độc quyền",
                                "🚀", "Giao hàng nhanh", "Theo dõi đơn hàng realtime trên ứng dụng"
                        )
                        + ctaButton("Khám phá ngay", frontendUrl)
                ),
                "EMAIL"
        );
        seedOrUpdate(
                "sms_otp_template",
                "SMS OTP xác thực",
                "Mã OTP AuraTech",
                "[AuraTech] Ma xac thuc cua ban la {{otpCode}}. Hieu luc trong {{expireMinutes}} phut. Khong chia se ma nay voi bat ky ai.",
                "SMS"
        );
        seedOrUpdate(
                "promotion_voucher_template",
                "Email thông báo voucher khuyến mãi",
                "🎁 Bạn nhận được voucher từ AuraTech!",
                emailShell(
                        "#8b5cf6",
                        "🎁",
                        "Chúc mừng! Bạn có voucher mới",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
                          AuraTech vừa tặng bạn một mã ưu đãi đặc biệt. Hãy sử dụng mã bên dưới khi thanh toán để nhận khuyến mãi ngay hôm nay.
                        </p>
                        """
                        + voucherBox("{{voucherCode}}")
                        + ctaButton("Dùng voucher ngay", frontendUrl + "/cart")
                ),
                "EMAIL"
        );
        seedOrUpdate(
                "order_confirmed_template",
                "Email xác nhận đơn hàng thành công",
                "✅ Đặt hàng thành công — Đơn #{{orderId}}",
                emailShell(
                        "#10b981",
                        "✅",
                        "Đặt hàng thành công!",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
                          Cảm ơn bạn đã mua sắm tại AuraTech. Đơn hàng của bạn đã được tiếp nhận và đang chờ xử lý thanh toán / vận chuyển.
                        </p>
                        """
                        + orderBadge("{{orderId}}", "Đã tiếp nhận", "#10b981", "#ecfdf5", "#a7f3d0")
                        + ctaButton("Theo dõi đơn hàng", frontendUrl + "/orders")
                ),
                "EMAIL"
        );
        seedOrUpdate(
                "order_cancelled_template",
                "Email thông báo đơn hàng bị hủy",
                "❌ Đơn hàng #{{orderId}} đã bị hủy",
                emailShell(
                        "#ef4444",
                        "❌",
                        "Đơn hàng đã bị hủy",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
                          Đơn hàng của bạn đã được hủy thành công trên hệ thống AuraTech. Nếu bạn không thực hiện thao tác này, vui lòng liên hệ bộ phận hỗ trợ ngay.
                        </p>
                        """
                        + orderBadge("{{orderId}}", "Đã hủy", "#ef4444", "#fef2f2", "#fecaca")
                        + ctaButton("Tiếp tục mua sắm", frontendUrl)
                ),
                "EMAIL"
        );
        seedOrUpdate(
                "payment_success_template",
                "Email thông báo thanh toán thành công",
                "💳 Thanh toán thành công — Đơn #{{orderId}}",
                emailShell(
                        "#10b981",
                        "💳",
                        "Thanh toán thành công!",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
                          Giao dịch thanh toán cho đơn hàng của bạn đã hoàn tất. AuraTech sẽ tiến hành đóng gói và giao hàng trong thời gian sớm nhất.
                        </p>
                        """
                        + orderBadge("{{orderId}}", "Đã thanh toán", "#10b981", "#ecfdf5", "#a7f3d0")
                        + ctaButton("Xem chi tiết đơn hàng", frontendUrl + "/orders")
                ),
                "EMAIL"
        );
        seedOrUpdate(
                "payment_failed_template",
                "Email thông báo thanh toán thất bại",
                "⚠️ Thanh toán thất bại — Đơn #{{orderId}}",
                emailShell(
                        "#f59e0b",
                        "⚠️",
                        "Thanh toán chưa thành công",
                        """
                        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                          Xin chào bạn,
                        </p>
                        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">
                          Thanh toán cho đơn hàng của bạn đã thất bại hoặc bị hủy. Vui lòng thử lại để hoàn tất đơn hàng — sản phẩm vẫn đang được giữ trong giỏ cho bạn.
                        </p>
                        """
                        + orderBadge("{{orderId}}", "Chưa thanh toán", "#f59e0b", "#fffbeb", "#fde68a")
                        + ctaButton("Thanh toán lại", frontendUrl + "/checkout")
                ),
                "EMAIL"
        );
    }

    private void seedOrUpdate(String code, String name, String titleTemplate, String bodyTemplate, String channel) {
        NotificationTemplate template = templateRepository.findByCode(code)
                .orElse(NotificationTemplate.builder().code(code).build());
        template.setName(name);
        template.setTitleTemplate(titleTemplate);
        template.setBodyTemplate(bodyTemplate);
        template.setChannel(channel);
        templateRepository.save(template);
        log.info("Seeded/updated notification template: {}", code);
    }

    private String emailShell(String accentColor, String emoji, String heading, String bodyContent) {
        return """
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                  <meta charset="UTF-8"/>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                  <title>%s</title>
                </head>
                <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%%;">
                          %s
                          <tr>
                            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
                              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="background-color:%s;height:4px;font-size:0;line-height:0;">&nbsp;</td>
                                </tr>
                                <tr>
                                  <td style="padding:36px 40px 32px;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                                      <tr>
                                        <td style="width:52px;height:52px;background-color:%s;border-radius:14px;text-align:center;vertical-align:middle;">
                                          <span style="font-size:26px;line-height:52px;">%s</span>
                                        </td>
                                        <td style="padding-left:16px;vertical-align:middle;">
                                          <h1 style="margin:0;font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;">%s</h1>
                                        </td>
                                      </tr>
                                    </table>
                                    %s
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          %s
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(brandName, brandHeader(), accentColor, accentColor + "18", emoji, heading, bodyContent, brandFooter());
    }

    private String brandHeader() {
        return """
                <tr>
                  <td style="padding-bottom:24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:56px;height:56px;vertical-align:middle;">
                          <img src="%s" alt="%s Logo" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:14px;object-fit:contain;background:#ffffff;border:1px solid #e2e8f0;"/>
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <div style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">%s</div>
                          <div style="font-size:11px;color:#64748b;margin-top:2px;">%s</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                """.formatted(brandLogoUrl, brandName, brandName, brandTagline);
    }

    private String brandFooter() {
        String siteLabel = frontendUrl.replace("https://", "").replace("http://", "");
        return """
                <tr>
                  <td style="padding-top:24px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
                      Cần hỗ trợ? Liên hệ <a href="mailto:%s" style="color:#4f46e5;text-decoration:none;font-weight:600;">%s</a>
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;">
                      © 2026 %s · <a href="%s" style="color:#94a3b8;text-decoration:none;">%s</a>
                    </p>
                    <p style="margin:0;font-size:11px;color:#cbd5e1;">
                      Email này được gửi tự động, vui lòng không trả lời trực tiếp.
                    </p>
                  </td>
                </tr>
                """.formatted(supportEmail, supportEmail, brandName, frontendUrl, siteLabel);
    }

    private static String infoCard(String label, String value, String hint) {
        return """
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;">
                      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">%s</p>
                      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">%s</p>
                      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">%s</p>
                    </td>
                  </tr>
                </table>
                """.formatted(label, value, hint);
    }

    private static String voucherBox(String code) {
        return """
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="background:linear-gradient(135deg,#6366f1 0%%,#8b5cf6 100%%);border-radius:12px;padding:28px;text-align:center;">
                      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px;">Mã voucher của bạn</p>
                      <p style="margin:0;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:4px;font-family:'Courier New',monospace;">%s</p>
                    </td>
                  </tr>
                </table>
                """.formatted(code);
    }

    private static String orderBadge(String orderId, String status, String statusColor, String bgColor, String borderColor) {
        return """
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="background-color:%s;border:1px solid %s;border-radius:12px;padding:20px 24px;">
                      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td>
                            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Mã đơn hàng</p>
                            <p style="margin:0;font-size:22px;font-weight:800;color:#0f172a;">#%s</p>
                          </td>
                          <td align="right" valign="middle">
                            <span style="display:inline-block;background-color:%s;color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;">%s</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                """.formatted(bgColor, borderColor, orderId, statusColor, status);
    }

    private static String featureList(String icon1, String title1, String desc1,
                                      String icon2, String title2, String desc2,
                                      String icon3, String title3, String desc3) {
        return """
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  %s
                  %s
                  %s
                </table>
                """.formatted(featureRow(icon1, title1, desc1, false),
                featureRow(icon2, title2, desc2, false),
                featureRow(icon3, title3, desc3, true));
    }

    private static String featureRow(String icon, String title, String desc, boolean last) {
        String border = last ? "" : "border-bottom:1px solid #f1f5f9;";
        return """
                <tr>
                  <td style="padding:14px 0;%s">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:36px;font-size:20px;vertical-align:top;padding-top:2px;">%s</td>
                        <td style="vertical-align:top;">
                          <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">%s</p>
                          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">%s</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                """.formatted(border, icon, title, desc);
    }

    private static String ctaButton(String label, String url) {
        return """
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td style="background-color:#4f46e5;border-radius:10px;">
                      <a href="%s" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">%s →</a>
                    </td>
                  </tr>
                </table>
                """.formatted(url, label);
    }
}
