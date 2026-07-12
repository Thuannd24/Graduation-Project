package com.ecommerce.inventoryservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.script.DefaultRedisScript;

/**
 * Redis Lua Scripts Configuration for atomic stock operations
 * Prevents race conditions in inventory release/increment
 */
@Configuration
public class RedisLuaScripts {

    /**
     * Atomic stock increment script (for cancel/refund)
     * Returns:
     *   >= 0: new stock after increment (success)
     *   -1: cache miss (key doesn't exist, skip increment)
     */
    @Bean
    public DefaultRedisScript<Long> stockIncrementScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setResultType(Long.class);
        script.setScriptText(
            "local key = KEYS[1] " +
            "local quantity = tonumber(ARGV[1]) " +
            "if redis.call('exists', key) == 1 then " +
            "    return redis.call('incrby', key, quantity) " +
            "else " +
            "    return -1 " +
            "end"
        );
        return script;
    }
}
