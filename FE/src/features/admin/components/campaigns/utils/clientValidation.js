import { NODE_TYPES } from "../constants.js";
import { EMAIL_TEMPLATE_CODES } from "../constants/emailTemplates.js";
import { estimateMinimumPool, workflowRequiresBudget } from "./workflowBudget.js";

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

const ACTION_TYPES = new Set([
  "Action_IssueVoucher_Percent",
  "Action_IssueVoucher_Fixed",
  "Action_IssueVoucher_Freeship",
  "Action_Send_Email",
  "Action_Loyalty_Point",
  "Action_Upgrade_MemberRank"
]);

const END_TYPE = "End_Event";
const ALL_KNOWN = new Set([...TRIGGER_TYPES, ...CONDITION_TYPES, ...ACTION_TYPES, END_TYPE]);

const MEMBER_RANKS = new Set(["MEMBER", "SILVER", "GOLD", "VIP"]);
const UPGRADE_TIERS = new Set(["SILVER", "GOLD", "VIP"]);

const VOUCHER_ACTION_TYPES = new Set([
  "Action_IssueVoucher_Percent",
  "Action_IssueVoucher_Fixed",
  "Action_IssueVoucher_Freeship"
]);

function err(nodeId, errorType, field, message) {
  return { nodeId, errorType, field, message };
}

function globalErr(errorType, field, message) {
  return { errorType, field, message };
}

function hasText(v) {
  return v != null && String(v).trim() !== "";
}

function isNumber(v) {
  if (typeof v === "number") return Number.isFinite(v);
  if (v == null || v === "") return false;
  return !Number.isNaN(Number(v));
}

function toNum(v) {
  return typeof v === "number" ? v : Number(v);
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0;
}

// BUG FIX: a list containing only blank strings (e.g. [""], exactly what an unselected
// Location/ContainsCategory/ContainsProduct dropdown saves) used to pass the old
// `isNonEmptyStringOrArray` check because `.length > 0` is true for a 1-element array. Every
// element must now be non-blank for the field to count as "filled in".
function isNonEmptyEdgeValue(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0 && v.every(x => hasText(x));
  return hasText(v);
}

function buildAdjacency(nodes, edges) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const inDegree = Object.fromEntries(nodes.map(n => [n.id, 0]));
  const outEdges = Object.fromEntries(nodes.map(n => [n.id, []]));
  edges.forEach(e => {
    const src = e.source || e.from;
    const tgt = e.target || e.to;
    if (inDegree[tgt] != null) inDegree[tgt]++;
    if (outEdges[src]) outEdges[src].push(e);
  });
  return { nodeMap, inDegree, outEdges };
}

function validateTrigger(node, inDeg, outDeg, props, errors) {
  if (inDeg !== 0) {
    errors.push(err(node.id, "invalid_connectivity", "in_degree",
      `Trigger "${node.name}": không được có kết nối đầu vào (in-degree = ${inDeg}).`));
  }
  if (outDeg !== 1) {
    errors.push(err(node.id, "invalid_connectivity", "out_degree",
      `Trigger "${node.name}": phải có đúng 1 kết nối ra (out-degree = ${outDeg}).`));
  }
  switch (node.type) {
    case "Trigger_Event_OrderSuccess":
      if (!isNumber(props.minOrderValue)) {
        errors.push(err(node.id, "missing_parameter", "minOrderValue",
          `Trigger "${node.name}": minOrderValue là bắt buộc (số).`));
      }
      break;
    case "Trigger_Event_ReviewProduct": {
      const r = props.minRating;
      if (!isNumber(r) || toNum(r) < 1 || toNum(r) > 5) {
        errors.push(err(node.id, "wrong_data_type", "minRating",
          `Trigger "${node.name}": minRating phải từ 1–5.`));
      }
      break;
    }
    case "Trigger_Timer_Schedule": {
      const hasCron = hasText(props.cronExpression);
      const hasDates = hasText(props.startDate) && hasText(props.endDate);
      if (!hasCron && !hasDates) {
        errors.push(err(node.id, "missing_parameter", "cronExpression",
          `Trigger "${node.name}": cần cronExpression HOẶC cặp startDate + endDate.`));
      }
      const startDate = (props.startDate || "").slice(0, 10);
      const endDate = (props.endDate || "").slice(0, 10);
      if (startDate && endDate && endDate < startDate) {
        errors.push(err(node.id, "INVALID_DATE_RANGE", "endDate",
          `Trigger "${node.name}": ngày kết thúc phải sau ngày bắt đầu.`));
      }
      break;
    }
    default:
      break;
  }
}

