import { parseExpression } from "./expression.js";
import { NODE_TYPES } from "../constants.js";

export function formatBranchCondition(nodeType, edge) {
  if (!edge || edge.isDefault) return null;
  const props = edge.properties || {};
  const parsed = parseExpression(nodeType, props.expression);

  switch (nodeType) {
    case "Condition_MemberRank":
      return parsed.rank ? `Hạng = ${parsed.rank}` : null;
    case "Condition_TotalSpending":
      return parsed.amount != null
        ? `Chi tiêu ${parsed.operator || ">="} ${Number(parsed.amount).toLocaleString("vi-VN")}đ`
        : null;
    case "Condition_Location":
      return parsed.value ? `Tỉnh = ${parsed.value}` : null;
    case "Condition_ContainsCategory":
      return parsed.value ? `Danh mục = ${parsed.value}` : null;
    case "Condition_ContainsProduct":
      return parsed.value ? `SP = ${parsed.value}` : null;
    default:
      return props.expression || null;
  }
}

export function getConditionBranchSummary(node, edges) {
  if (!node || NODE_TYPES[node.type]?.cat !== "condition") return "";
  const outgoing = (edges || []).filter(e => e.source === node.id);
  const ifEdges = outgoing.filter(e => !e.isDefault);
  const parts = ifEdges
    .map(e => formatBranchCondition(node.type, e))
    .filter(Boolean);
  if (!parts.length) return "Chưa chọn điều kiện nào";
  if (parts.length === 1) return `IF: ${parts[0]}`;
  return `${parts.length} nhánh IF · ${parts[0]}…`;
}

export function getBranchTargetName(edges, nodes, conditionId, isDefault) {
  const edge = (edges || []).find(e => e.source === conditionId && !!e.isDefault === !!isDefault);
  if (!edge) return "—";
  const tgt = (nodes || []).find(n => n.id === edge.target);
  return tgt ? tgt.name : edge.target;
}
