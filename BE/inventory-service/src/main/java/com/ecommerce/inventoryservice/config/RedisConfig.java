package com.ecommerce.inventoryservice.config;

import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Bean
    public RedisTemplate<String, String> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, String> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setHashValueSerializer(new StringRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }

    @Bean(destroyMethod = "shutdown")
    public RedissonClient redissonClient() {
        Config config = new Config();
        // Hỗ trợ cả Redis Cluster (cổng 7000-7010) và Redis Single Server (ví dụ: 6379)
        if (redisPort >= 7000 && redisPort <= 7010) {
            config.useClusterServers()
                    .addNodeAddress("redis://" + redisHost + ":" + redisPort)
                    .setNatMapper(uri -> new org.redisson.misc.RedisURI(uri.getScheme(), redisHost, uri.getPort()));
        } else {
            config.useSingleServer()
                    .setAddress("redis://" + redisHost + ":" + redisPort);
        }
        return Redisson.create(config);
    }
}
