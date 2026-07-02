package com.ecommerce.promotionservice.delegate.support;

import com.ecommerce.promotionservice.client.UserClient;
import lombok.RequiredArgsConstructor;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class CampaignUserContextResolver {

    private final UserClient userClient;

    public Optional<Long> resolveUserDbId(DelegateExecution execution) {
        Object userDbIdVar = execution.getVariable("userDbId");
        Long fromDbId = toLong(userDbIdVar);
        if (fromDbId != null) {
            return Optional.of(fromDbId);
        }

        String userIdStr = getStr(execution, "userId");
        if (userIdStr.isBlank()) {
            return Optional.empty();
        }

        Long parsed = toLong(userIdStr);
        if (parsed != null) {
            execution.setVariable("userDbId", parsed);
            return Optional.of(parsed);
        }

        if (userIdStr.contains("-")) {
            try {
                Map<String, Object> response = userClient.getProfileByKeycloakId(userIdStr);
                Map<String, Object> data = extractData(response);
                if (data != null && data.get("id") != null) {
                    Long dbId = toLong(data.get("id"));
                    if (dbId != null) {
                        execution.setVariable("userDbId", dbId);
                        execution.setVariable("userId", dbId.toString());
                        if (data.get("email") != null && getStr(execution, "email").isBlank()) {
                            execution.setVariable("email", data.get("email").toString());
                        }
                        return Optional.of(dbId);
                    }
                }
            } catch (Exception ignored) {
                // caller handles empty
            }
        }

        return Optional.empty();
    }

    public Optional<Long> resolveCampaignId(DelegateExecution execution) {
        return Optional.ofNullable(toLong(execution.getVariable("campaignId")));
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

    private String getStr(DelegateExecution execution, String key) {
        Object v = execution.getVariable(key);
        return v != null ? v.toString() : "";
    }
}
