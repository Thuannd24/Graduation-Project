package com.ecommerce.chatservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class ChatServiceApplication {
    public static void main(String[] eloquenceArgs) {
        SpringApplication.run(ChatServiceApplication.class, eloquenceArgs);
    }
}