function validateCondition(node, inDeg, outs, props, errors) {
  if (inDeg < 1) {
    errors.push(err(node.id, "invalid_connectivity", "in_degree",
      `Condition "${node.name}": cần ít nhất 1 kết nối vào.`));
  }
  if (outs.length < 2) {
    errors.push(err(node.id, "invalid_connectivity", "out_degree",
      `Condition "${node.name}": cần ít nhất 2 nhánh (IF + Else), hiện có ${outs.length}.`));
  }
  // BUG FIX: must be EXACTLY one default/else branch, not just "at least one" - two edges both
  // marked isDefault would leave the BE compiler picking only one as the gateway's `default`,
  // and the deploy fails with a confusing Camunda error instead of a clear message here.
  const defaultCount = outs.filter(e => e.isDefault).length;
  if (defaultCount === 0) {
    errors.push(err(node.id, "missing_parameter", "isDefault",
      `Condition "${node.name}": thiếu nhánh Else (isDefault = true).`));
  } else if (defaultCount > 1) {
    errors.push(err(node.id, "invalid_connectivity", "isDefault",
      `Condition "${node.name}": chỉ được có ĐÚNG 1 nhánh Else, hiện có ${defaultCount}.`));
  }
  const ifBranches = outs.filter(e => !e.isDefault);
  if (ifBranches.length === 0) {
    errors.push(err(node.id, "missing_parameter", "if_branch",
      `Condition "${node.name}": cần ít nhất 1 nhánh IF (isDefault = false).`));
  }

  switch (node.type) {
    // Only daysLookback is required - the rest is per-branch (see ConditionFields.jsx).
    case "Condition_TotalSpending":
      if (!isNumber(props.daysLookback)) {
        errors.push(err(node.id, "missing_parameter", "daysLookback",
          `Condition "${node.name}": daysLookback là bắt buộc.`));
      }
      break;
    // targetIds is optional - empty means "no redemption restriction", a valid state.
    default:
      break;
  }

  // BUG FIX: per-branch validation used to be gated behind `needsEdgeConfig && !ep.expression &&
  // !ep.operator` — since `buildBranchProps()` always fills in `expression`/`operator` as soon as
  // a branch is created (even with an empty selected value), this condition could basically never
  // fire, and 2 of the 5 condition types (ContainsCategory/ContainsProduct) were
  // not even in the `needsEdgeConfig` list. Every non-default branch is now validated
  // unconditionally, for every condition type, and duplicate/overlapping sibling branches are
  // flagged too (mirrors BE WorkflowValidatorService).
  const ifBranchEdges = outs.filter(e => !e.isDefault);
  const seenSignatures = new Set();
  let duplicateReported = false;

  ifBranchEdges.forEach(edge => {
    const ep = edge.properties || {};

    if (!hasText(ep.expression)) {
      errors.push(err(node.id, "missing_parameter", `edge.${edge.id}.expression`,
        `Nhánh IF của "${node.name}": chưa có biểu thức điều kiện — kiểm tra lại các trường đã chọn cho nhánh này.`));
    }

    switch (node.type) {
      case "Condition_MemberRank": {
        const op = String(ep.operator || "").toUpperCase();
        if (!["IN", "NOT_IN"].includes(op)) {
          errors.push(err(node.id, "invalid_data", `edge.${edge.id}.operator`,
            `Nhánh IF của "${node.name}": operator phải là IN hoặc NOT_IN.`));
        }
        if (!isNonEmptyEdgeValue(ep.value)) {
          errors.push(err(node.id, "missing_parameter", `edge.${edge.id}.value`,
            `Nhánh IF của "${node.name}": value không được trống.`));
        }
        break;
      }
      case "Condition_TotalSpending": {
        const op = String(ep.operator || "").toUpperCase();
        if (!["GREATER_THAN", "LESS_THAN", "EQUAL"].includes(op)) {
          errors.push(err(node.id, "invalid_data", `edge.${edge.id}.operator`,
            `Nhánh IF của "${node.name}": operator không hợp lệ.`));
        }
        if (!isNumber(ep.value)) {
          errors.push(err(node.id, "missing_parameter", `edge.${edge.id}.value`,
            `Nhánh IF của "${node.name}": value phải là số.`));
        }
        break;
      }
      case "Condition_Location":
      case "Condition_ContainsCategory":
      case "Condition_ContainsProduct": {
        // BUG FIX: ContainsCategory/ContainsProduct previously had no per-branch validation at
        // all, so a branch with an unselected category/product could be saved as a dead branch.
        const op = String(ep.operator || "").toUpperCase();
        if (!["EQUAL", "NOT_EQUAL"].includes(op)) {
          errors.push(err(node.id, "invalid_data", `edge.${edge.id}.operator`,
            `Nhánh IF của "${node.name}": operator không hợp lệ.`));
        }
        if (!isNonEmptyEdgeValue(ep.value)) {
          errors.push(err(node.id, "missing_parameter", `edge.${edge.id}.value`,
            `Nhánh IF của "${node.name}": chưa chọn giá trị cho nhánh này.`));
        }
        break;
      }
      default:
        break;
    }

    const valueForSignature = Array.isArray(ep.value)
      ? [...ep.value].map(v => String(v).trim().toUpperCase()).sort().join(",")
      : (ep.value != null ? String(ep.value).trim().toUpperCase() : "");
    if (valueForSignature) {
      const signature = `${node.type}|${String(ep.operator || "").toUpperCase()}|${valueForSignature}`;
      if (seenSignatures.has(signature) && !duplicateReported) {
        errors.push(err(node.id, "invalid_data", "branches",
          `Condition "${node.name}": có ít nhất 2 nhánh IF cấu hình điều kiện giống hệt nhau — một trong hai nhánh sẽ không bao giờ được thực thi.`));
        duplicateReported = true;
      }
      seenSignatures.add(signature);
    }
  });
}

