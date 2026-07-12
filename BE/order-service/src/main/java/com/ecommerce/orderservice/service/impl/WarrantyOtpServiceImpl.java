package com.ecommerce.orderservice.service.impl;

import com.ecommerce.orderservice.dto.response.WarrantyOtpResponse;
import com.ecommerce.orderservice.service.WarrantyOtpService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class WarrantyOtpServiceImpl implements WarrantyOtpService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration OTP_TTL = Duration.ofMinutes(5);
    private static final int MAX_OTP_PER_PHONE_PER_HOUR = 3;
    private static final int MAX_OTP_PER_IP_PER_HOUR = 15;

    private final RedisTemplate<String, String> stringRedisTemplate;

    @Value("${app.warranty.otp.expose-in-response:false}")
    private boolean exposeOtpInResponse;

    @Override
    public WarrantyOtpResponse requestOtp(String phoneNumber, String clientIp) {
        String phone = normalizePhone(phoneNumber);
        enforceRateLimit("warranty:otp:rate:phone:" + phone, MAX_OTP_PER_PHONE_PER_HOUR,
                "Quá nhiều yêu cầu OTP cho số điện thoại này. Thử lại sau.");
        if (clientIp != null && !clientIp.isBlank()) {
            enforceRateLimit("warranty:otp:rate:ip:" + clientIp, MAX_OTP_PER_IP_PER_HOUR,
                    "Quá nhiều yêu cầu OTP từ địa chỉ IP này. Thử lại sau.");
        }

        String otp = String.format("%06d", RANDOM.nextInt(1_000_000));
        stringRedisTemplate.opsForValue().set(otpKey(phone), otp, OTP_TTL);

        log.info("Warranty OTP generated for phone ending {}***", phone.length() >= 4 ? phone.substring(phone.length() - 4) : phone);

        return WarrantyOtpResponse.builder()
                .message("Mã OTP đã được gửi. Vui lòng nhập mã để tra cứu bảo hành.")
                .expiresInSeconds((int) OTP_TTL.getSeconds())
                .devOtp(exposeOtpInResponse ? otp : null)
                .build();
    }

    @Override
    public void verifyOtpOrThrow(String phoneNumber, String otp) {
        String phone = normalizePhone(phoneNumber);
        if (otp == null || otp.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Mã OTP bắt buộc.");
        }
        String stored = stringRedisTemplate.opsForValue().get(otpKey(phone));
        if (stored == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Mã OTP đã hết hạn hoặc chưa được yêu cầu.");
        }
        if (!stored.equals(otp.trim())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Mã OTP không đúng.");
        }
        stringRedisTemplate.delete(otpKey(phone));
    }

    private void enforceRateLimit(String key, int maxPerHour, String message) {
        Long count = stringRedisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            stringRedisTemplate.expire(key, 1, TimeUnit.HOURS);
        }
        if (count != null && count > maxPerHour) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, message);
        }
    }

    private String normalizePhone(String phone) {
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số điện thoại không hợp lệ.");
        }
        String normalized = phone.replaceAll("\\s+", "");
        if (!normalized.matches("0[0-9]{9,10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số điện thoại phải có 10-11 chữ số.");
        }
        return normalized;
    }

    private String otpKey(String phone) {
        return "warranty:otp:" + phone;
    }
}
