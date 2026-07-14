import { NODE_TYPES } from "../constants.js";
import { buildGraphPayload } from "./graph.js";

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const DELEGATE_MAP = {
  Action_IssueVoucher_Percent:  "issueVoucherPercentDelegate",
  Action_IssueVoucher_Fixed:    "issueVoucherFixedDelegate",
  Action_IssueVoucher_Freeship: "issueVoucherFreeshippingDelegate",
  Action_Upgrade_MemberRank:    "upgradeMemberRankDelegate",
  Action_Loyalty_Point:         "loyaltyPointDelegate",
  Action_Send_Email:            "sendEmailDelegate"
};

const TRIGGER_TYPES = new Set([
  "Trigger_Event_NewUser",
  "Trigger_Event_OrderSuccess",
  "Trigger_Event_ReviewProduct",
  "Trigger_Timer_Schedule"
]);

const CONDITION_TYPES = new Set([
  "Condition_MemberRank",
  "Condition_TotalSpending",
  "Condition_Location",
  "Condition_ContainsCategory",
  "Condition_ContainsProduct"
]);

function isSmallNode(node) {
  return node.id === "start" || node.id === "end" || TRIGGER_TYPES.has(node.type) || node.type === "End_Event";
}

function isGatewayNode(node) {
  return CONDITION_TYPES.has(node.type);
}

function feSize(node) {
  const isSmall = isSmallNode(node);
  const isGateway = isGatewayNode(node);
  return {
    w: isSmall ? 90 : (isGateway ? 110 : 180),
    h: isSmall ? 90 : (isGateway ? 110 : 76)
  };
}

function camundaSize(node) {
  const isSmall = isSmallNode(node);
  const isGateway = isGatewayNode(node);
  return {
    w: isSmall ? 36 : (isGateway ? 50 : 100),
    h: isSmall ? 36 : (isGateway ? 50 : 80)
  };
}

function appendBpmnDiagram(parts, pk, positionedNodes, graphEdges) {
  const nodeById = Object.fromEntries(positionedNodes.map(n => [n.id, n]));

  parts.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_${pk}">`);
  parts.push(`    <bpmndi:BPMNPlane id="BPMNPlane_${pk}" bpmnElement="${pk}">`);

  positionedNodes.forEach(n => {
    const { w, h } = camundaSize(n);
    const { w: fw, h: fh } = feSize(n);
    const cx = (n.x || 0) + fw / 2;
    const cy = (n.y || 0) + fh / 2;
    const bx = Math.round(cx - w / 2);
    const by = Math.round(cy - h / 2);
    const marker = isGatewayNode(n) ? ' isMarkerVisible="true"' : "";
    parts.push(`      <bpmndi:BPMNShape id="Shape_${n.id}" bpmnElement="${n.id}"${marker}>`);
    parts.push(`        <dc:Bounds x="${bx}" y="${by}" width="${w}" height="${h}" />`);
    if (n.name) {
      parts.push("        <bpmndi:BPMNLabel>");
      parts.push(`          <dc:Bounds x="${bx}" y="${by + h + 4}" width="${Math.max(w, 120)}" height="14" />`);
      parts.push("        </bpmndi:BPMNLabel>");
    }
    parts.push("      </bpmndi:BPMNShape>");
  });

  graphEdges.forEach(e => {
    const fromNode = nodeById[e.source || e.from];
    const toNode = nodeById[e.target || e.to];
    if (!fromNode || !toNode) return;

    const fSize = feSize(fromNode);
    const tSize = feSize(toNode);
    const fCam = camundaSize(fromNode);
    const tCam = camundaSize(toNode);

    const fCX = (fromNode.x || 0) + fSize.w / 2;
    const fCY = (fromNode.y || 0) + fSize.h / 2;
    const tCX = (toNode.x || 0) + tSize.w / 2;
    const tCY = (toNode.y || 0) + tSize.h / 2;
    const dx = tCX - fCX;
    const dy = tCY - fCY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    const bxF = Math.round(fCX - fCam.w / 2);
    const byF = Math.round(fCY - fCam.h / 2);
    const bxT = Math.round(tCX - tCam.w / 2);
    const byT = Math.round(tCY - tCam.h / 2);

    let fWpX;
    let fWpY;
    let tWpX;
    let tWpY;
    const routeVertical = ady >= adx;

    if (routeVertical) {
      fWpX = Math.round(fCX);
      fWpY = dy >= 0 ? byF + fCam.h : byF;
      tWpX = Math.round(tCX);
      tWpY = dy >= 0 ? byT : byT + tCam.h;
    } else {
      fWpX = dx >= 0 ? bxF + fCam.w : bxF;
      fWpY = Math.round(fCY);
      tWpX = dx >= 0 ? bxT : bxT + tCam.w;
      tWpY = Math.round(tCY);
    }

    parts.push(`      <bpmndi:BPMNEdge id="Edge_${e.id}" bpmnElement="${e.id}" sourceElement="Shape_${fromNode.id}" targetElement="Shape_${toNode.id}">`);
    parts.push(`        <di:waypoint x="${fWpX}" y="${fWpY}" />`);

    if (routeVertical && fWpX !== tWpX) {
      const midY = Math.round((fWpY + tWpY) / 2);
      parts.push(`        <di:waypoint x="${fWpX}" y="${midY}" />`);
      parts.push(`        <di:waypoint x="${tWpX}" y="${midY}" />`);
    } else if (!routeVertical && fWpY !== tWpY) {
      const midX = Math.round((fWpX + tWpX) / 2);
      parts.push(`        <di:waypoint x="${midX}" y="${fWpY}" />`);
      parts.push(`        <di:waypoint x="${midX}" y="${tWpY}" />`);
    }

    parts.push(`        <di:waypoint x="${tWpX}" y="${tWpY}" />`);
    parts.push("      </bpmndi:BPMNEdge>");
  });

  parts.push("    </bpmndi:BPMNPlane>");
  parts.push("  </bpmndi:BPMNDiagram>");
}

