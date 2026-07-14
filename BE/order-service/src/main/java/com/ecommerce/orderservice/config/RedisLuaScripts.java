package com.ecommerce.orderservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scripting.support.ResourceScriptSource;

/**
 * Redis Lua Scripts Configuration for atomic stock operations
 * Prevents race conditions in concurrent checkout scenarios
 */
@Configuration
public class RedisLuaScripts {

    /**
     * Atomic stock decrement script
     * Returns:
     *   >= 0: remaining stock after decrement (success)
     *   -1: cache miss (key doesn't exist)
     *   -2: insufficient stock
     */
    @Bean
    public DefaultRedisScript<Long> stockDecrementScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setResultType(Long.class);
        script.setScriptText(
            "local key = KEYS[1] " +
            "local demand = tonumber(ARGV[1]) " +
            "local stock = redis.call('get', key) " +
            "if not stock then " +
            "    return -1 " +
            "end " +
            "local stockNum = tonumber(stock) " +
            "if stockNum >= demand then " +
            "    local remaining = stockNum - demand " +
            "    redis.call('set', key, tostring(remaining)) " +
            "    return remaining " +
            "else " +
            "    return -2 " +
            "end"
        );
        return script;
    }

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
