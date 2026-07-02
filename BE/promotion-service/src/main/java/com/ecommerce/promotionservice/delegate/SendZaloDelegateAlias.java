package com.ecommerce.promotionservice.delegate;

import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import com.ecommerce.promotionservice.client.NotificationClient;

/** Bean alias for Zalo channel – delegates to shared notification logic */
@Component("sendZaloDelegate")
@Slf4j
public class SendZaloDelegateAlias extends SendNotificationDelegate {
    public SendZaloDelegateAlias(NotificationClient notificationClient) {
        super(notificationClient);
    }
}
