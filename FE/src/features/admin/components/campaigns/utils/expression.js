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
  if (nodeType === "Condition_AntiFraudScore") {
    const m = expr.match(/antiFraudScore\s*(>=|<=|>|<|==)\s*(\d+)/);
    return { operator: m ? m[1] : "<=", score: m ? Number(m[2]) : 50 };
  }
  if (nodeType === "Condition_Location") {
    const m = expr.match(/targetProvince\s*==\s*['"]([^'"]+)['"]/);
    return { value: m ? m[1] : "Hanoi" };
  }
  if (nodeType === "Condition_ContainsCategory") {
    const m = expr.match(/containsCategory\s*==\s*['"]([^'"]+)['"]/);
    return { value: m ? m[1] : "" };
  }
  if (nodeType === "Condition_ContainsProduct") {
    const m = expr.match(/containsProduct\s*==\s*['"]([^'"]+)['"]/);
    return { value: m ? m[1] : "" };
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
  if (nodeType === "Condition_AntiFraudScore") {
    const op = params.operator || "<=";
    const scr = Number(params.score) || 0;
    return { expression: "${antiFraudScore " + op + " " + scr + "}", operator: op, value: scr };
  }
  if (nodeType === "Condition_Location") {
    const v = params.value || "";
    return { expression: "${targetProvince == '" + v + "'}", operator: "EQUAL", value: [v] };
  }
  if (nodeType === "Condition_ContainsCategory") {
    const v = params.value || "";
    return { expression: "${containsCategory == '" + v + "'}", operator: "EQUAL", value: [v] };
  }
  if (nodeType === "Condition_ContainsProduct") {
    const v = params.value || "";
    return { expression: "${containsProduct == '" + v + "'}", operator: "EQUAL", value: [v] };
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
    case "Condition_AntiFraudScore":
      return buildBranchProps(nodeType, { operator: "<=", score: 50, ...overrides });
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
