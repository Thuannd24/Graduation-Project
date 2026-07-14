package com.ecommerce.productservice.config;

import com.ecommerce.productservice.dto.ProductDto;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // Cấu hình ObjectMapper tùy chỉnh để bỏ qua thuộc tính không xác định khi deserialize (tránh sập app khi thay đổi class DTO)
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        // SECURITY FIX: "products" and "products_slug" only ever cache ProductDto, so we bind the
        // serializer to that concrete type instead of using GenericJackson2JsonRedisSerializer
        // with activateDefaultTyping(LaissezFaireSubTypeValidator...). The generic/polymorphic
        // approach embeds an unrestricted "@class" property in every cached value and deserializes
        // whatever class name it finds there - an unsafe-deserialization surface if this Redis
        // keyspace is ever shared/writable by anything else, and it also breaks every cached entry
        // if ProductDto is ever renamed or moved to a different package. A type-bound serializer
        // has neither problem.
        Jackson2JsonRedisSerializer<ProductDto> serializer =
                new Jackson2JsonRedisSerializer<>(objectMapper, ProductDto.class);

        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofHours(24)) // TTL mặc định cho product catalog
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer));
                // Cho phép cache giá trị Null để ngăn chặn lỗi Cache Penetration (Xuyên thủng cache)

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(config)
                .withCacheConfiguration("products", config.entryTtl(Duration.ofHours(24)))
                .withCacheConfiguration("products_slug", config.entryTtl(Duration.ofHours(24)))
                .build();
    }
}
