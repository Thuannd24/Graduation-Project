import { NODE_TYPES } from "../constants.js";

function nodeEl(id) {
  return document.getElementById("cb-node-" + id);
}

function forkPlusEl(edgeId) {
  return document.getElementById("cb-fork-plus-" + edgeId);
}

function forkMergeEl(nodeId) {
  return document.getElementById("cb-fork-merge-" + nodeId);
}

function forkLabelEl(nodeId, side) {
  return document.getElementById(`cb-fork-label-${nodeId}-${side}`);
}

function rect(el, canvasEl) {
  const r = el.getBoundingClientRect();
  const c = canvasEl.getBoundingClientRect();
  return {
    cx: r.left - c.left + r.width / 2,
    cy: r.top - c.top + r.height / 2,
    bottom: r.bottom - c.top,
    top: r.top - c.top
  };
}

export function getBranchChildAnchors(edge, canvasEl) {
  if (!canvasEl || !edge) return null;
  const side = edge.isDefault ? "right" : "left";
  const labelEl = forkLabelEl(edge.source, side);
  const plusEl = forkPlusEl(edge.id);
  const tEl = nodeEl(edge.target);
  if (!labelEl || !tEl) return null;

  const lr = rect(labelEl, canvasEl);
  const tr = rect(tEl, canvasEl);
  const pr = plusEl ? rect(plusEl, canvasEl) : null;

  return {
    sx: lr.cx,
    sy: pr ? pr.bottom : lr.bottom,
    ex: tr.cx,
    ey: tr.top
  };
}

export function computeEdgeAnchors(edge, nodes, edges, canvasEl, columns = {}) {
  if (!canvasEl) return null;

  const sEl = nodeEl(edge.source);
  const tEl = nodeEl(edge.target);
  if (!sEl || !tEl) return null;

  const sr = rect(sEl, canvasEl);
  const tr = rect(tEl, canvasEl);
  const srcCol = columns[edge.source] ?? 0;
  const tgtCol = columns[edge.target] ?? 0;

  return {
    sx: sr.cx,
    sy: sr.bottom,
    ex: tr.cx,
    ey: tr.top,
    branchSide: null,
    mergeY: null,
    isConditionOut: false,
    isSpine: srcCol === 0 && tgtCol === 0,
    sourceNode: nodes.find(n => n.id === edge.source),
    targetNode: nodes.find(n => n.id === edge.target)
  };
}

export function getInsertAnchor(edge, canvasEl) {
  if (!canvasEl || !edge) return null;

  const plusEl = forkPlusEl(edge.id);
  if (plusEl) {
    const pr = rect(plusEl, canvasEl);
    return { x: pr.cx, y: pr.bottom };
  }

  const dropEl = document.getElementById("cb-drop-" + edge.id);
  if (dropEl) {
    const dr = rect(dropEl, canvasEl);
    return { x: dr.cx, y: dr.bottom };
  }

  const sEl = nodeEl(edge.source);
  const tEl = nodeEl(edge.target);
  if (!sEl || !tEl) return null;
  const sr = rect(sEl, canvasEl);
  const tr = rect(tEl, canvasEl);
  return { x: (sr.cx + tr.cx) / 2, y: (sr.bottom + tr.top) / 2 };
}

export function getForkRailAnchors(nodeId, canvasEl, columns = {}) {
  const mergeEl = forkMergeEl(nodeId);
  const leftLabel = forkLabelEl(nodeId, "left");
  const rightLabel = forkLabelEl(nodeId, "right");
  const condEl = nodeEl(nodeId);
  if (!mergeEl || !condEl || !leftLabel || !rightLabel) return null;

  const cr = rect(condEl, canvasEl);
  const mr = rect(mergeEl, canvasEl);
  const lr = rect(leftLabel, canvasEl);
  const rr = rect(rightLabel, canvasEl);
  const condCol = columns[nodeId] ?? 0;

  if (condCol !== 0) {
    return {
      splitY: Math.min(lr.top, rr.top) - 2,
      mergeY: mr.cy,
      mergeBottom: mr.bottom,
      centerX: cr.cx,
      leftX: lr.cx,
      rightX: rr.cx,
      condBottom: cr.bottom
    };
  }

  return {
    splitY: lr.top - 2,
    mergeY: mr.cy,
    mergeBottom: mr.bottom,
    centerX: mr.cx,
    leftX: lr.cx,
    rightX: rr.cx,
    condBottom: cr.bottom
  };
}

export function getMergeStemAnchors(conditionId, targetId, canvasEl) {
  const mergeEl = forkMergeEl(conditionId);
  const tEl = nodeEl(targetId);
  if (!mergeEl || !tEl) return null;
  const mr = rect(mergeEl, canvasEl);
  const tr = rect(tEl, canvasEl);
  return {
    cx: mr.cx,
    mergeBottom: mr.bottom,
    targetCx: tr.cx,
    targetTop: tr.top
  };
}
