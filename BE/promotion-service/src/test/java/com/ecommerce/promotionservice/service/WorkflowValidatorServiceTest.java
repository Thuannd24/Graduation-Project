package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.ValidationResultDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.dto.WorkflowMetaDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static com.ecommerce.promotionservice.service.WorkflowFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit test WorkflowValidatorService (PH6): luật kiểm tra graph Campaign Builder trước khi biên dịch BPMN.
 * Hàm thuần, không phụ thuộc ngoài.
 */
class WorkflowValidatorServiceTest {

    private final WorkflowValidatorService validator = new WorkflowValidatorService();

    @Test
    @DisplayName("TC_PH6_WF_01: Graph hợp lệ (1 trigger, gateway có đúng 1 nhánh else, action voucher đủ tham số, quỹ >= mức trừ tối đa) -> valid, không lỗi")
    void validGraph_passes() {
        ValidationResultDto r = validator.validate(validGraph());

        assertTrue(r.isValid(), () -> "Lỗi: " + r.getErrors());
        assertTrue(r.getErrors().isEmpty());
        assertTrue(r.getSummary().contains("hợp lệ"));
    }

    @Test
    @DisplayName("TC_PH6_WF_02: Lỗi cấu trúc: graph null; không có trigger; 2 trigger; không có End; kiểu node lạ")
    void structuralErrors() {
        assertFalse(validator.validate(null).isValid());
        assertFalse(validator.validate(new WorkflowGraphDto(null, null, List.of())).isValid());

        WorkflowGraphDto noTrigger = validGraph();
        noTrigger.getNodes().removeIf(n -> n.getId().equals("t1"));
        noTrigger.getEdges().removeIf(e -> e.getId().equals("f1"));
        assertTrue(hasError(validator.validate(noTrigger), null, "trigger"));

        WorkflowGraphDto twoTriggers = validGraph();
        twoTriggers.getNodes().add(node("t2", "Trigger_Event_OrderSuccess", "Đơn thành công", Map.of("minOrderValue", 0)));
        twoTriggers.getEdges().add(edge("f9", "t2", "c1"));
        assertTrue(hasError(validator.validate(twoTriggers), null, "trigger"));

        WorkflowGraphDto noEnd = validGraph();
        noEnd.getNodes().removeIf(n -> n.getType().equals("End_Event"));
        noEnd.getEdges().removeIf(e -> e.getTo().startsWith("e"));
        ValidationResultDto r = validator.validate(noEnd);
        assertTrue(hasError(r, null, "end_event"));
        assertTrue(hasError(r, "a1", "reachability"));

        WorkflowGraphDto unknown = validGraph();
        find(unknown, "a1").setType("Action_Hack");
        assertTrue(hasError(validator.validate(unknown), "a1", "type"));
    }

    @Test
    @DisplayName("TC_PH6_WF_03: Gateway điều kiện: thiếu nhánh else; 2 nhánh else; nhánh IF thiếu biểu thức condition; 2 nhánh IF trùng điều kiện; hạng thành viên không hợp lệ")
    void conditionRules() {
        WorkflowGraphDto noDefault = validGraph();
        noDefault.getEdges().get(2).setIsDefault(false);
        noDefault.getEdges().get(2).setCondition("${memberRank == 'VIP'}");
        noDefault.getEdges().get(2).setProperties(new java.util.HashMap<>(Map.of("operator", "IN", "value", "VIP")));
        assertTrue(hasError(validator.validate(noDefault), "c1", "isDefault"));

        WorkflowGraphDto twoDefaults = validGraph();
        twoDefaults.getEdges().get(1).setIsDefault(true);
        ValidationResultDto r2 = validator.validate(twoDefaults);
        assertTrue(r2.getErrors().stream().anyMatch(e -> "c1".equals(e.getNodeId()) && "isDefault".equals(e.getField())
                && "invalid_connectivity".equals(e.getErrorType())));

        WorkflowGraphDto noExpr = validGraph();
        noExpr.getEdges().get(1).setCondition("  ");
        assertTrue(hasError(validator.validate(noExpr), "c1", "edge[f2].condition"));

        WorkflowGraphDto dup = validGraph();
        dup.getNodes().add(node("a2", "Action_Send_Email", "Gửi mail", Map.of("templateId", "welcome_template")));
        dup.getEdges().add(cond("f5", "c1", "a2", "${memberRank == 'gold'}", Map.of("operator", "in", "value", " gold ")));
        dup.getEdges().add(edge("f6", "a2", "e1"));
        assertTrue(hasError(validator.validate(dup), "c1", "branches"));

        WorkflowGraphDto badRank = validGraph();
        badRank.getEdges().get(1).setProperties(new java.util.HashMap<>(Map.of("operator", "IN", "value", "GOLD,DIAMOND")));
        assertTrue(hasError(validator.validate(badRank), "c1", "edge[f2].value"));
    }

