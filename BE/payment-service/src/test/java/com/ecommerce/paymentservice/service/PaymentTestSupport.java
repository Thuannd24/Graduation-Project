package com.ecommerce.paymentservice.service;

import com.ecommerce.paymentservice.dto.ApiResponse;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;

/** Tiện ích dùng chung cho test PH5: tự tính chữ ký HMAC-SHA512 theo đặc tả VNPay để đối chiếu độc lập. */
final class PaymentTestSupport {

    static final String SECRET = "TESTSECRET0123456789ABCDEFGHIJKL";
    static final String TMN = "TESTTMN1";

    private PaymentTestSupport() {
    }

    static String hmacSha512(String key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    /** Chuỗi ký: các tham số vnp_ (trừ SecureHash/Type, bỏ giá trị rỗng) sắp theo tên, giá trị URL-encode, nối bằng '&'. */
    static String signData(Map<String, String> params) {
        Map<String, String> sorted = new TreeMap<>();
        params.forEach((k, v) -> {
            if (k.startsWith("vnp_") && !k.equals("vnp_SecureHash") && !k.equals("vnp_SecureHashType") && v != null && !v.isEmpty()) {
                sorted.put(k, v);
            }
        });
        StringBuilder sb = new StringBuilder();
        Iterator<Map.Entry<String, String>> it = sorted.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, String> e = it.next();
            sb.append(e.getKey()).append('=').append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8));
            if (it.hasNext()) {
                sb.append('&');
            }
        }
        return sb.toString();
    }

    /** Tham số IPN hợp lệ (đã ký) cho txnRef/số tiền (VND) cho trước. */
    static Map<String, String> signedCallback(String txnRef, long amountVnd, String responseCode) throws Exception {
        Map<String, String> p = new HashMap<>();
        p.put("vnp_TmnCode", TMN);
        p.put("vnp_TxnRef", txnRef);
        p.put("vnp_Amount", String.valueOf(amountVnd * 100));
        p.put("vnp_ResponseCode", responseCode);
        p.put("vnp_TransactionNo", "14250001");
        p.put("vnp_BankCode", "NCB");
        p.put("vnp_OrderInfo", "Thanh toan don hang 77");
        p.put("vnp_PayDate", "20261017103000");
        p.put("vnp_SecureHashType", "HmacSHA512");
        p.put("vnp_SecureHash", hmacSha512(SECRET, signData(p)));
        return p;
    }

    static ApiResponse<Object> orderSummary(String status, String userId, Object finalAmount) {
        Map<String, Object> data = new HashMap<>();
        data.put("status", status);
        data.put("userId", userId);
        data.put("finalAmount", finalAmount);
        return ApiResponse.builder().code("SUCCESS").data(data).build();
    }
}