// Client-side BPMN XML — includes BPMNDI so Camunda Modeler can open the diagram.
export function generateBPMNXML(nodes, edges) {
  const pk = "preview_" + Date.now();
  const graph = buildGraphPayload(nodes, edges);
  const positionedNodes = graph.nodes;
  const graphEdges = graph.edges;
  const parts = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
    + 'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
    + 'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
    + 'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
    + `id="Definitions_${pk}" targetNamespace="http://bpmn.io/schema/bpmn" `
    + 'exporter="CampaignBuilder" exporterVersion="2.1">'
  );
  parts.push(`  <bpmn:process id="${pk}" name="Workflow Preview" isExecutable="true">`);

  positionedNodes.forEach(n => {
    const meta = NODE_TYPES[n.type];
    const inc = graphEdges.filter(e => (e.target || e.to) === n.id).map(e => `      <bpmn:incoming>${e.id}</bpmn:incoming>`).join("\n");
    const out = graphEdges.filter(e => (e.source || e.from) === n.id).map(e => `      <bpmn:outgoing>${e.id}</bpmn:outgoing>`).join("\n");

    if (n.id === "start" || TRIGGER_TYPES.has(n.type)) {
      parts.push(`    <bpmn:startEvent id="${n.id}" name="${escXml(n.name)}">`);
      if (out) parts.push(out);
      parts.push("    </bpmn:startEvent>");
    } else if (n.id === "end" || n.type === "End_Event") {
      parts.push(`    <bpmn:endEvent id="${n.id}" name="${escXml(n.name)}">`);
      if (inc) parts.push(inc);
      parts.push("    </bpmn:endEvent>");
    } else if (meta && meta.cat === "condition") {
      const defaultEdge = graphEdges.find(e => (e.source || e.from) === n.id && e.isDefault);
      const defaultAttr = defaultEdge ? ` default="${defaultEdge.id}"` : "";
      parts.push(`    <bpmn:exclusiveGateway id="${n.id}" name="${escXml(n.name)}"${defaultAttr}>`);
      if (inc) parts.push(inc);
      if (out) parts.push(out);
      parts.push("    </bpmn:exclusiveGateway>");
    } else {
      const dc = DELEGATE_MAP[n.type] || "defaultDelegate";
      const props = Object.entries(n.properties || {})
        .map(([k, v]) => `          <camunda:inputParameter name="${k}">${escXml(String(v))}</camunda:inputParameter>`)
        .join("\n");
      parts.push(`    <bpmn:serviceTask id="${n.id}" name="${escXml(n.name)}" camunda:delegateExpression="\${${dc}}">`);
      if (inc) parts.push(inc);
      if (out) parts.push(out);
      parts.push("      <bpmn:extensionElements>");
      parts.push("        <camunda:inputOutput>");
      if (props) parts.push(props);
      parts.push("        </camunda:inputOutput>");
      parts.push("      </bpmn:extensionElements>");
      parts.push("    </bpmn:serviceTask>");
    }
  });

  graphEdges.forEach(e => {
    const srcId = e.source || e.from;
    const sn = positionedNodes.find(n => n.id === srcId);
    const isCondition = sn && NODE_TYPES[sn.type] && NODE_TYPES[sn.type].cat === "condition";
    const condition = e.condition || e.properties?.expression;
    if (isCondition && !e.isDefault && condition) {
      parts.push(`    <bpmn:sequenceFlow id="${e.id}" sourceRef="${srcId}" targetRef="${e.target || e.to}">`);
      parts.push(`      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${escXml(condition)}</bpmn:conditionExpression>`);
      parts.push("    </bpmn:sequenceFlow>");
    } else {
      parts.push(`    <bpmn:sequenceFlow id="${e.id}" sourceRef="${srcId}" targetRef="${e.target || e.to}" />`);
    }
  });

  parts.push("  </bpmn:process>");
  appendBpmnDiagram(parts, pk, positionedNodes, graphEdges);
  parts.push("</bpmn:definitions>");
  return parts.join("\n");
}

// Pretty-print XML for the preview panel.
export function formatXML(xml) {
  const PAD = "  ";
  let out = "";
  let pad = 0;
  const src = xml.replace(/(>)(<)(\/*)/g, "$1\n$2$3");
  src.split("\n").forEach(line => {
    let indent = 0;
    if (line.match(/.+<\/\w[^>]*>$/)) indent = 0;
    else if (line.match(/^<\/\w/)) { if (pad !== 0) pad--; }
    else if (line.match(/^<\w([^>]*[^/])?>.*$/)) indent = 1;
    out += PAD.repeat(pad) + line + "\n";
    pad += indent;
  });
  return out.trim();
}
