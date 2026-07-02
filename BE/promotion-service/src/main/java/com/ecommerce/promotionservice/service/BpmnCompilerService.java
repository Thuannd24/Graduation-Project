package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.WorkflowEdgeDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.dto.WorkflowNodeDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * BpmnCompilerService
 *
 * Compiles a validated WorkflowGraphDto into a Camunda-7 compatible BPMN 2.0 XML string.
 *
 * Mapping rules:
 *   Trigger_*         → bpmn:startEvent  (with camunda:properties for trigger metadata)
 *   Condition_*       → bpmn:exclusiveGateway
 *   Action_IssueVoucher_* / Action_Send_* / Action_Loyalty_Point
 *                     → bpmn:serviceTask (with camunda:delegateExpression)
 *   End_Event         → bpmn:endEvent
 *   Edges             → bpmn:sequenceFlow  (with bpmn:conditionExpression for conditions)
 */
@Service
@Slf4j
public class BpmnCompilerService {

    // Delegate bean names registered in Spring context
    private static final Map<String, String> DELEGATE_MAP = Map.ofEntries(
            Map.entry("Action_IssueVoucher_Percent",  "${issueVoucherPercentDelegate}"),
            Map.entry("Action_IssueVoucher_Fixed",    "${issueVoucherFixedDelegate}"),
            Map.entry("Action_IssueVoucher_Freeship", "${issueVoucherFreeshippingDelegate}"),
            Map.entry("Action_Send_Email",             "${sendEmailDelegate}"),
            Map.entry("Action_Send_SMS",               "${sendSmsDelegate}"),
            Map.entry("Action_Send_AppPush",           "${sendAppPushDelegate}"),
            Map.entry("Action_Send_Zalo",              "${sendZaloDelegate}"),
            Map.entry("Action_Loyalty_Point",          "${loyaltyPointDelegate}"),
            Map.entry("Action_Upgrade_MemberRank",     "${upgradeMemberRankDelegate}")
    );

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
            "Condition_ContainsProduct",
            "Condition_AntiFraudScore"
    );

    public String compile(WorkflowGraphDto graph, String processKey, String processName) {
        List<WorkflowNodeDto> nodes = graph.getNodes();
        List<WorkflowEdgeDto> edges = graph.getEdges();

        Map<String, List<WorkflowEdgeDto>> inEdges = nodes.stream()
                .collect(Collectors.toMap(WorkflowNodeDto::getId,
                        n -> edges.stream().filter(e -> n.getId().equals(e.getTo())).collect(Collectors.toList())));
        Map<String, List<WorkflowEdgeDto>> outEdges = nodes.stream()
                .collect(Collectors.toMap(WorkflowNodeDto::getId,
                        n -> edges.stream().filter(e -> n.getId().equals(e.getFrom())).collect(Collectors.toList())));

        StringBuilder sb = new StringBuilder();

        // ── XML Header ────────────────────────────────────────────────────────
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<bpmn:definitions\n");
        sb.append("    xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\"\n");
        sb.append("    xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\"\n");
        sb.append("    xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\"\n");
        sb.append("    xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\"\n");
        sb.append("    xmlns:camunda=\"http://camunda.org/schema/1.0/bpmn\"\n");
        sb.append("    xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n");
        sb.append("    id=\"Definitions_CampaignBuilder\"\n");
        sb.append("    targetNamespace=\"http://bpmn.io/schema/bpmn\"\n");
        sb.append("    exporter=\"Campaign Builder Backend\"\n");
        sb.append("    exporterVersion=\"2.0.0\">\n\n");

        // ── Process ──────────────────────────────────────────────────────────
        sb.append("  <bpmn:process id=\"").append(esc(processKey)).append("\"")
          .append(" name=\"").append(esc(processName)).append("\"")
          .append(" isExecutable=\"true\"")
          .append(" camunda:historyTimeToLive=\"180\">\n\n");

        // ── Nodes ─────────────────────────────────────────────────────────────
        for (WorkflowNodeDto node : nodes) {
            String nId = node.getId();
            String nName = esc(node.getName());
            Map<String, Object> props = node.getProperties() != null ? node.getProperties() : Map.of();

            String flowsXml = buildFlowRefs(
                    inEdges.getOrDefault(nId, List.of()),
                    outEdges.getOrDefault(nId, List.of()));

            if (TRIGGER_TYPES.contains(node.getType())) {
                // ── Start Event: outgoing trước, eventDefinition sau (BPMN 2.0 schema) ──
                sb.append("    <bpmn:startEvent id=\"").append(nId).append("\" name=\"").append(nName).append("\">\n");
                sb.append(flowsXml);

                if ("Trigger_Timer_Schedule".equals(node.getType())) {
                    String cron = getString(props, "cronExpression");
                    String startDate = getString(props, "startDate");
                    if (cron != null && !cron.isBlank()) {
                        sb.append("      <bpmn:timerEventDefinition id=\"Timer_").append(nId).append("\">\n");
                        sb.append("        <bpmn:timeCycle xsi:type=\"bpmn:tFormalExpression\">").append(esc(cron)).append("</bpmn:timeCycle>\n");
                        sb.append("      </bpmn:timerEventDefinition>\n");
                    } else if (startDate != null && !startDate.isBlank()) {
                        sb.append("      <bpmn:timerEventDefinition id=\"Timer_").append(nId).append("\">\n");
                        sb.append("        <bpmn:timeDate xsi:type=\"bpmn:tFormalExpression\">").append(esc(startDate)).append("</bpmn:timeDate>\n");
                        sb.append("      </bpmn:timerEventDefinition>\n");
                    }
                }
                sb.append("    </bpmn:startEvent>\n\n");

            } else if (CONDITION_TYPES.contains(node.getType())) {
                // ── Exclusive Gateway ────────────────────────────────────────
                String defaultFlowId = outEdges.getOrDefault(nId, List.of()).stream()
                        .filter(e -> Boolean.TRUE.equals(e.getIsDefault()))
                        .map(WorkflowEdgeDto::getId)
                        .findFirst().orElse(null);

                sb.append("    <bpmn:exclusiveGateway id=\"").append(nId).append("\" name=\"").append(nName).append("\"");
                if (defaultFlowId != null) {
                    sb.append(" default=\"").append(defaultFlowId).append("\"");
                }
                sb.append(">\n");
                sb.append(flowsXml);
                sb.append("    </bpmn:exclusiveGateway>\n\n");

            } else if ("End_Event".equals(node.getType())) {
                // ── End Event ────────────────────────────────────────────────
                sb.append("    <bpmn:endEvent id=\"").append(nId).append("\" name=\"").append(nName).append("\">\n");
                sb.append(flowsXml);
                sb.append("    </bpmn:endEvent>\n\n");

            } else {
                // ── Service Task: extensionElements trước incoming/outgoing ──
                String delegate = DELEGATE_MAP.getOrDefault(node.getType(), "${genericActionDelegate}");
                sb.append("    <bpmn:serviceTask id=\"").append(nId).append("\" name=\"").append(nName).append("\"")
                  .append(" camunda:asyncBefore=\"true\" camunda:delegateExpression=\"").append(delegate).append("\">\n");
                sb.append("      <bpmn:extensionElements>\n");
                sb.append("        <camunda:inputOutput>\n");
                sb.append("          <camunda:inputParameter name=\"actionType\">").append(esc(node.getType())).append("</camunda:inputParameter>\n");
                for (Map.Entry<String, Object> entry : props.entrySet()) {
                    sb.append("          <camunda:inputParameter name=\"").append(esc(entry.getKey())).append("\">")
                      .append(esc(String.valueOf(entry.getValue())))
                      .append("</camunda:inputParameter>\n");
                }
                sb.append("        </camunda:inputOutput>\n");
                sb.append("      </bpmn:extensionElements>\n");
                sb.append(flowsXml);
                sb.append("    </bpmn:serviceTask>\n\n");
            }
        }

        // ── Sequence Flows ────────────────────────────────────────────────────
        for (WorkflowEdgeDto edge : edges) {
            sb.append("    <bpmn:sequenceFlow id=\"").append(edge.getId()).append("\"")
              .append(" sourceRef=\"").append(edge.getFrom()).append("\"")
              .append(" targetRef=\"").append(edge.getTo()).append("\"");

            String condition = edge.getCondition();
            boolean isDefault = Boolean.TRUE.equals(edge.getIsDefault());

            if (condition != null && !condition.isBlank() && !isDefault) {
                sb.append(">\n");
                sb.append("      <bpmn:conditionExpression xsi:type=\"bpmn:tFormalExpression\">")
                  .append(esc(condition))
                  .append("</bpmn:conditionExpression>\n");
                sb.append("    </bpmn:sequenceFlow>\n\n");
            } else {
                sb.append(" />\n\n");
            }
        }

        sb.append("  </bpmn:process>\n\n");

        // ── BPMNDiagram (layout info) ─────────────────────────────────────────
        sb.append("  <bpmndi:BPMNDiagram id=\"BPMNDiagram_Campaign\">\n");
        sb.append("    <bpmndi:BPMNPlane id=\"BPMNPlane_Campaign\" bpmnElement=\"").append(esc(processKey)).append("\">\n");

        // Camunda-standard sizes (BPMN spec):
        //   startEvent / endEvent : 36 × 36
        //   exclusiveGateway      : 50 × 50
        //   serviceTask           : 100 × 80
        for (WorkflowNodeDto node : nodes) {
            boolean isSmall   = TRIGGER_TYPES.contains(node.getType()) || "End_Event".equals(node.getType());
            boolean isGateway = CONDITION_TYPES.contains(node.getType());
            int w = isSmall ? 36 : (isGateway ? 50 : 100);
            int h = isSmall ? 36 : (isGateway ? 50 : 80);

            // Center the Camunda shape on the same visual center as the frontend node
            // Frontend sizes: trigger/end=90px, condition=110px, action=180×76px
            int fwFE = isSmall ? 90 : (isGateway ? 110 : 180);
            int fhFE = isSmall ? 90 : (isGateway ? 110 : 76);
            int cxFE = (int) node.getX() + fwFE / 2;
            int cyFE = (int) node.getY() + fhFE / 2;

            // Camunda shape top-left = center − half Camunda size
            int bx = cxFE - w / 2;
            int by = cyFE - h / 2;

            sb.append("      <bpmndi:BPMNShape id=\"Shape_").append(node.getId()).append("\"")
              .append(" bpmnElement=\"").append(node.getId()).append("\"");
            if (isGateway) sb.append(" isMarkerVisible=\"true\"");
            sb.append(">\n");
            sb.append("        <dc:Bounds x=\"").append(bx).append("\"")
              .append(" y=\"").append(by).append("\"")
              .append(" width=\"").append(w).append("\"")
              .append(" height=\"").append(h).append("\" />\n");
            sb.append("      </bpmndi:BPMNShape>\n");
        }

        for (WorkflowEdgeDto edge : edges) {
            WorkflowNodeDto fromNode = null, toNode = null;
            for (WorkflowNodeDto n : nodes) {
                if (n.getId().equals(edge.getFrom())) fromNode = n;
                if (n.getId().equals(edge.getTo()))   toNode   = n;
            }
            if (fromNode == null || toNode == null) continue;

            // ── Compute exit/entry waypoints matching frontend smart routing ──
            boolean isSF = TRIGGER_TYPES.contains(fromNode.getType()) || "End_Event".equals(fromNode.getType());
            boolean isGF = CONDITION_TYPES.contains(fromNode.getType());
            boolean isST = TRIGGER_TYPES.contains(toNode.getType())   || "End_Event".equals(toNode.getType());
            boolean isGT = CONDITION_TYPES.contains(toNode.getType());

            int fwFE = isSF ? 90 : (isGF ? 110 : 180);
            int fhFE = isSF ? 90 : (isGF ? 110 : 76);
            int twFE = isST ? 90 : (isGT ? 110 : 180);
            int thFE = isST ? 90 : (isGT ? 110 : 76);

            double fCX = fromNode.getX() + fwFE / 2.0;
            double fCY = fromNode.getY() + fhFE / 2.0;
            double tCX = toNode.getX()   + twFE / 2.0;
            double tCY = toNode.getY()   + thFE / 2.0;
            double dx  = tCX - fCX, dy = tCY - fCY;
            double adx = Math.abs(dx), ady = Math.abs(dy);

            // Exit port (Camunda coordinate space uses Camunda shape center)
            int wF = isSF ? 36 : (isGF ? 50 : 100);
            int hF = isSF ? 36 : (isGF ? 50 : 80);
            int wT = isST ? 36 : (isGT ? 50 : 100);
            int hT = isST ? 36 : (isGT ? 50 : 80);
            int bxF = (int) fCX - wF/2, byF = (int) fCY - hF/2;
            int bxT = (int) tCX - wT/2, byT = (int) tCY - hT/2;

            int fWpX, fWpY, tWpX, tWpY;
            boolean routeVertical = ady >= adx;

            if (routeVertical) {
                fWpX = (int) fCX;
                fWpY = dy >= 0 ? byF + hF : byF;   // exit bottom or top
                tWpX = (int) tCX;
                tWpY = dy >= 0 ? byT : byT + hT;   // enter top or bottom
            } else {
                fWpX = dx >= 0 ? bxF + wF : bxF;   // exit right or left
                fWpY = (int) fCY;
                tWpX = dx >= 0 ? bxT : bxT + wT;   // enter left or right
                tWpY = (int) tCY;
            }

            sb.append("      <bpmndi:BPMNEdge id=\"Edge_").append(edge.getId()).append("\"")
              .append(" bpmnElement=\"").append(edge.getId()).append("\"")
              .append(" sourceElement=\"Shape_").append(fromNode.getId()).append("\"")
              .append(" targetElement=\"Shape_").append(toNode.getId()).append("\">\n");

            // Source waypoint
            sb.append("        <di:waypoint x=\"").append(fWpX).append("\" y=\"").append(fWpY).append("\" />\n");

            // Elbow intermediate waypoints for Manhattan routing
            if (routeVertical && fWpX != tWpX) {
                int midY = (fWpY + tWpY) / 2;
                sb.append("        <di:waypoint x=\"").append(fWpX).append("\" y=\"").append(midY).append("\" />\n");
                sb.append("        <di:waypoint x=\"").append(tWpX).append("\" y=\"").append(midY).append("\" />\n");
            } else if (!routeVertical && fWpY != tWpY) {
                int midX = (fWpX + tWpX) / 2;
                sb.append("        <di:waypoint x=\"").append(midX).append("\" y=\"").append(fWpY).append("\" />\n");
                sb.append("        <di:waypoint x=\"").append(midX).append("\" y=\"").append(tWpY).append("\" />\n");
            }

            // Target waypoint
            sb.append("        <di:waypoint x=\"").append(tWpX).append("\" y=\"").append(tWpY).append("\" />\n");
            sb.append("      </bpmndi:BPMNEdge>\n");
        }

        sb.append("    </bpmndi:BPMNPlane>\n");
        sb.append("  </bpmndi:BPMNDiagram>\n");
        sb.append("</bpmn:definitions>\n");


        String xml = sb.toString();
        log.info("Compiled BPMN XML ({} chars) for process key '{}'", xml.length(), processKey);
        return xml;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private String buildFlowRefs(List<WorkflowEdgeDto> ins, List<WorkflowEdgeDto> outs) {
        StringBuilder sb = new StringBuilder();
        for (WorkflowEdgeDto e : ins) {
            sb.append("      <bpmn:incoming>").append(e.getId()).append("</bpmn:incoming>\n");
        }
        for (WorkflowEdgeDto e : outs) {
            sb.append("      <bpmn:outgoing>").append(e.getId()).append("</bpmn:outgoing>\n");
        }
        return sb.toString();
    }

    private String getString(Map<String, Object> props, String key) {
        Object v = props.get(key);
        return v != null ? v.toString() : null;
    }

    /** XML-escape the five standard special characters. */
    private String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}
