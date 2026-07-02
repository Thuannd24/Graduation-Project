package com.ecommerce.notificationservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "notification_templates")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationTemplate {

    @Id
    private String id;
    private String code; // ORDER_CREATED, PAYMENT_SUCCESS, etc.
    private String name;
    private String titleTemplate; // E.g., "Order #{{orderId}} created successfully"
    private String bodyTemplate;  // E.g., "Hi {{customerName}}, your order has been received..."
    private String channel; // EMAIL, PUSH, SMS
}
