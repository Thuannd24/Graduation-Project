import { NODE_TYPES } from "../constants.js";

export const BRANCH_COL = 2;

/** Cột trái / giữa / phải trên canvas */
export function colSide(col) {
  if (col < 0) return "left";
  if (col > 0) return "right";
  return "center";
}

export function isEmptyWorkflow(nodes, edges) {
  return nodes.length === 2
    && edges.length === 1
    && edges[0].source === "start"
    && edges[0].target === "end";
}

export function isConditionNode(node) {
  return node && NODE_TYPES[node.type]?.cat === "condition";
}

/** Có phải nhánh IF/Else trùng target (chỉ vẽ 1 line) */
export function isDuplicateBranchEdge(edge, edges) {
  if (edge.isDefault) return false;
  return edges.some(
    e => e.id !== edge.id
      && e.source === edge.source
      && e.target === edge.target
      && e.isDefault
  );
}

/** Luồng chính IF → end */
export function findMainEdgeToEnd(edges) {
  let curr = "start";
  const seen = new Set();
  while (curr && curr !== "end" && !seen.has(curr)) {
    seen.add(curr);
    const outs = edges.filter(e => e.source === curr);
    if (!outs.length) break;
    const next = outs.find(e => !e.isDefault) || outs[0];
    if (next.target === "end") return next;
    curr = next.target;
  }
  return edges.find(e => e.target === "end" && !e.isDefault)
    || edges.find(e => e.target === "end");
}

/** Tìm condition cha gần nhất trên spine */
export function findParentCondition(nodeId, nodes, edges) {
  const inc = edges.find(e => e.target === nodeId);
  if (!inc) return null;
  const parent = nodes.find(n => n.id === inc.source);
  if (isConditionNode(parent)) return parent;
  return null;
}

/**
 * Orthogonal path — căn giữa, nhánh trái/phải, merge về spine.
 * branchSide: 'left' | 'right' | 'center' | null
 */
export function buildEdgePath(sx, sy, ex, ey, opts = {}) {
  const { branchSide, mergeY, isSpine } = opts;

  if (Math.abs(sx - ex) < 8 && Math.abs(sy - ey) < 8) {
    return `M ${sx} ${sy} L ${ex} ${ey}`;
  }

  // Thẳng đứng thuần (spine) — ưu tiên
  if (Math.abs(sx - ex) < 16) {
    return `M ${sx} ${sy} L ${ex} ${ey}`;
  }

  // Spine elbow: xuống giữa rồi ngang (1 góc)
  if (isSpine) {
    const midY = sy + (ey - sy) * 0.5;
    if (Math.abs(sx - ex) < 16) return `M ${sx} ${sy} L ${ex} ${ey}`;
    return `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
  }

  // Nhánh → merge: xuống tới mergeY, ngang về center
  if (mergeY != null) {
    return `M ${sx} ${sy} L ${sx} ${mergeY} L ${ex} ${mergeY}`;
  }

  // Nhánh condition → con
  if (branchSide === "left" || branchSide === "right") {
    if (Math.abs(sx - ex) < 20) return `M ${sx} ${sy} L ${ex} ${ey}`;
    const turnY = sy + Math.max(16, (ey - sy) * 0.35);
    return `M ${sx} ${sy} L ${sx} ${turnY} L ${ex} ${turnY} L ${ex} ${ey}`;
  }

  const midY = (sy + ey) / 2;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
}

export function getEdgeMidpoint(sx, sy, ex, ey, opts = {}) {
  const { branchSide, mergeY } = opts;
  if (Math.abs(sx - ex) < 16) {
    return { mx: (sx + ex) / 2, my: (sy + ey) / 2 };
  }
  if (branchSide === "left" || branchSide === "right") {
    const turnY = sy + Math.max(20, (ey - sy) * 0.35);
    return { mx: (sx + ex) / 2, my: turnY };
  }
  if (mergeY != null) {
    return { mx: (sx + ex) / 2, my: mergeY };
  }
  const midY = (sy + ey) / 2;
  return { mx: (sx + ex) / 2, my: midY };
}