    @Test
    @DisplayName("TC_PH6_WF_04: Tham số action: % giảm 150; maxDiscount 0; expireDays 7.5; FIXED discountAmount âm; email templateId không tồn tại; nâng hạng DIAMOND; tích điểm ORDER_SPEND với trigger Khách mới; FIXED pointAmount 0")
    void actionParameterRules() {
        WorkflowGraphDto g = validGraph();
        find(g, "a1").getProperties().putAll(Map.of("discountPercent", 150, "maxDiscountAmount", 0, "expireDays", "7.5"));
        ValidationResultDto r = validator.validate(g);
        assertTrue(hasError(r, "a1", "discountPercent"));
        assertTrue(hasError(r, "a1", "maxDiscountAmount"));
        assertTrue(hasError(r, "a1", "expireDays"));

        String[][] cases = {
                {"Action_IssueVoucher_Fixed", "discountAmount"},
                {"Action_Send_Email", "templateId"},
                {"Action_Upgrade_MemberRank", "targetTier"},
                {"Action_Loyalty_Point", "calculationMode"},
                {"Action_Loyalty_Point", "pointAmount"},
        };
        List<Map<String, Object>> props = List.of(
                Map.of("discountAmount", -1, "minOrderValue", 0, "expireDays", 7),
                Map.of("templateId", "khong_ton_tai_template"),
                Map.of("targetTier", "DIAMOND"),
                Map.of("calculationMode", "order_spend", "pointAmount", 10),
                Map.of("calculationMode", "FIXED", "pointAmount", 0));
        for (int i = 0; i < cases.length; i++) {
            WorkflowGraphDto gi = validGraph();
            find(gi, "a1").setType(cases[i][0]);
            find(gi, "a1").setProperties(new java.util.HashMap<>(props.get(i)));
            ValidationResultDto ri = validator.validate(gi);
            final int idx = i;
            assertTrue(hasError(ri, "a1", cases[i][1]), () -> cases[idx][0] + " phải báo lỗi " + cases[idx][1] + ": " + ri.getErrors());
        }
    }

    @Test
    @DisplayName("TC_PH6_WF_05: Luật toàn cục: vòng lặp vô hạn bị chặn (vòng có node Gửi email được phép); node mồ côi; quỹ ngân sách thiếu hoặc nhỏ hơn mức trừ tối đa/lượt (30.000 < 50.000)")
    void globalRules_cycle_orphan_budget() {
        WorkflowGraphDto loop = validGraph();
        loop.getNodes().add(node("a2", "Action_Loyalty_Point", "Cộng điểm", Map.of("pointAmount", 10)));
        loop.getEdges().removeIf(e -> e.getId().equals("f4"));
        loop.getEdges().add(edge("f4", "a1", "a2"));
        loop.getEdges().add(edge("f5", "a2", "c1"));
        assertTrue(hasError(validator.validate(loop), null, "cycle"));

        WorkflowGraphDto waitLoop = validGraph();
        waitLoop.getNodes().add(node("a2", "Action_Send_Email", "Nhắc mail", Map.of("templateId", "welcome_template")));
        waitLoop.getEdges().removeIf(e -> e.getId().equals("f4"));
        waitLoop.getEdges().add(edge("f4", "a1", "a2"));
        waitLoop.getEdges().add(edge("f5", "a2", "c1"));
        assertFalse(hasError(validator.validate(waitLoop), null, "cycle"));

        WorkflowGraphDto orphan = validGraph();
        orphan.getNodes().add(node("a9", "Action_Upgrade_MemberRank", "Nâng hạng", Map.of("targetTier", "VIP")));
        assertTrue(hasError(validator.validate(orphan), "a9", "connectivity"));

        WorkflowGraphDto noBudget = validGraph();
        noBudget.setMeta(null);
        assertTrue(hasError(validator.validate(noBudget), null, "meta.totalBudget"));

        WorkflowGraphDto smallBudget = validGraph();
        smallBudget.setMeta(new WorkflowMetaDto(new BigDecimal("30000")));
        ValidationResultDto r = validator.validate(smallBudget);
        assertTrue(r.getErrors().stream().anyMatch(e -> "meta.totalBudget".equals(e.getField()) && "invalid_data".equals(e.getErrorType())));
    }
}
