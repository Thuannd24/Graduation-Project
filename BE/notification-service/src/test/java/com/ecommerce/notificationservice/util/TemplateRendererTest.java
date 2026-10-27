package com.ecommerce.notificationservice.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Unit test TemplateRenderer (PH7): thay biến {{key}} trong tiêu đề/nội dung email. Hàm thuần. */
class TemplateRendererTest {

    @Test
    @DisplayName("TC_PH7_TPL_01: Thay nhiều biến, biến lặp lại nhiều lần, giá trị null thành chuỗi rỗng, placeholder không có biến giữ nguyên")
    void render_substitutesVariables() {
        Map<String, String> vars = new HashMap<>();
        vars.put("orderId", "1024");
        vars.put("customerName", "Nguyễn Văn A");
        vars.put("voucherCode", null);

        String out = TemplateRenderer.render(
                "Đơn #{{orderId}} của {{customerName}} | mã: [{{voucherCode}}] | lại #{{orderId}} | {{unknown}}", vars);

        assertEquals("Đơn #1024 của Nguyễn Văn A | mã: [] | lại #1024 | {{unknown}}", out);
    }

    @Test
    @DisplayName("TC_PH7_TPL_02: Biên: template null/rỗng -> chuỗi rỗng; không có biến (null/rỗng) -> trả nguyên template; ký tự đặc biệt regex ($, \\) trong giá trị được giữ nguyên")
    void render_boundaries() {
        assertEquals("", TemplateRenderer.render(null, Map.of("a", "b")));
        assertEquals("", TemplateRenderer.render("   ", Map.of("a", "b")));
        assertEquals("Xin chào {{name}}", TemplateRenderer.render("Xin chào {{name}}", null));
        assertEquals("Xin chào {{name}}", TemplateRenderer.render("Xin chào {{name}}", Map.of()));
        assertEquals("Giảm $50 \\ 100%", TemplateRenderer.render("Giảm {{v}}", Map.of("v", "$50 \\ 100%")));
    }
}
