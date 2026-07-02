package com.ecommerce.inventoryservice.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

@Configuration
public class KafkaConfig {

    @Bean
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        return mapper;
    }

    @Bean
    public CommonErrorHandler errorHandler(KafkaTemplate<Object, Object> kafkaTemplate) {
        // 1. Tạo Recoverer gửi tin nhắn lỗi sang DLQ (mặc định là <topic_gốc>.DLT)
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate);

        // 2. Cấu hình Exponential BackOff (Thử lại tăng dần: 2s -> 4s -> 8s)
        ExponentialBackOff backOff = new ExponentialBackOff();
        backOff.setInitialInterval(2000L); // Lần đầu sau 2 giây
        backOff.setMultiplier(2.0); // Nhân đôi thời gian ở lần tiếp theo
        backOff.setMaxInterval(10000L); // Đợi tối đa 10 giây giữa các lần retry
        backOff.setMaxAttempts(3); // Thử lại tối đa 3 lần

        // 3. Khởi tạo DefaultErrorHandler với backoff cấu hình ở trên
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);

        // 4. Bỏ qua retry, bắn thẳng vào DLQ đối với các lỗi không thể tự phục hồi
        errorHandler.addNotRetryableExceptions(
                com.fasterxml.jackson.core.JsonProcessingException.class, // Lỗi cú pháp JSON
                NullPointerException.class, // Lỗi logic code Null
                IllegalArgumentException.class // Lỗi tham số không hợp lệ
        );

        return errorHandler;
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<Object, Object> kafkaListenerContainerFactory(
            org.springframework.kafka.core.ConsumerFactory<Object, Object> consumerFactory,
            CommonErrorHandler errorHandler) {
        ConcurrentKafkaListenerContainerFactory<Object, Object> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        factory.getContainerProperties().setAckMode(
                org.springframework.kafka.listener.ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        return factory;
    }
}
