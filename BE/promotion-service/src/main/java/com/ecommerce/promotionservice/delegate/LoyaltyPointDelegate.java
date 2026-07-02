package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.client.UserClient;
import com.ecommerce.promotionservice.delegate.support.CampaignUserContextResolver;
import com.ecommerce.promotionservice.delegate.support.DelegateVariableHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Component("loyaltyPointDelegate")
@RequiredArgsConstructor
@Slf4j
public class LoyaltyPointDelegate implements JavaDelegate {

    private final UserClient userClient;
    private final CampaignUserContextResolver userContextResolver;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        var userDbId = userContextResolver.resolveUserDbId(execution);
        String calculationMode = DelegateVariableHelper.getStr(execution, "calculationMode");
        if (calculationMode.isBlank()) {
            calculationMode = "FIXED";
        }
        int pointAmount = DelegateVariableHelper.getInt(execution, "pointAmount", 0);

        log.info("[LoyaltyPoint] userId={} mode={} pointAmount={}",
                userDbId.map(String::valueOf).orElse("?"), calculationMode, pointAmount);

        if (userDbId.isEmpty()) {
            log.warn("[LoyaltyPoint] Missing user db id, skipping.");
            execution.setVariable("loyaltyPointApplied", false);
            return;
        }

        Map<String, Object> request = new HashMap<>();
        request.put("calculationMode", calculationMode);
        request.put("pointAmount", pointAmount);
        request.put("sourceType", "CAMPAIGN");

        Long campaignId = userContextResolver.resolveCampaignId(execution).orElse(null);
        if (campaignId != null) {
            request.put("campaignId", campaignId);
            request.put("reason", "Chiến dịch khuyến mãi #" + campaignId);
        }

        Long orderId = toLong(execution.getVariable("orderId"));
        if (orderId != null) {
            request.put("orderId", orderId);
        }

        BigDecimal orderAmount = DelegateVariableHelper.firstBigDecimal(
                execution, "finalAmount", "totalAmount", "amount");
        if (orderAmount != null) {
            request.put("orderAmount", orderAmount);
        }

        if ("ORDER_SPEND".equalsIgnoreCase(calculationMode) && orderAmount == null) {
            log.warn("[LoyaltyPoint] ORDER_SPEND requires order amount in context.");
            execution.setVariable("loyaltyPointApplied", false);
            execution.setVariable("loyaltyPointError", "ORDER_SPEND requires finalAmount/totalAmount");
            return;
        }

        if ("FIXED".equalsIgnoreCase(calculationMode) && pointAmount == 0) {
            log.warn("[LoyaltyPoint] FIXED mode requires non-zero pointAmount.");
            execution.setVariable("loyaltyPointApplied", false);
            return;
        }

        try {
            Map<String, Object> response = userClient.updatePoints(userDbId.get(), request);
            Map<String, Object> data = extractData(response);
            if (data != null) {
                if (data.get("newPointBalance") != null) {
                    execution.setVariable("newPointBalance", data.get("newPointBalance"));
                }
                if (data.get("pointsApplied") != null) {
                    execution.setVariable("pointsApplied", data.get("pointsApplied"));
                }
                if (data.get("calculationDetail") != null) {
                    execution.setVariable("loyaltyCalculationDetail", data.get("calculationDetail").toString());
                }
            }
            execution.setVariable("loyaltyPointApplied", true);
            log.info("[LoyaltyPoint] Success userId={} newBalance={}",
                    userDbId.get(), execution.getVariable("newPointBalance"));
        } catch (Exception ex) {
            log.error("[LoyaltyPoint] Failed to update points for user {}: {}", userDbId.get(), ex.getMessage());
            execution.setVariable("loyaltyPointApplied", false);
            execution.setVariable("loyaltyPointError", ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractData(Map<String, Object> response) {
        if (response == null) {
            return null;
        }
        Object dataObj = response.get("data");
        if (dataObj instanceof Map) {
            return (Map<String, Object>) dataObj;
        }
        return response;
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