function hasVoucherAction(nodes) {
  return (nodes || []).some(n => VOUCHER_ACTION_TYPES.has(n.type));
}

// BUG FIX: expireDays feeds Integer.parseInt on the BE (DelegateVariableHelper.getInt), which
// silently falls back to a default on a decimal value like "7.5" instead of surfacing an error.
function isPositiveInteger(v) {
  if (!isNumber(v)) return false;
  const n = toNum(v);
  return n > 0 && Number.isInteger(n);
}

function validateAction(node, inDeg, outDeg, props, allNodes, errors) {
  if (inDeg < 1) {
    errors.push(err(node.id, "invalid_connectivity", "in_degree",
      `Action "${node.name}": chưa được nối vào luồng (in-degree = 0).`));
  }
  if (outDeg !== 1) {
    errors.push(err(node.id, "invalid_connectivity", "out_degree",
      `Action "${node.name}": phải có đúng 1 kết nối ra (out-degree = ${outDeg}).`));
  }

  switch (node.type) {
    case "Action_IssueVoucher_Percent": {
      const p = props.discountPercent;
      if (!isNumber(p) || toNum(p) < 1 || toNum(p) > 100) {
        errors.push(err(node.id, "wrong_data_type", "discountPercent",
          `Action "${node.name}": discountPercent phải từ 1–100.`));
      }
      // BUG FIX: maxDiscountAmount<=0 makes the voucher's discount always compute to 0đ (issued
      // but permanently useless); expireDays must be a positive integer (see isPositiveInteger).
      if (!isNumber(props.maxDiscountAmount) || toNum(props.maxDiscountAmount) <= 0) {
        errors.push(err(node.id, "wrong_data_type", "maxDiscountAmount",
          `Action "${node.name}": maxDiscountAmount phải > 0.`));
      }
      if (!isPositiveInteger(props.expireDays)) {
        errors.push(err(node.id, "wrong_data_type", "expireDays",
          `Action "${node.name}": expireDays phải là số nguyên > 0.`));
      }
      break;
    }
    case "Action_IssueVoucher_Fixed":
      if (!isNumber(props.discountAmount) || toNum(props.discountAmount) <= 0) {
        errors.push(err(node.id, "missing_parameter", "discountAmount",
          `Action "${node.name}": discountAmount phải > 0.`));
      }
      if (!isNumber(props.minOrderValue)) {
        errors.push(err(node.id, "missing_parameter", "minOrderValue",
          `Action "${node.name}": minOrderValue là bắt buộc.`));
      }
      if (!isPositiveInteger(props.expireDays)) {
        errors.push(err(node.id, "wrong_data_type", "expireDays",
          `Action "${node.name}": expireDays phải là số nguyên > 0.`));
      }
      break;
    case "Action_IssueVoucher_Freeship":
      // BUG FIX: maxShippingDiscount<=0 makes voucher issuance throw at runtime (caught and
      // only logged BE-side) - the campaign "succeeds" but never actually grants a voucher.
      if (!isNumber(props.maxShippingDiscount) || toNum(props.maxShippingDiscount) <= 0) {
        errors.push(err(node.id, "wrong_data_type", "maxShippingDiscount",
          `Action "${node.name}": maxShippingDiscount phải > 0.`));
      }
      if (!isPositiveInteger(props.expireDays)) {
        errors.push(err(node.id, "wrong_data_type", "expireDays",
          `Action "${node.name}": expireDays phải là số nguyên > 0.`));
      }
      break;
    case "Action_Send_Email":
      if (!hasText(props.templateId) && !hasText(props.rawContent)) {
        errors.push(err(node.id, "missing_parameter", "templateId",
          `Action "${node.name}": cần templateId hoặc rawContent.`));
      }
      if (hasText(props.templateId)) {
        const templateId = String(props.templateId).trim();
        if (!EMAIL_TEMPLATE_CODES.has(templateId)) {
          errors.push(err(node.id, "invalid_data", "templateId",
            `Action "${node.name}": templateId "${templateId}" không tồn tại.`));
        }
        if (templateId === "promotion_voucher_template" && !hasVoucherAction(allNodes)) {
          errors.push(err(node.id, "invalid_data", "templateId",
            `Action "${node.name}": mẫu voucher cần có node Tặng Voucher trong workflow.`));
        }
      }
      break;
    case "Action_Loyalty_Point": {
      const mode = String(props.calculationMode || "FIXED").toUpperCase();
      if (mode !== "ORDER_SPEND" && (!isNumber(props.pointAmount) || toNum(props.pointAmount) === 0)) {
        errors.push(err(node.id, "missing_parameter", "pointAmount",
          `Action "${node.name}": pointAmount phải khác 0 (FIXED).`));
      }
      if (mode === "ORDER_SPEND") {
        const trigger = allNodes.find(n => TRIGGER_TYPES.has(n.type))?.type;
        if (trigger !== "Trigger_Event_OrderSuccess") {
          errors.push(err(node.id, "invalid_data", "calculationMode",
            `Action "${node.name}": ORDER_SPEND cần trigger "Đơn hàng thành công" (có orderAmount).`));
        }
      }
      break;
    }
    case "Action_Upgrade_MemberRank": {
      const tier = String(props.targetTier || "").toUpperCase();
      if (!UPGRADE_TIERS.has(tier)) {
        errors.push(err(node.id, "invalid_data", "targetTier",
          `Action "${node.name}": targetTier phải là SILVER, GOLD hoặc VIP.`));
      }
      break;
    }
    default:
      break;
  }
}

