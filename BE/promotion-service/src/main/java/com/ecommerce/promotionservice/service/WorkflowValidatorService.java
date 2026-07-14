package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.*;
import com.ecommerce.promotionservice.service.support.NotificationTemplateCodes;
import com.ecommerce.promotionservice.service.support.WorkflowBudgetHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * WorkflowValidatorService
 *
 * Validates a workflow graph (nodes + edges) from the Low-code Campaign Builder
 * against the BPMN / business rules spec before the graph is compiled to Camunda XML.
 *
 * Rules enforced:
 *   I. Per-Node connectivity & parameter rules (Triggers, Conditions, Actions, End)
 *  II. Global graph rules: connectivity, cycle detection, reachability to End Event
 */
@Service
@Slf4j
public class WorkflowValidatorService {

    // ── Node type classifications ──────────────────────────────────────────────
    private static final Set<String> TRIGGER_TYPES = Set.of(
            "Trigger_Event_NewUser",
            "Trigger_Event_OrderSuccess",
            "Trigger_Event_ReviewProduct",
            "Trigger_Timer_Schedule"
    );

    private static final Set<String> CONDITION_TYPES = Set.of(
            "Condition_MemberRank",
            "Condition_TotalSpending",
            "Condition_Location",
            "Condition_ContainsCategory",
            "Condition_ContainsProduct"
    );

    private static final Set<String> ACTION_TYPES = Set.of(
            "Action_IssueVoucher_Percent",
            "Action_IssueVoucher_Fixed",
            "Action_IssueVoucher_Freeship",
            "Action_Send_Email",
            "Action_Loyalty_Point",
            "Action_Upgrade_MemberRank"
    );

    private static final Set<String> VOUCHER_ACTION_TYPES = Set.of(
            "Action_IssueVoucher_Percent",
            "Action_IssueVoucher_Fixed",
            "Action_IssueVoucher_Freeship"
    );

    private static final String END_TYPE = "End_Event";

    private static final Set<String> ALL_KNOWN_TYPES;

