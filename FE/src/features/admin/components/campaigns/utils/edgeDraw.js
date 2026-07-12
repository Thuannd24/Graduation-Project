import { NODE_TYPES } from "../constants.js";
import { isDuplicateBranchEdge } from "./edgeRouting.js";

function isConditionNode(nodes, id) {
  const n = nodes.find(x => x.id === id);
  return n && NODE_TYPES[n.type]?.cat === "condition";
}

function findParentCondition(nodeId, nodes, edges) {
  const inc = edges.find(e => e.target === nodeId);
  if (!inc) return null;
  if (isConditionNode(nodes, inc.source)) return inc.source;
  const parent = nodes.find(n => n.id === inc.source);
  if (parent && parent.id !== "start") return findParentCondition(parent.id, nodes, edges);
  return null;
}

/** Chỉ coi là "có node trên nhánh" khi target nằm cột trái/phải — KHÔNG tính spine (col 0) */
export function branchSideHasContent(conditionId, side, edges, nodes, columns) {
  const edge = edges.find(e =>
    e.source === conditionId && (side === "left" ? !e.isDefault : e.isDefault)
  );
  if (!edge || edge.target === "end") return false;
  const tgtCol = columns[edge.target] ?? 0;
  if (tgtCol === 0) return false;
  return nodes.some(n => n.id === edge.target);
}

export function conditionHasBranchContent(conditionId, edges, nodes, columns) {
  return edges.some(e => {
    if (e.source !== conditionId || e.target === "end") return false;
    return (columns[e.target] ?? 0) !== 0 && nodes.some(n => n.id === e.target);
  });
}

/** Chỉ vẽ edge spine thuần — fork / merge / nhánh lo hết */
export function shouldDrawEdge(edge, nodes, edges, columns) {
  if (isDuplicateBranchEdge(edge, edges)) return false;

  const src = nodes.find(n => n.id === edge.source);
  const tgt = nodes.find(n => n.id === edge.target);
  if (!src || !tgt) return false;

  // Mọi edge ra từ condition: fork + merge stem + branch pass lo
  if (isConditionNode(nodes, edge.source)) return false;

  const srcCol = columns[edge.source] ?? 0;

  // Action trên nhánh → end: branchToMerge lo
  if (srcCol !== 0 && edge.target === "end") {
    if (findParentCondition(edge.source, nodes, edges)) return false;
  }

  // Action spine sau condition (merge stem đã nối)
  if (srcCol === 0 && edge.target === "end" && src.id !== "start") {
    const inc = edges.find(e => e.target === edge.source);
    if (inc && isConditionNode(nodes, inc.source)) return false;
  }

  return true;
}

/** Fork side condition: merge về spine cha hoặc end */
export function getMergeStemTarget(conditionId, nodes, edges, columns) {
  const outgoing = edges.filter(e => e.source === conditionId);
  if (!outgoing.length) return null;

  const condCol = columns[conditionId] ?? 0;

  const spineTargets = outgoing
    .map(e => ({ id: e.target, col: columns[e.target] ?? 0, isDefault: e.isDefault }))
    .filter(t => t.id === "end" || t.col === 0);

  if (spineTargets.length) {
    const nonEnd = spineTargets.filter(t => t.id !== "end");
    if (nonEnd.length) {
      const preferIf = nonEnd.find(t => !outgoing.find(e => e.target === t.id)?.isDefault);
      return (preferIf || nonEnd[0]).id;
    }
    return "end";
  }

  if (condCol !== 0) return "end";
  return "end";
}

/** Fork: 1 path liền mạch — cond↓ T-bar ↓merge bar */
export function buildForkBracketPath(rail, opts = {}) {
  const { leftFilled = false, rightFilled = false } = opts;
  const { centerX, condBottom, splitY, leftX, rightX, mergeY } = rail;

  const parts = [
    `M ${centerX} ${condBottom} L ${centerX} ${splitY}`,
    `M ${leftX} ${splitY} L ${rightX} ${splitY}`
  ];

  if (!leftFilled) parts.push(`M ${leftX} ${splitY} L ${leftX} ${mergeY}`);
  if (!rightFilled) parts.push(`M ${rightX} ${splitY} L ${rightX} ${mergeY}`);
  parts.push(`M ${leftX} ${mergeY} L ${rightX} ${mergeY}`);

  return parts.join(" ");
}

export function getConditionMergePlacements(nodes, edges, levels, columns) {
  const byLevel = {};
  nodes
    .filter(n => NODE_TYPES[n.type]?.cat === "condition")
    .forEach(cn => {
      const branchTargets = edges
        .filter(e => e.source === cn.id && e.target !== "end")
        .filter(e => (columns[e.target] ?? 0) !== 0)
        .map(e => e.target);
      if (!branchTargets.length) return;
      const maxLvl = Math.max(...branchTargets.map(t => levels[t] ?? 0));
      if (!byLevel[maxLvl]) byLevel[maxLvl] = [];
      byLevel[maxLvl].push(cn.id);
    });
  return byLevel;
}

export function buildMergeStemPath(cx, mergeBottom, targetTop, targetCx) {
  if (Math.abs(cx - targetCx) < 8) {
    return `M ${cx} ${mergeBottom} L ${targetCx} ${targetTop}`;
  }
  const midY = mergeBottom + (targetTop - mergeBottom) * 0.5;
  return `M ${cx} ${mergeBottom} L ${cx} ${midY} L ${targetCx} ${midY} L ${targetCx} ${targetTop}`;
}

export function buildBranchToChildPath(sx, sy, ex, ey) {
  if (Math.abs(sx - ex) < 12) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const midY = sy + (ey - sy) * 0.5;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
}

export function buildBranchToMergePath(sx, sy, mergeCx, mergeY) {
  if (Math.abs(sx - mergeCx) < 8) return `M ${sx} ${sy} L ${mergeCx} ${mergeY}`;
  return `M ${sx} ${sy} L ${sx} ${mergeY} L ${mergeCx} ${mergeY}`;
}

export { findParentCondition };