function validateEnd(node, inDeg, outDeg, errors) {
  if (inDeg < 1) {
    errors.push(err(node.id, "invalid_connectivity", "in_degree",
      `End "${node.name}": chưa được nối vào luồng.`));
  }
  if (outDeg !== 0) {
    errors.push(err(node.id, "invalid_connectivity", "out_degree",
      `End "${node.name}": không được có kết nối ra.`));
  }
}

function validateOrphans(nodes, inDegree, outEdges, errors) {
  nodes.forEach(node => {
    if (TRIGGER_TYPES.has(node.type) || node.type === END_TYPE) return;
    const inc = inDegree[node.id] || 0;
    const out = (outEdges[node.id] || []).length;
    if (inc === 0 && out === 0) {
      errors.push(err(node.id, "invalid_connectivity", "connectivity",
        `Node "${node.name}" bị mồ côi — không có kết nối vào/ra.`));
    }
  });
}

function validateReachability(nodes, outEdges, errors) {
  nodes.forEach(node => {
    const out = (outEdges[node.id] || []).length;
    if (out === 0 && node.type !== END_TYPE) {
      errors.push(err(node.id, "invalid_connectivity", "reachability",
        `Node "${node.name}" là điểm cuối nhưng không phải End Event.`));
    }
  });
}