    static {
        ALL_KNOWN_TYPES = new HashSet<>();
        ALL_KNOWN_TYPES.addAll(TRIGGER_TYPES);
        ALL_KNOWN_TYPES.addAll(CONDITION_TYPES);
        ALL_KNOWN_TYPES.addAll(ACTION_TYPES);
        ALL_KNOWN_TYPES.add(END_TYPE);
    } 
    // ── Public entry point ─────────────────────────────────────────────────────
    public ValidationResultDto validate( WorkflowGraphDto graph) {
        List<ValidationErrorDto> errors = new ArrayList<>();

        if (graph == null || graph.getNodes() == null || graph.getEdges() == null) {
            errors.add(global("missing_parameter", "graph",
                    "Cấu trúc graph không hợp lệ: thiếu danh sách nodes hoặc edges."));
            return buildResult(errors);
        }

        List<WorkflowNodeDto> nodes = graph.getNodes();
        List<WorkflowEdgeDto> edges = graph.getEdges();

        // Build adjacency helpers
        Map<String, WorkflowNodeDto> nodeMap = nodes.stream()
                .collect(Collectors.toMap(WorkflowNodeDto::getId, n -> n));

        Map<String, Long> inDegree = nodes.stream()
                .collect(Collectors.toMap(WorkflowNodeDto::getId,
                        n -> edges.stream().filter(e -> n.getId().equals(e.getTo())).count()));

        Map<String, List<WorkflowEdgeDto>> outEdges = nodes.stream()
                .collect(Collectors.toMap(WorkflowNodeDto::getId,
                        n -> edges.stream().filter(e -> n.getId().equals(e.getFrom()))
                                .collect(Collectors.toList())));

        // ── I. GLOBAL STRUCTURAL CHECKS ────────────────────────────────────────

        // 1) Unknown node types
        for (WorkflowNodeDto node : nodes) {
            if (!ALL_KNOWN_TYPES.contains(node.getType())) {
                errors.add(err(node.getId(), "invalid_connectivity", "type",
                        String.format("Node \"%s\" có kiểu không hợp lệ: \"%s\". Kiểu phải thuộc danh sách quy định.",
                                node.getName(), node.getType())));
            }
        }

        // 2) Exactly one Trigger (Start Event)
        List<WorkflowNodeDto> triggers = nodes.stream()
                .filter(n -> TRIGGER_TYPES.contains(n.getType()))
                .collect(Collectors.toList());
        if (triggers.isEmpty()) {
            errors.add(global("missing_parameter", "trigger",
                    "Chiến dịch BẮT BUỘC phải có ít nhất 1 Node Kích hoạt (Trigger/Start Event)."));
        } else if (triggers.size() > 1) {
            errors.add(global("invalid_connectivity", "trigger",
                    String.format("Chiến dịch chỉ được có DUY NHẤT 1 Node Kích hoạt. Hiện có %d node trigger.", triggers.size())));
        }

        // 3) At least one End Event
        List<WorkflowNodeDto> ends = nodes.stream()
                .filter(n -> END_TYPE.equals(n.getType()))
                .collect(Collectors.toList());
        if (ends.isEmpty()) {
            errors.add(global("missing_parameter", "end_event",
                    "Chiến dịch BẮT BUỘC phải có ít nhất 1 Node Kết thúc (End Event)."));
        }

        // 4) Campaign budget pool — only when voucher actions exist (stored in graph meta)
        if (WorkflowBudgetHelper.requiresVoucherBudget(graph)) {
            java.math.BigDecimal pool = WorkflowBudgetHelper.metaTotalBudget(graph);
            if (pool == null || pool.compareTo(java.math.BigDecimal.ZERO) <= 0) {
                errors.add(global("missing_parameter", "meta.totalBudget",
                        "Workflow có node Tặng Voucher — cần thiết lập Quỹ ngân sách chiến dịch trên thanh công cụ editor."));
            } else {
                java.math.BigDecimal minPool = WorkflowBudgetHelper.estimateMinimumPool(graph);
                if (minPool.compareTo(java.math.BigDecimal.ZERO) > 0
                        && pool.compareTo(minPool) < 0) {
                    errors.add(global("invalid_data", "meta.totalBudget",
                            String.format("Quỹ ngân sách (%s VNĐ) nên ≥ tổng trừ tối đa/lượt phát (%s VNĐ) của các node voucher.",
                                    pool.toPlainString(), minPool.toPlainString())));
                }
            }
        }

        // ── II. PER-NODE RULES ─────────────────────────────────────────────────
        for (WorkflowNodeDto node : nodes) {
            long inDeg = inDegree.getOrDefault(node.getId(), 0L);
            List<WorkflowEdgeDto> outs = outEdges.getOrDefault(node.getId(), List.of());
            long outDeg = outs.size();
            Map<String, Object> props = node.getProperties() != null ? node.getProperties() : Map.of();

            String type = node.getType();

            if (TRIGGER_TYPES.contains(type)) {
                validateTrigger(node, inDeg, outDeg, props, errors);
            } else if (CONDITION_TYPES.contains(type)) {
                validateCondition(node, inDeg, outs, props, edges, errors);
            } else if (ACTION_TYPES.contains(type)) {
                validateAction(node, inDeg, outDeg, props, nodes, errors);
            } else if (END_TYPE.equals(type)) {
                validateEnd(node, inDeg, outDeg, errors);
            }
        }

        // ── III. GLOBAL GRAPH RULES ────────────────────────────────────────────
        validateOrphanNodes(nodes, inDegree, outEdges, errors);
        validateNoCycles(nodes, outEdges, nodeMap, errors);
        validateReachability(nodes, outEdges, nodeMap, errors);

        return buildResult(errors);
    }

