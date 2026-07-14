package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.client.OrderClient;
import com.ecommerce.promotionservice.client.ProductClient;
import com.ecommerce.promotionservice.client.UserClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class CampaignVariableEnricher {

    private final UserClient userClient;
    private final OrderClient orderClient;
    private final ProductClient productClient;

    public void enrich(Map<String, Object> variables) {
        if (Boolean.TRUE.equals(variables.get("_enriched"))) {
            return;
        }
        variables.put("_enriched", true);
        resolveUserDbId(variables);

        Object userIdObj = variables.get("userId");
        if (userIdObj == null) {
            return;
        }

        Long userDbId = variables.containsKey("userDbId")
                ? toLong(variables.get("userDbId"))
                : toLong(userIdObj);

        if (userDbId != null) {
            enrichUserProfile(userDbId, variables);
        }

        enrichOrderContext(variables);
    }

    private void resolveUserDbId(Map<String, Object> variables) {
        String currentUserId = variables.get("userId") != null ? variables.get("userId").toString() : null;
        if (currentUserId != null && currentUserId.contains("-") && !variables.containsKey("keycloakUserId")) {
            variables.put("keycloakUserId", currentUserId);
        }

        if (variables.containsKey("userDbId") && variables.get("userDbId") != null) {
            variables.put("userId", variables.get("userDbId").toString());
            return;
        }

        String userIdStr = variables.get("userId") != null ? variables.get("userId").toString() : null;
        if (userIdStr == null || userIdStr.isBlank()) {
            return;
        }

        Long parsed = toLong(userIdStr);
        if (parsed != null) {
            variables.put("userDbId", parsed);
            return;
        }

        try {
            Map<String, Object> response = userClient.getProfileByKeycloakId(userIdStr);
            Map<String, Object> data = extractData(response);
            if (data != null && data.get("id") != null) {
                Long dbId = toLong(data.get("id"));
                variables.put("userDbId", dbId);
                variables.put("userId", dbId.toString());
                if (data.get("email") != null && !variables.containsKey("email")) {
                    variables.put("email", data.get("email").toString());
                }
                if (data.get("phoneNumber") != null && !variables.containsKey("phone")) {
                    variables.put("phone", data.get("phoneNumber").toString());
                }
            }
        } catch (Exception ex) {
            log.warn("Could not resolve keycloak userId to db id: {}", ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void enrichUserProfile(Long userDbId, Map<String, Object> variables) {
        try {
            Map<String, Object> aiProfileResponse = userClient.getAiProfile(userDbId);
            Map<String, Object> data = extractData(aiProfileResponse);
            if (data == null) {
                return;
            }
            if (data.get("customerTier") != null) {
                variables.put("memberRank", data.get("customerTier").toString());
            }
        } catch (Exception ex) {
            log.warn("Could not fetch user profile from user-service: {}", ex.getMessage());
        }

        try {
            String keycloakUserId = variables.containsKey("keycloakUserId")
                    ? variables.get("keycloakUserId").toString()
                    : (variables.get("userId") != null ? variables.get("userId").toString() : null);

            if (keycloakUserId != null && keycloakUserId.contains("-")) {
                Map<String, Object> spendingRes = orderClient.getTotalSpending(keycloakUserId, 30);
                Map<String, Object> data = extractData(spendingRes);
                if (data != null) {
                    variables.put("totalSpending", data);
                }
            } else {
                log.warn("Cannot fetch total spending: keycloakUserId is missing or invalid: {}", keycloakUserId);
            }
        } catch (Exception ex) {
            log.warn("Could not fetch total spending from order-service: {}", ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void enrichOrderContext(Map<String, Object> variables) {
        Long orderId = toLong(variables.get("orderId"));
        if (orderId == null) {
            deriveProvinceFromShippingAddress(variables);
            return;
        }

        try {
            Map<String, Object> summaryRes = orderClient.getOrderSummary(orderId);
            Map<String, Object> data = extractData(summaryRes);
            if (data == null) {
                return;
            }

            if (data.get("shippingAddress") != null) {
                variables.put("shippingAddress", data.get("shippingAddress").toString());
            }
            if (data.get("totalAmount") != null) {
                variables.put("totalAmount", data.get("totalAmount"));
            }
            if (data.get("finalAmount") != null) {
                variables.put("finalAmount", data.get("finalAmount"));
            } else if (data.get("totalAmount") != null) {
                variables.put("finalAmount", data.get("totalAmount"));
            }
            if (data.get("phoneNumber") != null && !variables.containsKey("phone")) {
                variables.put("phone", data.get("phoneNumber").toString());
            }

            List<Long> productIds = toLongList(data.get("productIds"));
            if (!productIds.isEmpty()) {
                variables.put("orderProductIds", productIds);
                variables.put("containsProduct", productIds.get(0).toString());

                try {
                    Map<String, Object> productsRes = productClient.getBulkProducts(productIds);
                    List<Map<String, Object>> products = extractDataList(productsRes);
                    if (products != null && !products.isEmpty()) {
                        List<Long> categoryIds = products.stream()
                                .map(p -> toLong(p.get("categoryId")))
                                .filter(id -> id != null)
                                .distinct()
                                .collect(Collectors.toList());
                        variables.put("orderCategoryIds", categoryIds);
                        if (!categoryIds.isEmpty()) {
                            variables.put("containsCategory", categoryIds.get(0).toString());
                        }
                    }
                } catch (Exception ex) {
                    log.warn("Could not fetch product categories: {}", ex.getMessage());
                }
            }

            deriveProvinceFromShippingAddress(variables);
        } catch (Exception ex) {
            log.warn("Could not fetch order summary: {}", ex.getMessage());
            deriveProvinceFromShippingAddress(variables);
        }
    }

    private void deriveProvinceFromShippingAddress(Map<String, Object> variables) {
        if (variables.containsKey("targetProvince")) {
            return;
        }
        Object location = variables.get("location");
        if (location != null && !location.toString().isBlank()) {
            variables.put("targetProvince", location.toString());
            return;
        }
        Object shipping = variables.get("shippingAddress");
        if (shipping == null) {
            return;
        }
        String addr = shipping.toString();
        if (addr.contains("Hanoi") || addr.contains("Hà Nội") || addr.contains("HN")) {
            variables.put("targetProvince", "Hanoi");
        } else if (addr.contains("Ho Chi Minh") || addr.contains("Hồ Chí Minh") || addr.contains("HCM")) {
            variables.put("targetProvince", "Ho Chi Minh");
        } else if (addr.contains("Da Nang") || addr.contains("Đà Nẵng") || addr.contains("DN")) {
            variables.put("targetProvince", "Da Nang");
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

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractDataList(Map<String, Object> response) {
        if (response == null) {
            return List.of();
        }
        Object dataObj = response.get("data");
        if (dataObj instanceof List) {
            return (List<Map<String, Object>>) dataObj;
        }
        return List.of();
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Long> toLongList(Object value) {
        if (value instanceof List) {
            return ((List<?>) value).stream()
                    .map(this::toLong)
                    .filter(id -> id != null)
                    .collect(Collectors.toList());
        }
        return List.of();
    }
}