function validateNoCycles(nodes, outEdges, nodeMap, errors) {
  const visited = new Set();
  const stack = new Set();
  let cyclePath = null;

  function dfs(id, path) {
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const e of outEdges[id] || []) {
      const tgt = e.target || e.to;
      if (!visited.has(tgt)) {
        if (dfs(tgt, path)) return true;
      } else if (stack.has(tgt)) {
        const start = path.indexOf(tgt);
        const loop = path.slice(start);
        const hasWait = loop.some(nid => {
          const t = nodeMap[nid]?.type || "";
          return t.includes("Timer") || t.includes("Action_Send_");
        });
        if (!hasWait) {
          cyclePath = [...loop, tgt];
          return true;
        }
      }
    }
    path.pop();
    stack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && dfs(n.id, [])) break;
  }
  if (cyclePath) {
    errors.push(globalErr("invalid_connectivity", "cycle",
      `Phát hiện vòng lặp vô hạn: ${cyclePath.join(" → ")}.`));
  }
}

/** Client-side validation — mirror BE WorkflowValidatorService */
export function findClientValidationErrors(nodes, edges, meta = {}) {
  const errors = [];
  if (!nodes?.length || !edges?.length) {
    errors.push(globalErr("missing_parameter", "graph", "Graph thiếu nodes hoặc edges."));
    return errors;
  }

  if (workflowRequiresBudget(nodes)) {
    const raw = meta?.totalBudget;
    const pool = raw !== "" && raw != null ? Number(raw) : 0;
    if (!Number.isFinite(pool) || pool <= 0) {
      errors.push(globalErr("missing_parameter", "meta.totalBudget",
        "Workflow có Tặng Voucher — cần thiết lập Quỹ ngân sách trên thanh công cụ editor."));
    } else {
      const minPool = estimateMinimumPool(nodes);
      if (minPool > 0 && pool < minPool) {
        errors.push(globalErr("invalid_data", "meta.totalBudget",
          `Quỹ ngân sách (${pool.toLocaleString("vi-VN")} VNĐ) nên ≥ tổng trừ/lượt phát (${minPool.toLocaleString("vi-VN")} VNĐ).`));
      }
    }
  }

  const { nodeMap, inDegree, outEdges } = buildAdjacency(nodes, edges);

  nodes.forEach(node => {
    if (!ALL_KNOWN.has(node.type) && !NODE_TYPES[node.type]) {
      errors.push(err(node.id, "invalid_connectivity", "type",
        `Node "${node.name}": kiểu "${node.type}" không hợp lệ.`));
    }
  });

  const triggers = nodes.filter(n => TRIGGER_TYPES.has(n.type));
  if (!triggers.length) {
    errors.push(globalErr("missing_parameter", "trigger", "Thiếu node Trigger (Start)."));
  } else if (triggers.length > 1) {
    errors.push(globalErr("invalid_connectivity", "trigger", `Chỉ được 1 Trigger, hiện có ${triggers.length}.`));
  }

  if (!nodes.some(n => n.type === END_TYPE)) {
    errors.push(globalErr("missing_parameter", "end_event", "Thiếu node End Event."));
  }

  nodes.forEach(node => {
    const inc = inDegree[node.id] || 0;
    const outs = outEdges[node.id] || [];
    const props = node.properties || {};

    if (TRIGGER_TYPES.has(node.type)) validateTrigger(node, inc, outs.length, props, errors);
    else if (CONDITION_TYPES.has(node.type)) validateCondition(node, inc, outs, props, errors);
    else if (ACTION_TYPES.has(node.type)) validateAction(node, inc, outs.length, props, nodes, errors);
    else if (node.type === END_TYPE) validateEnd(node, inc, outs.length, errors);
  });

  validateOrphans(nodes, inDegree, outEdges, errors);
  validateNoCycles(nodes, outEdges, nodeMap, errors);
  validateReachability(nodes, outEdges, errors);

  return errors;
}

export function getErrorNodeIds(errors) {
  return new Set((errors || []).map(e => e.nodeId).filter(Boolean));
}

export function mergeValidationResults(clientErrors, serverResult) {
  const serverErrors = serverResult?.errors || [];
  const seen = new Set();
  const merged = [];
  [...clientErrors, ...serverErrors].forEach(e => {
    const key = `${e.nodeId || ""}|${e.errorType}|${e.field}|${e.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(e);
  });
  const valid = merged.length === 0;
  return {
    valid,
    errors: merged,
    summary: valid
      ? "✅ Workflow hợp lệ — sẵn sàng triển khai."
      : `❌ ${merged.length} lỗi cần sửa trước khi deploy.`
  };
}