    // ── Trigger validation ─────────────────────────────────────────────────────
    private void validateTrigger(WorkflowNodeDto node, long inDeg, long outDeg,
                                  Map<String, Object> props, List<ValidationErrorDto> errors) {
        if (inDeg != 0) {
            errors.add(err(node.getId(), "invalid_connectivity", "in_degree",
                    String.format("Node Trigger \"%s\": in-degree phải = 0 (không được có kết nối đầu vào), hiện có %d.", node.getName(), inDeg)));
        }
        if (outDeg != 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "out_degree",
                    String.format("Node Trigger \"%s\": out-degree phải = 1, hiện có %d.", node.getName(), outDeg)));
        }

        switch (node.getType()) {
            case "Trigger_Event_OrderSuccess":
                requireNumber(node, props, "minOrderValue", errors);
                break;
            case "Trigger_Event_ReviewProduct":
                requireNumberInRange(node, props, "minRating", 1, 5, errors);
                break;
            case "Trigger_Timer_Schedule":
                boolean hasCron = hasNonBlankString(props, "cronExpression");
                boolean hasDates = hasNonBlankString(props, "startDate") && hasNonBlankString(props, "endDate");
                if (!hasCron && !hasDates) {
                    errors.add(err(node.getId(), "missing_parameter", "cronExpression / startDate+endDate",
                            String.format("Node \"%s\" (Lịch trình định kỳ): phải cung cấp \"cronExpression\" HOẶC cặp \"startDate\" và \"endDate\".", node.getName())));
                }
                break;
            // Trigger_Event_NewUser: no dynamic params required
        }
    }

    // ── Condition (Gateway) validation ────────────────────────────────────────
    private void validateCondition(WorkflowNodeDto node, long inDeg,
                                    List<WorkflowEdgeDto> outs,
                                    Map<String, Object> props,
                                    List<WorkflowEdgeDto> allEdges,
                                    List<ValidationErrorDto> errors) {
        if (inDeg < 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "in_degree",
                    String.format("Node Condition \"%s\": in-degree phải >= 1, hiện có %d.", node.getName(), inDeg)));
        }
        if (outs.size() < 2) {
            errors.add(err(node.getId(), "invalid_connectivity", "out_degree",
                    String.format("Node Condition \"%s\": phải có ít nhất 2 nhánh ra (out-degree >= 2), hiện có %d.", node.getName(), outs.size())));
        }

        // BUG FIX: must be EXACTLY one default/else branch, not just "at least one". If a graph
        // ever has 2 edges both marked isDefault (client bug, or a direct API call bypassing the
        // FE), BpmnCompilerService's `.findFirst()` silently keeps only one of them as the
        // gateway's `default=`, leaving the other as a plain unconditional sequence flow that
        // Camunda's parser rejects at deploy time ("sequence flow without condition which is not
        // the default flow") - a confusing failure that should be caught here instead.
        long defaultCount = outs.stream().filter(e -> Boolean.TRUE.equals(e.getIsDefault())).count();
        if (defaultCount == 0) {
            errors.add(err(node.getId(), "missing_parameter", "isDefault",
                    String.format("Node Condition \"%s\": BẮT BUỘC phải có đúng 1 nhánh ra được đánh dấu \"isDefault = true\" (nhánh Else) để tránh Deadlock trong Camunda.", node.getName())));
        } else if (defaultCount > 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "isDefault",
                    String.format("Node Condition \"%s\": chỉ được có ĐÚNG 1 nhánh Else (isDefault=true), hiện có %d nhánh.", node.getName(), defaultCount)));
        }

        // Node-level properties validation
        switch (node.getType()) {
            case "Condition_MemberRank":
                requireStringOrArray(node, props, "allowedRanks", errors);
                break;
            case "Condition_TotalSpending":
                requireNumber(node, props, "minSpendingAmount", errors);
                requireNumber(node, props, "daysLookback", errors);
                break;
            case "Condition_Location":
                requireStringOrArray(node, props, "targetProvinces", errors);
                break;
            case "Condition_ContainsCategory":
            case "Condition_ContainsProduct":
                requireStringOrArray(node, props, "targetIds", errors);
                break;
        }

        // Per-branch parameter check – inspect each non-default edge's properties/condition.
        // BUG FIX: validation used to be gated behind `if (edgeProps.containsKey("operator"))`,
        // so a branch saved with an empty properties map (e.g. admin never touched the
        // dropdown) skipped validation entirely and was treated as valid. It is now
        // unconditional, and every branch also requires a non-blank JUEL `condition` - the
        // actual string BpmnCompilerService uses to build the gateway's conditionExpression -
        // which was never checked here before at all.
        List<String> branchSignatures = new ArrayList<>();
        for (WorkflowEdgeDto edge : outs) {
            if (Boolean.TRUE.equals(edge.getIsDefault())) continue; // default branch has no conditions
            Map<String, Object> edgeProps = getEdgeProperties(edge, allEdges);

            if (edge.getCondition() == null || edge.getCondition().isBlank()) {
                errors.add(err(node.getId(), "missing_parameter", "edge[" + edge.getId() + "].condition",
                        String.format("Nhánh ra \"%s\" của node \"%s\": chưa có biểu thức điều kiện (condition) — kiểm tra lại các trường đã chọn cho nhánh này.",
                                edge.getId(), node.getName())));
            }

            switch (node.getType()) {
                case "Condition_MemberRank":
                    requireEdgeEnum(node, edge, edgeProps, "operator", Set.of("IN", "NOT_IN"), errors);
                    requireEdgeArrayNonEmpty(node, edge, edgeProps, "value", errors);
                    requireEdgeStringValuesSubsets(node, edge, edgeProps, "value", Set.of("MEMBER", "SILVER", "GOLD", "VIP"), errors);
                    break;
                case "Condition_TotalSpending":
                    requireEdgeEnum(node, edge, edgeProps, "operator", Set.of("GREATER_THAN", "LESS_THAN", "EQUAL"), errors);
                    requireEdgeNumber(node, edge, edgeProps, "value", errors);
                    requireEdgeEnum(node, edge, edgeProps, "timeRange", Set.of("CURRENT_MONTH", "LAST_30_DAYS"), errors);
                    break;
                case "Condition_Location":
                    requireEdgeEnum(node, edge, edgeProps, "operator", Set.of("EQUAL", "NOT_EQUAL"), errors);
                    requireEdgeArrayNonEmpty(node, edge, edgeProps, "value", errors);
                    break;
                case "Condition_ContainsCategory":
                case "Condition_ContainsProduct":
                    // BUG FIX: these two condition types had NO per-branch validation at all,
                    // so a branch with an unselected category/product (FE sends value: [""],
                    // which passes a naive "list is empty?" check since the list has one blank
                    // element) could be deployed as a dead branch that never matches anything.
                    requireEdgeEnum(node, edge, edgeProps, "operator", Set.of("EQUAL", "NOT_EQUAL"), errors);
                    requireEdgeArrayNonEmpty(node, edge, edgeProps, "value", errors);
                    break;
            }

            branchSignatures.add(branchSignature(node.getType(), edgeProps));
        }

        // BUG FIX: detect two sibling IF branches configured with the identical condition
        // (e.g. two branches both "Hạng = GOLD"). Camunda's exclusive gateway evaluates
        // outgoing flows in array order and takes the first match, so a duplicate branch is
        // always unreachable dead logic that silently never fires - the FE had no warning for
        // this either.
        Set<String> seenSignatures = new HashSet<>();
        for (String signature : branchSignatures) {
            if (signature == null) continue;
            if (!seenSignatures.add(signature)) {
                errors.add(err(node.getId(), "invalid_data", "branches",
                        String.format("Node Condition \"%s\": có ít nhất 2 nhánh IF cấu hình điều kiện giống hệt nhau (%s) — một trong hai nhánh sẽ không bao giờ được thực thi.",
                                node.getName(), signature)));
                break; // report once per node, avoid spamming duplicate errors
            }
        }
    }

    /** Normalized signature of a branch's condition config, used to detect duplicate/overlapping siblings. */
    private String branchSignature(String nodeType, Map<String, Object> edgeProps) {
        Object operator = edgeProps.get("operator");
        Object value = edgeProps.get("value");
        String valueStr;
        if (value instanceof List<?> list) {
            valueStr = list.stream().map(String::valueOf).map(String::trim).map(s -> s.toUpperCase(Locale.ROOT))
                    .sorted().collect(Collectors.joining(","));
        } else {
            valueStr = value != null ? value.toString().trim().toUpperCase(Locale.ROOT) : "";
        }
        if (valueStr.isBlank()) {
            return null; // already reported as missing_parameter above; do not also flag as duplicate
        }
        return nodeType + "|" + (operator != null ? operator.toString().toUpperCase(Locale.ROOT) : "") + "|" + valueStr;
    }

    // ── Action validation ─────────────────────────────────────────────────────
    private void validateAction(WorkflowNodeDto node, long inDeg, long outDeg,
                                 Map<String, Object> props,
                                 List<WorkflowNodeDto> allNodes,
                                 List<ValidationErrorDto> errors) {
        if (inDeg < 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "in_degree",
                    String.format("Node Action \"%s\": in-degree phải >= 1, hiện có %d.", node.getName(), inDeg)));
        }
        if (outDeg != 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "out_degree",
                    String.format("Node Action \"%s\": out-degree phải = 1 (ngoại trừ khi kết nối thẳng tới End Event), hiện có %d.", node.getName(), outDeg)));
        }

        switch (node.getType()) {
            case "Action_IssueVoucher_Percent":
                requireNumberInRange(node, props, "discountPercent", 1, 100, errors);
                // BUG FIX: maxDiscountAmount/expireDays previously only had to be *a* number
                // (0, negative, or a decimal like "7.5" all passed). A zero/negative
                // maxDiscountAmount makes calculatePercentDiscount() always compute a 0đ
                // discount (voucher issued but permanently useless), and a non-integer
                // expireDays silently falls back to a default in DelegateVariableHelper.getInt()
                // (Integer.parseInt throws on "7.5") without telling the admin.
                requireNumberGt(node, props, "maxDiscountAmount", 0, errors);
                requireIntegerGt(node, props, "expireDays", 0, errors);
                break;
            case "Action_IssueVoucher_Fixed":
                requireNumberGt(node, props, "discountAmount", 0, errors);
                requireNumber(node, props, "minOrderValue", errors);
                requireIntegerGt(node, props, "expireDays", 0, errors);
                break;
            case "Action_IssueVoucher_Freeship":
                // BUG FIX: maxShippingDiscount<=0 makes IssueVoucherFreeshippingDelegate's call
                // throw IllegalArgumentException at issuance time, which is caught and only
                // logged (voucherIssued=false) - the campaign "succeeds" but never actually
                // grants a voucher, with zero signal to whoever configured it.
                requireNumberGt(node, props, "maxShippingDiscount", 0, errors);
                requireIntegerGt(node, props, "expireDays", 0, errors);
                break;
            case "Action_Send_Email":
                boolean hasTemplate = hasNonBlankString(props, "templateId");
                boolean hasRaw = hasNonBlankString(props, "rawContent");
                if (!hasTemplate && !hasRaw) {
                    errors.add(err(node.getId(), "missing_parameter", "templateId / rawContent",
                            String.format("Node \"%s\": phải cung cấp \"templateId\" HOẶC \"rawContent\" (không được để trống).", node.getName())));
                }
                if (hasTemplate) {
                    String templateId = props.get("templateId").toString().trim();
                    if (!NotificationTemplateCodes.isValidEmailTemplate(templateId)) {
                        errors.add(err(node.getId(), "invalid_data", "templateId",
                                String.format("Node \"%s\": templateId \"%s\" không tồn tại. Chọn mẫu email có sẵn hoặc dùng rawContent.",
                                        node.getName(), templateId)));
                    }
                    if ("promotion_voucher_template".equals(templateId)
                            && !hasVoucherAction(allNodes)) {
                        errors.add(err(node.getId(), "invalid_data", "templateId",
                                String.format("Node \"%s\": mẫu voucher cần có node Tặng Voucher trong workflow.", node.getName())));
                    }
                }
                break;
            case "Action_Loyalty_Point":
                String calcMode = props.get("calculationMode") != null
                        ? props.get("calculationMode").toString().toUpperCase()
                        : "FIXED";
                if ("ORDER_SPEND".equals(calcMode)) {
                    if (props.get("pointAmount") != null && !(props.get("pointAmount") instanceof Number)) {
                        errors.add(err(node.getId(), "invalid_data", "pointAmount",
                                String.format("Node \"%s\": pointAmount phải là số.", node.getName())));
                    }
                    String triggerType = resolveTriggerType(allNodes);
                    if (!"Trigger_Event_OrderSuccess".equals(triggerType)) {
                        errors.add(err(node.getId(), "invalid_data", "calculationMode",
                                String.format("Node \"%s\": ORDER_SPEND cần trigger \"Đơn hàng thành công\" (có orderAmount).",
                                        node.getName())));
                    }
                } else {
                    requireNumber(node, props, "pointAmount", errors);
                    Object pa = props.get("pointAmount");
                    if (pa instanceof Number n && n.doubleValue() == 0) {
                        errors.add(err(node.getId(), "invalid_data", "pointAmount",
                                String.format("Node \"%s\": FIXED yêu cầu pointAmount khác 0.", node.getName())));
                    }
                }
                break;
            case "Action_Upgrade_MemberRank":
                requireString(node, props, "targetTier", errors);
                Object targetTier = props.get("targetTier");
                if (targetTier != null) {
                    Set<String> validTiers = Set.of("SILVER", "GOLD", "VIP");
                    if (!validTiers.contains(targetTier.toString().toUpperCase())) {
                        errors.add(err(node.getId(), "invalid_data", "targetTier",
                                String.format("Node \"%s\": hạng thẻ \"%s\" không hợp lệ. Chỉ chấp nhận: %s.", node.getName(), targetTier, validTiers)));
                    }
                }
                break;
        }
    }

    // ── End Event validation ──────────────────────────────────────────────────
    private void validateEnd(WorkflowNodeDto node, long inDeg, long outDeg,
                              List<ValidationErrorDto> errors) {
        if (inDeg < 1) {
            errors.add(err(node.getId(), "invalid_connectivity", "in_degree",
                    String.format("Node Kết thúc \"%s\": in-degree phải >= 1, hiện có %d.", node.getName(), inDeg)));
        }
        if (outDeg != 0) {
            errors.add(err(node.getId(), "invalid_connectivity", "out_degree",
                    String.format("Node Kết thúc \"%s\": out-degree phải = 0 (không được có kết nối đầu ra), hiện có %d.", node.getName(), outDeg)));
        }
    }

    // ── Global Rule 1: No Orphan Nodes ────────────────────────────────────────
    private void validateOrphanNodes(List<WorkflowNodeDto> nodes,
                                      Map<String, Long> inDegree,
                                      Map<String, List<WorkflowEdgeDto>> outEdges,
                                      List<ValidationErrorDto> errors) {
        for (WorkflowNodeDto node : nodes) {
            boolean isTrigger = TRIGGER_TYPES.contains(node.getType());
            boolean isEnd = END_TYPE.equals(node.getType());
            if (isTrigger || isEnd) continue; // these legitimately have zero in or out
            long in = inDegree.getOrDefault(node.getId(), 0L);
            long out = outEdges.getOrDefault(node.getId(), List.of()).size();
            if (in == 0 && out == 0) {
                errors.add(err(node.getId(), "invalid_connectivity", "connectivity",
                        String.format("Node \"%s\" bị mồ côi: không có bất kỳ kết nối nào vào hoặc ra. Hãy kết nối node này vào luồng hoặc xóa đi.", node.getName())));
            }
        }
    }

    // ── Global Rule 2: No Infinite Cycles ────────────────────────────────────
    private void validateNoCycles(List<WorkflowNodeDto> nodes,
                                   Map<String, List<WorkflowEdgeDto>> outEdges,
                                   Map<String, WorkflowNodeDto> nodeMap,
                                   List<ValidationErrorDto> errors) {
        Set<String> visited = new HashSet<>();
        Set<String> stack = new HashSet<>();
        List<String> cyclePath = new ArrayList<>();

        for (WorkflowNodeDto node : nodes) {
            if (!visited.contains(node.getId())) {
                if (dfsCycleDetect(node.getId(), outEdges, visited, stack, cyclePath, nodeMap)) {
                    errors.add(global("invalid_connectivity", "cycle",
                            "Phát hiện vòng lặp vô hạn (không có Node ngắt quãng) trong luồng: " + String.join(" → ", cyclePath) +
                                    ". Bắt buộc phải có Node Timer hoặc Node Hành động có tính chất ngắt quãng bên trong vòng lặp."));
                    break; // report first cycle only
                }
            }
        }
    }

    private boolean dfsCycleDetect(String nodeId,
                                    Map<String, List<WorkflowEdgeDto>> outEdges,
                                    Set<String> visited,
                                    Set<String> stack,
                                    List<String> path,
                                    Map<String, WorkflowNodeDto> nodeMap) {
        visited.add(nodeId);
        stack.add(nodeId);
        path.add(nodeId);

        for (WorkflowEdgeDto edge : outEdges.getOrDefault(nodeId, List.of())) {
            String neighbor = edge.getTo();
            if (!visited.contains(neighbor)) {
                if (dfsCycleDetect(neighbor, outEdges, visited, stack, path, nodeMap)) {
                    return true;
                }
            } else if (stack.contains(neighbor)) {
                path.add(neighbor); // close the loop for display
                // Check if cycle contains a wait state
                int startIndex = path.indexOf(neighbor);
                boolean hasWait = false;
                for (int i = startIndex; i < path.size(); i++) {
                    String cNodeId = path.get(i);
                    WorkflowNodeDto cNode = nodeMap.get(cNodeId);
                    if (cNode != null && (cNode.getType().contains("Timer") || cNode.getType().contains("Action_Send_"))) {
                        hasWait = true;
                        break;
                    }
                }
                if (!hasWait) {
                    return true; // Infinite cycle found
                } else {
                    path.remove(path.size() - 1); // pop neighbor, continue search
                    continue; 
                }
            }
        }

        stack.remove(nodeId);
        path.remove(path.size() - 1);
        return false;
    }

    // ── Global Rule 3: All paths reach an End Event ───────────────────────────
    private void validateReachability(List<WorkflowNodeDto> nodes,
                                       Map<String, List<WorkflowEdgeDto>> outEdges,
                                       Map<String, WorkflowNodeDto> nodeMap,
                                       List<ValidationErrorDto> errors) {
        // Find every leaf node (outDegree == 0)
        for (WorkflowNodeDto node : nodes) {
            long outDeg = outEdges.getOrDefault(node.getId(), List.of()).size();
            if (outDeg == 0 && !END_TYPE.equals(node.getType())) {
                errors.add(err(node.getId(), "invalid_connectivity", "reachability",
                        String.format("Node \"%s\" là điểm cuối nhưng không phải End Event. Mọi nhánh đều phải dẫn về một Node Kết thúc.", node.getName())));
            }
        }
    }

    // ── Helpers: parameter checking ───────────────────────────────────────────
    private void requireString(WorkflowNodeDto node, Map<String, Object> props,
                                String field, List<ValidationErrorDto> errors) {
        if (!hasNonBlankString(props, field)) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc và không được để trống.", node.getName(), field)));
        }
    }

    private void requireStringOrArray(WorkflowNodeDto node, Map<String, Object> props,
                                      String field, List<ValidationErrorDto> errors) {
        Object val = props.get(field);
        boolean empty = (val == null) ||
                (val instanceof java.util.List && ((java.util.List<?>) val).isEmpty()) ||
                (val instanceof String && ((String) val).isBlank());
        if (empty) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc và không được để trống.", node.getName(), field)));
        }
    }

    private void requireNumber(WorkflowNodeDto node, Map<String, Object> props,
                                String field, List<ValidationErrorDto> errors) {
        Object val = props.get(field);
        if (val == null) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc (Number).", node.getName(), field)));
            return;
        }
        if (!isNumber(val)) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải là Number, nhận được \"%s\".", node.getName(), field, val)));
        }
    }

    private void requireNumberGt(WorkflowNodeDto node, Map<String, Object> props,
                                  String field, double min, List<ValidationErrorDto> errors) {
        Object val = props.get(field);
        if (val == null) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc (Number > %s).", node.getName(), field, min)));
            return;
        }
        if (!isNumber(val)) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải là Number.", node.getName(), field)));
            return;
        }
        double d = toDouble(val);
        if (d <= min) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải > %s, nhận được %s.", node.getName(), field, min, d)));
        }
    }

    /** Like requireNumberGt, but also rejects non-integer values (e.g. "7.5") - for fields
     *  consumed downstream via Integer.parseInt (see DelegateVariableHelper.getInt), which
     *  would otherwise silently fall back to a default instead of surfacing the bad input. */
    private void requireIntegerGt(WorkflowNodeDto node, Map<String, Object> props,
                                   String field, double min, List<ValidationErrorDto> errors) {
        Object val = props.get(field);
        if (val == null) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc (số nguyên > %s).", node.getName(), field, min)));
            return;
        }
        if (!isNumber(val)) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải là số nguyên.", node.getName(), field)));
            return;
        }
        double d = toDouble(val);
        if (d <= min) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải > %s, nhận được %s.", node.getName(), field, min, d)));
            return;
        }
        if (d != Math.floor(d)) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải là số nguyên (không có phần thập phân), nhận được %s.", node.getName(), field, d)));
        }
    }

    private void requireNumberInRange(WorkflowNodeDto node, Map<String, Object> props,
                                       String field, double min, double max,
                                       List<ValidationErrorDto> errors) {
        Object val = props.get(field);
        if (val == null) {
            errors.add(err(node.getId(), "missing_parameter", field,
                    String.format("Node \"%s\": trường \"%s\" là bắt buộc (%s–%s).", node.getName(), field, min, max)));
            return;
        }
        if (!isNumber(val)) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải là Number.", node.getName(), field)));
            return;
        }
        double d = toDouble(val);
        if (d < min || d > max) {
            errors.add(err(node.getId(), "wrong_data_type", field,
                    String.format("Node \"%s\": trường \"%s\" phải nằm trong khoảng %s–%s, nhận được %s.", node.getName(), field, min, max, d)));
        }
    }

    private Map<String, Object> getEdgeProperties(WorkflowEdgeDto edge, List<WorkflowEdgeDto> allEdges) {
        return edge.getProperties() != null ? edge.getProperties() : Map.of();
    }

    private void requireEdgeEnum(WorkflowNodeDto node, WorkflowEdgeDto edge,
                                  Map<String, Object> edgeProps, String field,
                                  Set<String> allowed, List<ValidationErrorDto> errors) {
        Object val = edgeProps.get(field);
        if (val == null || !allowed.contains(val.toString().toUpperCase())) {
            errors.add(err(node.getId(), "missing_parameter", "edge[" + edge.getId() + "]." + field,
                    String.format("Nhánh ra \"%s\" của node \"%s\": trường \"%s\" phải là một trong %s.",
                            edge.getId(), node.getName(), field, allowed)));
        }
    }

    private void requireEdgeStringValuesSubsets(WorkflowNodeDto node, WorkflowEdgeDto edge,
                                                 Map<String, Object> edgeProps, String field,
                                                 Set<String> allowed, List<ValidationErrorDto> errors) {
        Object val = edgeProps.get(field);
        if (val instanceof String) {
            String[] parts = ((String) val).split(",");
            for (String part : parts) {
                if (!allowed.contains(part.trim().toUpperCase())) {
                    errors.add(err(node.getId(), "invalid_data", "edge[" + edge.getId() + "]." + field,
                            String.format("Nhánh ra \"%s\" của node \"%s\": giá trị \"%s\" không hợp lệ. Chỉ chấp nhận các giá trị: %s.",
                                    edge.getId(), node.getName(), part.trim(), allowed)));
                }
            }
        }
    }

    private void requireEdgeArrayNonEmpty(WorkflowNodeDto node, WorkflowEdgeDto edge,
                                           Map<String, Object> edgeProps, String field,
                                           List<ValidationErrorDto> errors) {
        Object val = edgeProps.get(field);
        // BUG FIX: a list containing only blank strings (e.g. [""], which is exactly what an
        // unselected FE dropdown for Location/ContainsCategory/ContainsProduct sends) used to
        // pass this check because `List.isEmpty()` is false for a 1-element list - only an
        // actually-empty list or null tripped the old check. Now every element must be a
        // non-blank string for the list to count as "filled in".
        boolean empty = (val == null) ||
                (val instanceof List<?> list && (list.isEmpty()
                        || list.stream().allMatch(v -> v == null || v.toString().isBlank()))) ||
                (val instanceof String str && str.isBlank());
        if (empty) {
            errors.add(err(node.getId(), "missing_parameter", "edge[" + edge.getId() + "]." + field,
                    String.format("Nhánh ra \"%s\" của node \"%s\": trường \"%s\" là mảng bắt buộc và không được rỗng.",
                            edge.getId(), node.getName(), field)));
        }
    }

    private void requireEdgeNumber(WorkflowNodeDto node, WorkflowEdgeDto edge,
                                    Map<String, Object> edgeProps, String field,
                                    List<ValidationErrorDto> errors) {
        Object val = edgeProps.get(field);
        if (val == null || !isNumber(val)) {
            errors.add(err(node.getId(), "missing_parameter", "edge[" + edge.getId() + "]." + field,
                    String.format("Nhánh ra \"%s\" của node \"%s\": trường \"%s\" phải là Number.",
                            edge.getId(), node.getName(), field)));
        }
    }

    // ── Type utilities ────────────────────────────────────────────────────────
    private boolean hasVoucherAction(List<WorkflowNodeDto> nodes) {
        return nodes.stream()
                .map(WorkflowNodeDto::getType)
                .anyMatch(type -> type != null && VOUCHER_ACTION_TYPES.contains(type));
    }

    private String resolveTriggerType(List<WorkflowNodeDto> nodes) {
        return nodes.stream()
                .map(WorkflowNodeDto::getType)
                .filter(type -> type != null && TRIGGER_TYPES.contains(type))
                .findFirst()
                .orElse(null);
    }

    private boolean hasNonBlankString(Map<String, Object> props, String key) {
        Object v = props.get(key);
        return v != null && !v.toString().isBlank();
    }

    private boolean isNumber(Object val) {
        if (val instanceof Number) return true;
        try {
            Double.parseDouble(val.toString());
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private double toDouble(Object val) {
        if (val instanceof Number) return ((Number) val).doubleValue();
        return Double.parseDouble(val.toString());
    }

    // ── Error builders ────────────────────────────────────────────────────────
    private ValidationErrorDto err(String nodeId, String errorType, String field, String message) {
        return ValidationErrorDto.builder()
                .nodeId(nodeId)
                .errorType(errorType)
                .field(field)
                .message(message)
                .build();
    }

    private ValidationErrorDto global(String errorType, String field, String message) {
        return ValidationErrorDto.builder()
                .errorType(errorType)
                .field(field)
                .message(message)
                .build();
    }

    private ValidationResultDto buildResult(List<ValidationErrorDto> errors) {
        boolean valid = errors.isEmpty();
        String summary = valid
                ? "✅ Workflow hợp lệ. Sẵn sàng biên dịch sang Camunda BPMN XML."
                : String.format("❌ Workflow KHÔNG hợp lệ. Phát hiện %d lỗi cần sửa trước khi deploy.", errors.size());
        return ValidationResultDto.builder()
                .valid(valid)
                .errors(errors)
                .summary(summary)
                .build();
    }
}
