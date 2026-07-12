import { NODE_TYPES } from "../constants.js";
import { createDefaultBranchProps } from "./expression.js";

function isConditionNode(nodes, id) {
  const n = nodes.find(x => x.id === id);
  return n && NODE_TYPES[n.type]?.cat === "condition";
}

/**
 * Mỗi condition bắt buộc:
 * - ≥1 nhánh IF (isDefault: false) có expression
 * - đúng 1 nhánh Else (isDefault: true) — fallback "còn lại"
 */
export function ensureConditionBranches(nodes, edges) {
  let next = [...edges];
  const condNodes = nodes.filter(n => NODE_TYPES[n.type]?.cat === "condition");

  condNodes.forEach(cn => {
    const outs = next.filter(e => e.source === cn.id);
    const ifEdges = outs.filter(e => !e.isDefault);
    let elseEdge = outs.find(e => e.isDefault);

    if (!ifEdges.length) {
      const downstream = elseEdge?.target || "end";
      next.push({
        id: `edge_${cn.id}_if_auto`,
        source: cn.id,
        target: downstream,
        isDefault: false,
        properties: createDefaultBranchProps(cn.type)
      });
    }

    if (!elseEdge) {
      next.push({
        id: `edge_${cn.id}_else_auto`,
        source: cn.id,
        target: "end",
        isDefault: true,
        properties: {}
      });
    } else if (elseEdge.properties?.expression) {
      next = next.map(e =>
        e.id === elseEdge.id
          ? { ...e, properties: {} }
          : e
      );
    }
  });

  return next;
}

/** Gỡ edge trùng source+target+isDefault */
export function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter(e => {
    const k = `${e.source}|${e.target}|${e.isDefault ? 1 : 0}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Sau xóa node: nối 1 cầu, giữ isDefault/expression của nhánh vào */
export function bridgeAfterDelete(edges, nodes, deletedId) {
  const inc = edges.find(e => e.target === deletedId);
  const outs = edges.filter(e => e.source === deletedId);
  let next = edges.filter(e => e.source !== deletedId && e.target !== deletedId);

  if (!inc || !outs.length) return ensureConditionBranches(nodes, dedupeEdges(next));

  const bridgeTarget = outs.find(e => !e.isDefault)?.target
    ?? outs.find(e => e.isDefault)?.target
    ?? outs[0].target;

  const parentId = inc.source;
  const parentIsCond = isConditionNode(nodes, parentId);

  if (parentIsCond) {
    const siblingSameBranch = next.find(
      e => e.source === parentId
        && e.isDefault === inc.isDefault
        && e.target === bridgeTarget
    );
    if (!siblingSameBranch) {
      next.push({
        id: `edge_${parentId}_to_${bridgeTarget}_br_${Date.now()}`,
        source: parentId,
        target: bridgeTarget,
        isDefault: inc.isDefault,
        properties: { ...(inc.properties || {}) }
      });
    }
  } else {
    if (!next.some(e => e.source === parentId && e.target === bridgeTarget)) {
      next.push({
        id: `edge_${parentId}_to_${bridgeTarget}_br_${Date.now()}`,
        source: parentId,
        target: bridgeTarget,
        isDefault: inc.isDefault,
        properties: { ...(inc.properties || {}) }
      });
    }
  }

  return ensureConditionBranches(nodes, dedupeEdges(next));
}
