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

  @Value("${app.brand.support-email:hotro@auratechvn.online}")
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
    // Default to the logo.png located in Frontend assets (resolved through frontendUrl)
    brandLogoUrl = frontendUrl + "/src/assets/images/logo.png";
    log.info("Brand logo URL for email templates: {}", brandLogoUrl);
  }

  @Override
  public void run(ApplicationArguments args) {
    seedOrUpdate(
        "welcome_template",
        "Email chào mừng thành viên mới",
        "Chào mừng bạn đến với AuraTech!",
        emailShell(
            "#4f46e5",
            "👋",
            "Chào mừng bạn đến với AuraTech!",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Cảm ơn bạn đã tin tưởng và đăng ký tài khoản tại <strong>AuraTech</strong>.
                  Tài khoản của bạn đã sẵn sàng — hãy khám phá hàng ngàn sản phẩm công nghệ chính hãng với ưu đãi độc quyền dành riêng cho thành viên mới.
                </p>
                """
                + shopeeButton("Khám phá ngay", frontendUrl)
                + """
                <div style="margin-top:24px;border-top:1px solid #f1f5f9;padding-top:20px;">
                  <h4 style="margin:0 0 12px;font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.5px;text-transform:uppercase;">THÔNG TIN TÀI KHOẢN</h4>
                  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#334155;">
                    <tr>
                      <td style="padding:6px 0;color:#64748b;width:35%%;">Email đăng ký:</td>
                      <td style="padding:6px 0;font-weight:600;color:#0f172a;text-align:right;">{{email}}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#64748b;">Ứng dụng:</td>
                      <td style="padding:6px 0;font-weight:600;color:#0f172a;text-align:right;">Hệ thống bán lẻ AuraTech</td>
                    </tr>
                  </table>
                </div>
                """),
        "EMAIL");
    seedOrUpdate(
        "sms_otp_template",
        "SMS OTP xác thực",
        "Mã OTP AuraTech",
        "[AuraTech] Ma xac thuc cua ban la {{otpCode}}. Hieu luc trong {{expireMinutes}} phut. Khong chia se ma nay voi bat ky ai.",
        "SMS");
    seedOrUpdate(
        "promotion_voucher_template",
        "Email thông báo voucher khuyến mãi",
        "Bạn nhận được voucher từ AuraTech!",
        emailShell(
            "#8b5cf6",
            "🎁",
            "Quà tặng đặc biệt từ AuraTech",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Nhằm tri ân sự đồng hành của bạn, AuraTech xin gửi tặng bạn một mã giảm giá đặc biệt. Hãy áp dụng mã này khi thanh toán để được chiết khấu trực tiếp cho đơn hàng của bạn.
                </p>
                """
                + voucherBox("{{voucherCode}}")
                + shopeeButton("Xem kho voucher của bạn", frontendUrl + "/profile?tab=vouchers")),
        "EMAIL");
    seedOrUpdate(
        "order_confirmed_template",
        "Email xác nhận đơn hàng thành công",
        "Đặt hàng thành công — Đơn #{{orderId}}",
        emailShell(
            "#10b981",
            "✅",
            "Đặt hàng thành công!",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Cảm ơn bạn đã mua sắm tại AuraTech. Đơn hàng của bạn đã được tiếp nhận và đang chờ xử lý thanh toán / vận chuyển.
                </p>
                """
                + shopeeButton("Xem chi tiết đơn hàng", frontendUrl + "/order/{{orderId}}")
                + shopeeOrderInfo("{{orderId}}", "Chờ thanh toán / Vận chuyển")),
        "EMAIL");
    seedOrUpdate(
        "order_cancelled_template",
        "Email thông báo đơn hàng bị hủy",
        "Đơn hàng #{{orderId}} đã bị hủy",
        emailShell(
            "#ef4444",
            "❌",
            "Đơn hàng đã bị hủy",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Đơn hàng của bạn đã được hủy thành công trên hệ thống AuraTech. Nếu bạn không thực hiện thao tác này, vui lòng liên hệ bộ phận hỗ trợ ngay.
                </p>
                """
                + shopeeButton("Quay lại cửa hàng", frontendUrl)
                + shopeeOrderInfo("{{orderId}}", "Đã hủy")),
        "EMAIL");
    seedOrUpdate(
        "payment_success_template",
        "Email thông báo thanh toán thành công",
        "Thanh toán thành công — Đơn #{{orderId}}",
        emailShell(
            "#10b981",
            "💳",
            "Thanh toán thành công!",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Giao dịch thanh toán cho đơn hàng của bạn đã hoàn tất. AuraTech sẽ tiến hành đóng gói và giao hàng trong thời gian sớm nhất.
                </p>
                """
                + shopeeButton("Xem chi tiết đơn hàng", frontendUrl + "/order/{{orderId}}")
                + shopeeOrderInfo("{{orderId}}", "Đã thanh toán")),
        "EMAIL");
    seedOrUpdate(
        "payment_failed_template",
        "Email thông báo thanh toán thất bại",
        "Thanh toán thất bại — Đơn #{{orderId}}",
        emailShell(
            "#f59e0b",
            "⚠️",
            "Thanh toán chưa thành công",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Thanh toán cho đơn hàng của bạn đã thất bại hoặc bị hủy. Vui lòng thử lại để hoàn tất đơn hàng — sản phẩm vẫn đang được giữ trong giỏ cho bạn.
                </p>
                """
                + shopeeButton("Xem chi tiết đơn hàng để thanh toán", frontendUrl + "/order/{{orderId}}")
                + shopeeOrderInfo("{{orderId}}", "Chưa thanh toán")),
        "EMAIL");
    seedOrUpdate(
        "order_shipped_template",
        "Email thông báo đơn hàng đang được giao",
        "Đơn hàng #{{orderId}} đang được giao tới bạn",
        emailShell(
            "#3b82f6",
            "🚚",
            "Đơn hàng đang trên đường giao!",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Đơn hàng của bạn đã được bàn giao cho đơn vị đối tác vận chuyển của AuraTech và đang trên đường giao tới địa chỉ của bạn.
                </p>
                """
                + shopeeButton("Theo dõi hành trình đơn", frontendUrl + "/order/{{orderId}}")
                + shopeeOrderInfo("{{orderId}}", "Đang giao hàng")),
        "EMAIL");
    seedOrUpdate(
        "order_delivered_template",
        "Email thông báo giao hàng thành công",
        "Giao hàng thành công — Đơn #{{orderId}}",
        emailShell(
            "#10b981",
            "🎉",
            "Giao hàng thành công!",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào bạn,
                </p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#334155;">
                  Đơn hàng của bạn đã được giao thành công ngày hôm nay.
                </p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#334155;">
                  Vui lòng đăng nhập hệ thống AuraTech để xác nhận bạn đã nhận được đầy đủ hàng hóa và hài lòng với chất lượng sản phẩm.
                </p>
                """
                + shopeeButton("Đã nhận hàng", frontendUrl + "/order/{{orderId}}")
                + shopeeOrderInfo("{{orderId}}", "Giao hàng thành công")
                + shopeeNextSteps()),
        "EMAIL");
    seedOrUpdate(
        "vip_membership_promo_template",
        "Email mời dùng thử gói thành viên VIP",
        "Tặng bạn gói thành viên AuraTech VIP — MIỄN PHÍ 14 ngày!",
        emailShell(
            "#f59e0b",
            "🌟",
            "Trải nghiệm AuraTech VIP",
            """
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#334155;">
                  Xin chào {{customerName}},
                </p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#334155;">
                  AuraTech vừa gửi tặng bạn gói thành viên <strong>AuraTech VIP</strong> hoàn toàn
                  <strong>MIỄN PHÍ trong 14 ngày</strong>. Kích hoạt để nhận các đặc quyền thăng hạng, giao hàng nhanh và tích lũy điểm thưởng.
                </p>
                """
                + featureList(
                    "🛒", "Hoàn điểm mọi đơn hàng",
                    "Áp dụng cho tất cả danh mục sản phẩm, không chỉ mặt hàng quen thuộc",
                    "⚡", "Ưu tiên xử lý đơn", "Đơn hàng VIP được ưu tiên đóng gói và giao nhanh hơn",
                    "🎁", "Ưu đãi độc quyền", "Nhận voucher và deal riêng dành cho thành viên VIP")
                + shopeeButton("Kích hoạt VIP ngay", frontendUrl + "/vip")),
        "EMAIL");
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
    String siteLabel = frontendUrl.replace("https://", "").replace("http://", "");
    return """
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>%s</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f6f9fc;padding:40px 16px;">
            <tr>
              <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%%;background-color:#ffffff;border-radius:16px;box-shadow:0 6px 24px rgba(15,23,42,0.04);border:1px solid #eef2f6;overflow:hidden;">
                  <!-- Brand Logo Header -->
                  <tr>
                    <td align="center" style="padding:32px 40px 24px;border-bottom:1px solid #f1f5f9;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <img src="%s" alt="%s Logo" width="120" style="display:block;width:120px;height:auto;object-fit:contain;"/>
                            <div style="font-size:12px;color:#94a3b8;margin-top:8px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">%s</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Body Content -->
                  <tr>
                    <td style="padding:40px 40px 32px;color:#334155;font-size:15px;line-height:1.75;">
                      <!-- Heading Section with Emoji and text -->
                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                        <tr>
                          <td style="width:48px;height:48px;background:linear-gradient(135deg,%s 0%%,%s 100%%);border-radius:12px;text-align:center;vertical-align:middle;box-shadow:0 4px 10px rgba(15,23,42,0.08);">
                            <span style="font-size:24px;line-height:48px;">%s</span>
                          </td>
                          <td style="padding-left:16px;vertical-align:middle;">
                            <h1 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;line-height:1.35;letter-spacing:-0.3px;">%s</h1>
                          </td>
                        </tr>
                      </table>
                      %s
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background-color:#f8fafc;padding:32px 40px;border-top:1px solid #eef2f6;text-align:center;">
                      <p style="margin:0 0 10px;font-size:13px;color:#64748b;line-height:1.5;">
                        Bạn cần hỗ trợ? Liên hệ hotline <strong style="color:#0f172a;">0389.468.847</strong> hoặc gửi mail về <a href="mailto:%s" style="color:#ef4444;text-decoration:none;font-weight:700;">%s</a>
                      </p>
                      <p style="margin:0 0 14px;font-size:12px;color:#94a3b8;">
                        © 2026 %s · <a href="%s" style="color:#94a3b8;text-decoration:none;font-weight:600;">%s</a>
                      </p>
                      <p style="margin:0;font-size:11px;color:#cbd5e1;line-height:1.4;">
                        Email này được hệ thống gửi tự động, vui lòng không trả lời trực tiếp thư này.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """
        .formatted(heading, brandLogoUrl, brandName, brandTagline, accentColor, shade(accentColor), emoji, heading, bodyContent, supportEmail, supportEmail, brandName, frontendUrl, siteLabel);
  }

  private static String shade(String hexColor) {
    return hexColor + "cc";
  }

  private static String voucherBox(String code) {
    return """
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%%,#8b5cf6 100%%);border-radius:12px;padding:24px;text-align:center;box-shadow:0 8px 20px rgba(99,102,241,0.2);">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:1.5px;">Mã voucher của bạn</p>
              <p style="margin:0;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:4px;font-family:'Courier New',monospace;">%s</p>
            </td>
          </tr>
        </table>
        """
        .formatted(code);
  }

  private static String shopeeOrderInfo(String orderId, String status) {
    return """
        <div style="margin-top:28px;border-top:1px solid #f1f5f9;padding-top:20px;">
          <h4 style="margin:0 0 14px;font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.5px;text-transform:uppercase;">THÔNG TIN ĐƠN HÀNG</h4>
          <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;font-size:14px;color:#334155;">
            <tr>
              <td style="padding:6px 0;color:#64748b;width:35%%;">Mã đơn hàng:</td>
              <td style="padding:6px 0;font-weight:700;color:#ef4444;text-align:right;">#%s</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Người bán:</td>
              <td style="padding:6px 0;font-weight:600;color:#0f172a;text-align:right;">AuraTech</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Trạng thái đơn:</td>
              <td style="padding:6px 0;font-weight:700;color:#10b981;text-align:right;">%s</td>
            </tr>
          </table>
        </div>
        """.formatted(orderId, status);
  }

  private static String shopeeNextSteps() {
    return """
        <div style="margin-top:20px;border-top:1px solid #f1f5f9;padding-top:20px;">
          <h4 style="margin:0 0 10px;font-size:13px;font-weight:800;color:#0f172a;letter-spacing:0.5px;text-transform:uppercase;">BƯỚC TIẾP THEO</h4>
          <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.55;">
            Bạn không hài lòng về sản phẩm hoặc dịch vụ nhận được?
          </p>
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.55;">
            Bạn có thể gửi yêu cầu <strong>Trả hàng/Hoàn tiền</strong> trên ứng dụng hoặc website của AuraTech trong vòng 3 ngày kể từ khi nhận hàng.
          </p>
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.55;font-style:italic;">
            Lưu ý: AuraTech sẽ từ chối hỗ trợ các khiếu nại phát sinh sau khi bạn đã xác nhận hài lòng hoặc quá thời hạn 3 ngày nêu trên.
          </p>
        </div>
        """;
  }

  private static String shopeeButton(String label, String url) {
    return """
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto;width:100%%;text-align:center;">
          <tr>
            <td align="center">
              <a href="%s" target="_blank" style="display:inline-block;padding:12px 36px;background-color:#ef4444;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:6px;box-shadow:0 4px 10px rgba(239,68,68,0.22);letter-spacing:0.3px;">%s</a>
            </td>
          </tr>
        </table>
        """.formatted(url, label);
  }

  private static String featureList(String icon1, String title1, String desc1,
      String icon2, String title2, String desc2,
      String icon3, String title3, String desc3) {
    return """
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-top:24px;margin-bottom:24px;">
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
                <td style="width:36px;height:36px;background-color:#f8fafc;border-radius:8px;text-align:center;vertical-align:middle;font-size:16px;">%s</td>
                <td style="padding-left:14px;vertical-align:middle;">
                  <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">%s</p>
                  <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">%s</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """
        .formatted(border, icon, title, desc);
  }

}
