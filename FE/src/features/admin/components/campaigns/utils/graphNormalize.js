import { NODE_TYPES } from "../constants.js";
import { createDefaultBranchProps } from "./expression.js";
import { nextCounter } from "../nodeCounter.js";
import { resolveBranchStructure } from "./branchStructure.js";

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

/**
 * Sau khi xóa 1 node/nhánh: mọi node không còn đường nào từ "start" tới nữa (vd: nội dung bên
 * trong nhánh Sai của 1 condition vừa bị xóa, trong khi bridgeAfterDelete chỉ giữ lại 1 nhánh
 * làm cầu nối) đều là "con mồ côi" - phải dọn theo cha, không được bỏ sót lại trên sơ đồ.
 * Một node được dùng chung ở nơi khác (còn đường vào khác) thì vẫn giữ nguyên.
 */
export function pruneUnreachable(nodes, edges) {
  const reachable = new Set(["start"]);
  const queue = ["start"];
  while (queue.length) {
    const cur = queue.shift();
    edges.forEach(e => {
      if (e.source === cur && !reachable.has(e.target)) {
        reachable.add(e.target);
        queue.push(e.target);
      }
    });
  }
  return {
    nodes: nodes.filter(n => reachable.has(n.id)),
    edges: edges.filter(e => reachable.has(e.source) && reachable.has(e.target))
  };
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

/**
 * Sau xóa node: nối cầu cho MỌI edge trỏ vào node bị xóa (không chỉ cái đầu tiên) - một node
 * là điểm hội tụ (2+ nhánh cùng dẫn vào) vẫn phải được bắc cầu đầy đủ cho từng nhánh, nếu
 * không các nhánh còn lại sẽ bị treo (mất đường ra), khiến sơ đồ vẽ lệch/sai sau khi xóa.
 *
 * Xóa một CONDITION (2+ nhánh) không được "thăng cấp" 1 nhánh làm cầu nối - cả 2 nhánh (Đúng
 * và Sai) đều thuộc về condition đó, xóa cha thì toàn bộ nội dung riêng của cả 2 nhánh phải
 * biến mất cùng, không được để 1 nhánh sống sót. Bắc cầu thẳng tới điểm hội tụ thật của
 * condition (nơi cả 2 nhánh vốn dĩ sẽ gặp lại nhau) để pruneUnreachable dọn sạch toàn bộ.
 */
export function bridgeAfterDelete(edges, nodes, deletedId) {
  const incs = edges.filter(e => e.target === deletedId);
  const outs = edges.filter(e => e.source === deletedId);
  let next = edges.filter(e => e.source !== deletedId && e.target !== deletedId);

  if (!incs.length || !outs.length) return ensureConditionBranches(nodes, dedupeEdges(next));

  const isDeletedCond = isConditionNode(nodes, deletedId);
  const bridgeTarget = isDeletedCond && outs.length > 1
    ? resolveBranchStructure(nodes, edges).get(deletedId)?.joinNode
      ?? outs.find(e => !e.isDefault)?.target
      ?? outs.find(e => e.isDefault)?.target
      ?? outs[0].target
    : outs.find(e => !e.isDefault)?.target
      ?? outs.find(e => e.isDefault)?.target
      ?? outs[0].target;

  incs.forEach(inc => {
    const parentId = inc.source;
    const parentIsCond = isConditionNode(nodes, parentId);

    const alreadyBridged = parentIsCond
      ? next.some(e => e.source === parentId && e.isDefault === inc.isDefault && e.target === bridgeTarget)
      : next.some(e => e.source === parentId && e.target === bridgeTarget);

    if (!alreadyBridged) {
      next.push({
        id: `edge_${parentId}_to_${bridgeTarget}_br_${Date.now()}_${nextCounter()}`,
        source: parentId,
        target: bridgeTarget,
        isDefault: parentIsCond ? inc.isDefault : false,
        properties: { ...(inc.properties || {}) }
      });
    }
  });

  return ensureConditionBranches(nodes, dedupeEdges(next));
}
