package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import org.camunda.bpm.model.bpmn.Bpmn;
import org.camunda.bpm.model.bpmn.BpmnModelInstance;
import org.camunda.bpm.model.bpmn.instance.ConditionExpression;
import org.camunda.bpm.model.bpmn.instance.ExclusiveGateway;
import org.camunda.bpm.model.bpmn.instance.Process;
import org.camunda.bpm.model.bpmn.instance.SequenceFlow;
import org.camunda.bpm.model.bpmn.instance.ServiceTask;
import org.camunda.bpm.model.bpmn.instance.StartEvent;
import org.camunda.bpm.model.bpmn.instance.TimerEventDefinition;
import org.camunda.bpm.model.bpmn.instance.camunda.CamundaInputParameter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;

import static com.ecommerce.promotionservice.service.WorkflowFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit test BpmnCompilerService (PH6): XML sinh ra phải đọc được bằng Camunda BPMN Model API (kiểm tra theo schema BPMN 2.0)
 * và ánh xạ đúng node -> phần tử BPMN.
 */
class BpmnCompilerServiceTest {

    private final BpmnCompilerService compiler = new BpmnCompilerService();

    private static BpmnModelInstance parse(String xml) {
        BpmnModelInstance model = Bpmn.readModelFromStream(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        Bpmn.validateModel(model);
        return model;
    }

    @Test
    @DisplayName("TC_PH6_BPMN_01: Biên dịch graph hợp lệ -> BPMN hợp lệ schema: startEvent, exclusiveGateway có default=nhánh else, serviceTask asyncBefore + delegate ${issueVoucherPercentDelegate} + inputParameter, conditionExpression giữ nguyên JUEL; ký tự đặc biệt trong tên được escape")
    void compile_validGraph_producesValidBpmn() {
        WorkflowGraphDto g = validGraph();
        g.getEdges().get(1).setCondition("${memberRank == 'GOLD' && totalSpending > 1000}");
        String name = "Khuyến mãi <VIP> & \"Tết\"";

        String xml = compiler.compile(g, "khuyen_mai_vip", name);
        BpmnModelInstance model = parse(xml);

        Process process = model.getModelElementById("khuyen_mai_vip");
        assertTrue(process.isExecutable());
        assertEquals(name, process.getName());
        assertNotNull(model.<StartEvent>getModelElementById("t1"));

        ExclusiveGateway gw = model.getModelElementById("c1");
        assertEquals("f3", gw.getDefault().getId());

        ServiceTask task = model.getModelElementById("a1");
        assertEquals("${issueVoucherPercentDelegate}", task.getCamundaDelegateExpression());
        assertTrue(task.isCamundaAsyncBefore());
        Map<String, String> params = task.getExtensionElements().getElementsQuery()
                .filterByType(org.camunda.bpm.model.bpmn.instance.camunda.CamundaInputOutput.class).singleResult()
                .getCamundaInputParameters().stream()
                .collect(Collectors.toMap(CamundaInputParameter::getCamundaName, CamundaInputParameter::getTextContent));
        assertEquals("Action_IssueVoucher_Percent", params.get("actionType"));
        assertEquals("10", params.get("discountPercent"));
        assertEquals("50000", params.get("maxDiscountAmount"));

        SequenceFlow f2 = model.getModelElementById("f2");
        ConditionExpression ce = f2.getConditionExpression();
        assertEquals("${memberRank == 'GOLD' && totalSpending > 1000}", ce.getTextContent());
        assertNull(model.<SequenceFlow>getModelElementById("f3").getConditionExpression());
        assertEquals("e1", model.<SequenceFlow>getModelElementById("f4").getTarget().getId());
    }

    @Test
    @DisplayName("TC_PH6_BPMN_02: Trigger lịch trình: có cronExpression -> timerEventDefinition/timeCycle; chỉ có startDate -> timeDate")
    void compile_timerTrigger() {
        WorkflowGraphDto cron = validGraph();
        find(cron, "t1").setType("Trigger_Timer_Schedule");
        find(cron, "t1").getProperties().put("cronExpression", "0 0 9 * * ?");
        BpmnModelInstance m1 = parse(compiler.compile(cron, "timer_cron", "Hằng ngày 9h"));
        TimerEventDefinition t1 = (TimerEventDefinition) m1.<StartEvent>getModelElementById("t1").getEventDefinitions().iterator().next();
        assertEquals("0 0 9 * * ?", t1.getTimeCycle().getTextContent());
        assertNull(t1.getTimeDate());

        WorkflowGraphDto date = validGraph();
        find(date, "t1").setType("Trigger_Timer_Schedule");
        find(date, "t1").getProperties().putAll(Map.of("startDate", "2026-11-11T00:00:00", "endDate", "2026-11-12T00:00:00"));
        BpmnModelInstance m2 = parse(compiler.compile(date, "timer_date", "11/11"));
        TimerEventDefinition t2 = (TimerEventDefinition) m2.<StartEvent>getModelElementById("t1").getEventDefinitions().iterator().next();
        assertEquals("2026-11-11T00:00:00", t2.getTimeDate().getTextContent());
        assertNull(t2.getTimeCycle());
    }
}
