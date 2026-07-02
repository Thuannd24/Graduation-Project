package com.ecommerce.promotionservice.delegate;

import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import com.ecommerce.promotionservice.client.NotificationClient;

/** Bean alias for SMS channel – delegates to shared notification logic */
@Component("sendSmsDelegate")
@Slf4j
public class SendSmsDelegateAlias extends SendNotificationDelegate {
    public SendSmsDelegateAlias(NotificationClient notificationClient) {
        super(notificationClient);
    }
}
