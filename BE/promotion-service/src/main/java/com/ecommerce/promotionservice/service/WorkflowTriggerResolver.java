package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.dto.WorkflowNodeDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
@RequiredArgsConstructor
@Slf4j
public class WorkflowTriggerResolver {

    private static final Set<String> TRIGGER_TYPES = Set.of(
            "Trigger_Event_NewUser",
            "Trigger_Event_OrderSuccess",
            "Trigger_Event_ReviewProduct",
            "Trigger_Timer_Schedule"
    );

    private final ObjectMapper objectMapper;

    public Optional<String> resolveTriggerType(String workflowJson) {
        return findTriggerNode(workflowJson).map(WorkflowNodeDto::getType);
    }

    public Optional<WorkflowNodeDto> findTriggerNode(String workflowJson) {
        if (workflowJson == null || workflowJson.isBlank()) {
            return Optional.empty();
        }
        try {
            WorkflowGraphDto graph = objectMapper.readValue(workflowJson, WorkflowGraphDto.class);
            if (graph.getNodes() == null) {
                return Optional.empty();
            }
            return graph.getNodes().stream()
                    .filter(n -> TRIGGER_TYPES.contains(n.getType()))
                    .findFirst();
        } catch (Exception e) {
            log.warn("Cannot parse workflowJson for trigger: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public Map<String, Object> getTriggerProperties(String workflowJson) {
        return findTriggerNode(workflowJson)
                .map(WorkflowNodeDto::getProperties)
                .orElse(Map.of());
    }

    /**
     * Collects the "targetIds" property (category or product IDs) of every node of the given
     * condition type in this workflow (e.g. "Condition_ContainsCategory"). Used to determine
     * which categories/products a campaign restricts itself to, so vouchers it issues can carry
     * the same restriction through to redemption.
     */
    public List<Long> findConditionTargetIds(String workflowJson, String conditionType) {
        if (workflowJson == null || workflowJson.isBlank()) {
            return List.of();
        }
        try {
            WorkflowGraphDto graph = objectMapper.readValue(workflowJson, WorkflowGraphDto.class);
            if (graph.getNodes() == null) {
                return List.of();
            }
            List<Long> result = new java.util.ArrayList<>();
            for (WorkflowNodeDto node : graph.getNodes()) {
                if (!conditionType.equals(node.getType()) || node.getProperties() == null) {
                    continue;
                }
                Object targetIds = node.getProperties().get("targetIds");
                if (targetIds instanceof List<?> list) {
                    for (Object v : list) {
                        Long id = toLongOrNull(v);
                        if (id != null && !result.contains(id)) {
                            result.add(id);
                        }
                    }
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("Cannot parse workflowJson for condition target ids ({}): {}", conditionType, e.getMessage());
            return List.of();
        }
    }

    private Long toLongOrNull(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
