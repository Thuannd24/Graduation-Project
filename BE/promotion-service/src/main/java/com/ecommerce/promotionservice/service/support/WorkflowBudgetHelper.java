package com.ecommerce.promotionservice.service.support;

import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.dto.WorkflowMetaDto;
import com.ecommerce.promotionservice.dto.WorkflowNodeDto;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;

public final class WorkflowBudgetHelper {

    private static final Set<String> VOUCHER_ACTIONS = Set.of(
            "Action_IssueVoucher_Percent",
            "Action_IssueVoucher_Fixed",
            "Action_IssueVoucher_Freeship"
    );

    private WorkflowBudgetHelper() {
    }

    public static boolean requiresVoucherBudget(WorkflowGraphDto graph) {
        if (graph == null || graph.getNodes() == null) {
            return false;
        }
        return graph.getNodes().stream()
                .map(WorkflowNodeDto::getType)
                .anyMatch(type -> type != null && VOUCHER_ACTIONS.contains(type));
    }

    /** Per-issuance reserve amount configured on a voucher action node. */
    public static BigDecimal reservePerIssue(WorkflowNodeDto node) {
        if (node == null || node.getType() == null) {
            return BigDecimal.ZERO;
        }
        Map<String, Object> props = node.getProperties() != null ? node.getProperties() : Map.of();
        return switch (node.getType()) {
            case "Action_IssueVoucher_Percent" -> toBigDecimal(props.get("maxDiscountAmount"));
            case "Action_IssueVoucher_Fixed" -> toBigDecimal(props.get("discountAmount"));
            case "Action_IssueVoucher_Freeship" -> toBigDecimal(props.get("maxShippingDiscount"));
            default -> BigDecimal.ZERO;
        };
    }

    /** Sum of per-issue reserves — conservative minimum for the campaign pool. */
    public static BigDecimal estimateMinimumPool(WorkflowGraphDto graph) {
        if (graph == null || graph.getNodes() == null) {
            return BigDecimal.ZERO;
        }
        return graph.getNodes().stream()
                .filter(n -> n.getType() != null && VOUCHER_ACTIONS.contains(n.getType()))
                .map(WorkflowBudgetHelper::reservePerIssue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public static BigDecimal resolveTotalBudget(WorkflowGraphDto graph, BigDecimal dtoBudget) {
        if (graph != null && graph.getMeta() != null && graph.getMeta().getTotalBudget() != null) {
            return graph.getMeta().getTotalBudget();
        }
        return dtoBudget;
    }

    public static BigDecimal metaTotalBudget(WorkflowGraphDto graph) {
        if (graph == null || graph.getMeta() == null) {
            return null;
        }
        return graph.getMeta().getTotalBudget();
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal bd) {
            return bd.max(BigDecimal.ZERO);
        }
        if (value instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue()).max(BigDecimal.ZERO);
        }
        try {
            return new BigDecimal(value.toString()).max(BigDecimal.ZERO);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
