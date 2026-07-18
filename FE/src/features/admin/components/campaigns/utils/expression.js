import { NODE_TYPES } from "../constants.js";

// Parse Camunda expression strings (from edge.properties.expression) into
// structured params so the BranchEditor can render them as form inputs.
export function parseExpression(nodeType, expr) {
  if (!expr) return {};
  if (nodeType === "Condition_MemberRank") {
    const m = expr.match(/memberRank\s*==\s*['"]([^'"]+)['"]/);
    return { rank: m ? m[1] : "GOLD" };
  }
  if (nodeType === "Condition_TotalSpending") {
    const m = expr.match(/totalSpending\s*(>=|<=|>|<|==)\s*(\d+)/);
    return { operator: m ? m[1] : ">=", amount: m ? Number(m[2]) : 5000000 };
  }
  if (nodeType === "Condition_Location") {
    const m = expr.match(/targetProvince\s*==\s*['"]([^'"]+)['"]/);
    return { value: m ? m[1] : "Hanoi" };
  }
  if (nodeType === "Condition_ContainsCategory") {
    // Also parses the legacy `containsCategory == 'X'` form from older deployed campaigns.
    const listMatch = expr.match(/orderCategoryIds.*?contains\((\d+)\)/);
    if (listMatch) return { value: listMatch[1] };
    const legacyMatch = expr.match(/containsCategory\s*==\s*['"]([^'"]+)['"]/);
    return { value: legacyMatch ? legacyMatch[1] : "" };
  }
  if (nodeType === "Condition_ContainsProduct") {
    const listMatch = expr.match(/orderProductIds.*?contains\((\d+)\)/);
    if (listMatch) return { value: listMatch[1] };
    const legacyMatch = expr.match(/containsProduct\s*==\s*['"]([^'"]+)['"]/);
    return { value: legacyMatch ? legacyMatch[1] : "" };
  }
  return { raw: expr };
}

// Build the JUEL expression string + structured props to save on an edge branch.
export function buildBranchProps(nodeType, params) {
  if (nodeType === "Condition_MemberRank") {
    const rank = params.rank || "VIP";
    return { expression: "${memberRank == '" + rank + "'}", operator: "IN", value: rank };
  }
  if (nodeType === "Condition_TotalSpending") {
    const op = params.operator || ">=";
    const amt = Number(params.amount) || 0;
    let javaOp = "GREATER_THAN";
    if (op === "<=" || op === "<") javaOp = "LESS_THAN";
    else if (op === "==") javaOp = "EQUAL";
    return {
      expression: "${totalSpending " + op + " " + amt + "}",
      operator: javaOp,
      value: amt,
      timeRange: "LAST_30_DAYS"
    };
  }
  if (nodeType === "Condition_Location") {
    const v = params.value || "";
    return { expression: "${targetProvince == '" + v + "'}", operator: "EQUAL", value: [v] };
  }
  if (nodeType === "Condition_ContainsCategory") {
    // Checks the order's full category list, not just the first item. `value` stays raw (not
    // coerced to 0) so a blank branch still validates as blank.
    const raw = params.value != null ? String(params.value) : "";
    const n = Number(raw);
    const expr = raw.trim() !== "" && Number.isFinite(n)
      ? "${orderCategoryIds != null && orderCategoryIds.contains(" + n + ")}"
      : "";
    return { expression: expr, operator: "EQUAL", value: [raw] };
  }
  if (nodeType === "Condition_ContainsProduct") {
    const raw = params.value != null ? String(params.value) : "";
    const n = Number(raw);
    const expr = raw.trim() !== "" && Number.isFinite(n)
      ? "${orderProductIds != null && orderProductIds.contains(" + n + ")}"
      : "";
    return { expression: expr, operator: "EQUAL", value: [raw] };
  }
  return { expression: "" };
}

// Default IF-branch props when a Condition gateway is first inserted (IF + Else).
export function createDefaultBranchProps(nodeType, overrides = {}) {
  switch (nodeType) {
    case "Condition_MemberRank":
      return buildBranchProps(nodeType, { rank: "VIP", ...overrides });
    case "Condition_TotalSpending":
      return buildBranchProps(nodeType, { operator: ">=", amount: 5000000, ...overrides });
    case "Condition_Location":
      return buildBranchProps(nodeType, { value: "", ...overrides });
    case "Condition_ContainsCategory":
      return buildBranchProps(nodeType, { value: "", ...overrides });
    case "Condition_ContainsProduct":
      return buildBranchProps(nodeType, { value: "", ...overrides });
    default:
      return { expression: "" };
  }
}

// Rebuild structured edge props from expression when loading old graphs.
export function enrichBranchProps(nodeType, properties) {
  const props = properties || {};
  if (props.operator && props.expression) return props;
  if (props.expression) {
    return buildBranchProps(nodeType, parseExpression(nodeType, props.expression));
  }
  return createDefaultBranchProps(nodeType);
}

export function edgeLabel(sourceNode, edge) {
  if (!sourceNode || !edge) return "";
  if (edge.isDefault) return "Sai";
  if (NODE_TYPES[sourceNode.type]?.cat === "condition") return "Đúng";
  return "";
}
