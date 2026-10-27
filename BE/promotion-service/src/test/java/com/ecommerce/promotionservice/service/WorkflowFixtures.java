package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.WorkflowEdgeDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.dto.WorkflowMetaDto;
import com.ecommerce.promotionservice.dto.WorkflowNodeDto;
import com.ecommerce.promotionservice.dto.ValidationResultDto;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Dựng graph workflow mẫu cho test PH6 (Campaign Builder). */
public final class WorkflowFixtures {

    private WorkflowFixtures() {
    }

    public static WorkflowNodeDto node(String id, String type, String name, Map<String, Object> props) {
        return new WorkflowNodeDto(id, type, name, 100, 100, props == null ? new HashMap<>() : new HashMap<>(props));
    }

    public static WorkflowEdgeDto edge(String id, String from, String to) {
        return new WorkflowEdgeDto(id, from, to, null, null, new HashMap<>());
    }

    public static WorkflowEdgeDto cond(String id, String from, String to, String expr, Map<String, Object> props) {
        return new WorkflowEdgeDto(id, from, to, expr, false, new HashMap<>(props));
    }

    public static WorkflowEdgeDto deflt(String id, String from, String to) {
        return new WorkflowEdgeDto(id, from, to, null, true, new HashMap<>());
    }

    /**
     * Graph hợp lệ: Khách mới -> [Hạng thành viên] --GOLD--> Tặng voucher 10% (tối đa 50.000, 7 ngày) -> Kết thúc
     *                                                   \--else--> Kết thúc 2.  Quỹ ngân sách 1.000.000.
     */
    public static WorkflowGraphDto validGraph() {
        List<WorkflowNodeDto> nodes = new ArrayList<>(List.of(
                node("t1", "Trigger_Event_NewUser", "Khách mới", null),
                node("c1", "Condition_MemberRank", "Hạng thành viên", null),
                node("a1", "Action_IssueVoucher_Percent", "Tặng voucher 10%",
                        Map.of("discountPercent", 10, "maxDiscountAmount", 50000, "expireDays", 7)),
                node("e1", "End_Event", "Kết thúc", null),
                node("e2", "End_Event", "Kết thúc 2", null)));
        List<WorkflowEdgeDto> edges = new ArrayList<>(List.of(
                edge("f1", "t1", "c1"),
                cond("f2", "c1", "a1", "${memberRank == 'GOLD'}", Map.of("operator", "IN", "value", "GOLD")),
                deflt("f3", "c1", "e2"),
                edge("f4", "a1", "e1")));
        return new WorkflowGraphDto(new WorkflowMetaDto(new BigDecimal("1000000")), nodes, edges);
    }

    public static WorkflowNodeDto find(WorkflowGraphDto g, String id) {
        return g.getNodes().stream().filter(n -> n.getId().equals(id)).findFirst().orElseThrow();
    }

    public static boolean hasError(ValidationResultDto r, String nodeId, String field) {
        return r.getErrors().stream().anyMatch(e ->
                (nodeId == null ? e.getNodeId() == null : nodeId.equals(e.getNodeId()))
                        && field.equals(e.getField()));
    }
}
