import { NODE_TYPES } from "../constants.js";
import { isEmptyWorkflow } from "../utils/edgeRouting.js";

console.log("%c[flowLayout] build marker: STRAIGHTEN-FIX-v1", "color:#fff;background:#7c3aed;padding:2px 6px;border-radius:4px;font-weight:bold");

/**
 * nodeOrigin=[0.5,0] → position.x là tâm ngang của node.
 * NODE_W phải khớp với width thật của .cb-rf-node trong campaign-builder.css,
 * nếu không các cột nhánh sẽ chồng lên nhau (offset < nửa bề rộng node).
 */
export const FLOW = {
  SPINE_X: 400,
  BRANCH_OFFSET: 200,
  BRANCH_OFFSET_LOCAL: 180,
  Y_STEP: 160,
  NODE_H: 72,
  NODE_W: 280,
  TAG_W: 80,
  MERGE_SIZE: 8,
  FORK_GAP: 8,
  TAG_DROP: 28,
  LANE_STEP: 100
};

function isCondition(nodes, id) {
  const n = nodes.find(x => x.id === id);
  return n && NODE_TYPES[n.type]?.cat === "condition";
}

function getCondEdges(edges, condId) {
  return {
    ifEdge: edges.find(e => e.source === condId && !e.isDefault),
    elseEdge: edges.find(e => e.source === condId && e.isDefault)
  };
}

function colOf(id, columns) {
  if (id === "end") return 0;
  return columns[id] ?? 0;
}

function spineX(id, columns) {
  return FLOW.SPINE_X + colOf(id, columns) * FLOW.BRANCH_OFFSET;
}

// A node with 2+ incoming edges is a reconvergence point, not simply nested one level down -
// e.g. a condition chained in right after another condition's merge (both branches lead to
// it) has no parent, even though a direct edge from that condition reaches it.
function findParentConditionId(nodeId, nodes, edges) {
  let curr = nodeId;
  const seen = new Set();
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    const incs = edges.filter(e => e.target === curr);
    if (incs.length !== 1) return null;
    const inc = incs[0];
    if (isCondition(nodes, inc.source)) return inc.source;
    curr = inc.source;
  }
  return null;
}

function findParentConditionMergeId(nodeId, nodes, edges) {
  const p = findParentConditionId(nodeId, nodes, edges);
  return p ? `${p}__merge` : null;
}

function conditionDepth(cid, nodes, edges) {
  let d = 0;
  let p = findParentConditionId(cid, nodes, edges);
  while (p) {
    d++;
    p = findParentConditionId(p, nodes, edges);
  }
  return d;
}

// Walks one branch through plain action nodes until "end"/a condition/a dead-end.
function branchPath(edge, nodes, edges, maxSteps = 50) {
  const path = [];
  if (!edge) return path;
  let cur = edge.target;
  const seen = new Set();
  let steps = 0;
  while (cur && !seen.has(cur) && steps < maxSteps) {
    path.push(cur);
    seen.add(cur);
    steps++;
    if (cur === "end" || isCondition(nodes, cur)) break;
    const next = edges.find(e => e.source === cur);
    if (!next) break;
    cur = next.target;
  }
  return path;
}

function mergeSpineTarget(condId, nodes, edges, columns) {
  const parentMerge = findParentConditionMergeId(condId, nodes, edges);
  if (parentMerge) return parentMerge;

  const { ifEdge, elseEdge } = getCondEdges(edges, condId);
  const outs = [ifEdge, elseEdge].filter(Boolean);

  // Shallowest node both branches reconverge on, however they get there - checked before the
  // column-based fallback below, which can't see reconvergence through intermediate nodes.
  if (outs.length === 2) {
    const pathA = branchPath(outs[0], nodes, edges);
    const setB = new Set(branchPath(outs[1], nodes, edges));
    const common = pathA.find(t => setB.has(t));
    if (common) return common;
  }

  const spine = outs
    .map(e => e.target)
    .filter(t => t === "end" || colOf(t, columns) === 0);
  const nonEnd = spine.filter(t => t !== "end");
  if (nonEnd.length) {
    const prefer = nonEnd.find(t => outs.find(e => e.target === t && !e.isDefault));
    return prefer || nonEnd[0];
  }
  return "end";
}

// Real wfEdges to relink when inserting right after a condition's merge - every branch's true
// terminal edge(s) reaching outTarget, however deep (through actions/nested conditions).
function collectRealExitEdges(condId, outTarget, nodes, edges, memo) {
  const key = condId + "|" + outTarget;
  if (memo.has(key)) return memo.get(key);
memo.set(key, []); // guard against pathological cycles while resolving
  const { ifEdge, elseEdge } = getCondEdges(edges, condId);
  const result = [];

  const walkFrom = edge => {
    if (!edge) return;
    if (edge.target === outTarget) {
      result.push(edge.id);
      return;
    }
    if (edge.target === "end" || isCondition(nodes, edge.target)) {
      if (isCondition(nodes, edge.target)) {
        result.push(...collectRealExitEdges(edge.target, outTarget, nodes, edges, memo));
      }
      return;
    }
    let cur = edge.target;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const outs = edges.filter(e => e.source === cur);
      let advanced = false;
      outs.forEach(e => {
        if (e.target === outTarget) result.push(e.id);
        else if (isCondition(nodes, e.target)) result.push(...collectRealExitEdges(e.target, outTarget, nodes, edges, memo));
        else if (e.target !== "end") { cur = e.target; advanced = true; }
      });
      if (!advanced) break;
    }
  };

  walkFrom(ifEdge);
  walkFrom(elseEdge);
  memo.set(key, result);
  return result;
}

function subtreeMaxBottom(rootId, nodes, edges, columns, positions, memo = new Map()) {
  if (!rootId || rootId === "end") return 0;
  if (memo.has(rootId)) return memo.get(rootId);

  const pos = positions[rootId];
  let bottom = (pos?.y ?? 0) + FLOW.NODE_H;

  if (isCondition(nodes, rootId)) {
    const { ifEdge, elseEdge } = getCondEdges(edges, rootId);
    [ifEdge, elseEdge].forEach(e => {
      if (e?.target && e.target !== "end") {
        bottom = Math.max(bottom, subtreeMaxBottom(e.target, nodes, edges, columns, positions, memo) + 140);
      }
    });
    // Fallback height must match computeMergeY's minimum (own fork/tag/merge visuals), not a
    // fixed guess - otherwise a parent condition's merge row can sit above this one's.
    bottom = Math.max(
      bottom,
      (pos?.y ?? 0) + FLOW.NODE_H + FLOW.FORK_GAP + FLOW.TAG_DROP + 56
    );
  } else {
    edges.filter(e => e.source === rootId).forEach(e => {
      if (e.target !== "end") {
        bottom = Math.max(bottom, subtreeMaxBottom(e.target, nodes, edges, columns, positions, memo));
      }
    });
  }

  memo.set(rootId, bottom);
  return bottom;
}

function subtreeColBounds(rootId, nodes, edges, columns, memo = new Map()) {
  if (!rootId || rootId === "end") return null;
  if (memo.has(rootId)) return memo.get(rootId);
  let minC = colOf(rootId, columns);
  let maxC = minC;
  const walk = id => {
    if (!id || id === "end") return;
    const c = colOf(id, columns);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
    if (isCondition(nodes, id)) {
      const { ifEdge, elseEdge } = getCondEdges(edges, id);
      [ifEdge, elseEdge].forEach(e => e?.target && walk(e.target));
    } else {
      edges.filter(e => e.source === id).forEach(e => walk(e.target));
    }
  };
  walk(rootId);
  const bounds = { minC, maxC };
  memo.set(rootId, bounds);
  return bounds;
}

function defaultSideOffset(depth, cc) {
  const base = cc === 0 ? FLOW.BRANCH_OFFSET : FLOW.BRANCH_OFFSET_LOCAL;
  return base + depth * FLOW.LANE_STEP;
}

/** Orthogonal path — railY cố định cho mọi nhánh gom về merge */
export function branchRailPath(sourceX, sourceY, targetX, targetY, railY) {
  if (Math.abs(sourceX - targetX) < 6) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }
  const lo = Math.min(sourceY, targetY);
  const hi = Math.max(sourceY, targetY);
  const fallback = sourceY + Math.min(Math.max(36, (targetY - sourceY) * 0.4), targetY - sourceY - 12);
  // Clamp: a bad railY must never bend past the target and double back.
  const y = railY != null ? Math.min(Math.max(railY, lo), hi) : fallback;
  return `M ${sourceX} ${sourceY} L ${sourceX} ${y} L ${targetX} ${y} L ${targetX} ${targetY}`;
}

function mergeNodeX(targetId, columns) {
  if (targetId === "end") return FLOW.SPINE_X;
  if (String(targetId).includes("__merge")) {
    const cid = String(targetId).replace("__merge", "");
    return spineX(cid, columns);
  }
  return
spineX(targetId, columns);
}

function computeMergeY(condId, nodes, edges, columns, positions) {
  const pos = positions[condId];
  const condBottom = pos.y + FLOW.NODE_H;
  const tagY = condBottom + FLOW.FORK_GAP + FLOW.TAG_DROP;
  const base = tagY + 56;
  const { ifEdge, elseEdge } = getCondEdges(edges, condId);
  let maxY = base;
  [ifEdge, elseEdge].forEach(e => {
    if (e?.target && e.target !== "end") {
      // Must match subtreeMaxBottom's own clearance below, else merge rails overlap.
      maxY = Math.max(maxY, subtreeMaxBottom(e.target, nodes, edges, columns, positions) + 140);
    }
  });
  return maxY;
}

function resolveLaneX(preferredX, usedLanes, side) {
  let x = preferredX;
  const step = FLOW.LANE_STEP;
  const dir = side === "left" ? -1 : 1;
  while (usedLanes.some(u => Math.abs(u - x) < step * 0.85)) {
    x += dir * step;
  }
  usedLanes.push(x);
  return x;
}

// When both branches of a condition converge directly on the same real node, that node drifts
// to whichever column computeLayout assigned its first-processed incoming edge - center it on
// the condition's own X instead, since both paths lead there symmetrically. A single-branch
// case (other side empty) is left at its own offset column - that asymmetry is the point, it
// keeps the nested content visually clear of the other branch's bypass rail.
function straightenSingleActiveBranches(wfNodes, wfEdges, positions) {
  const conditionIds = wfNodes
    .filter(n => NODE_TYPES[n.type]?.cat === "condition")
    .map(n => n.id)
    .sort((a, b) => positions[a].y - positions[b].y);

  conditionIds.forEach(cid => {
    const { ifEdge, elseEdge } = getCondEdges(wfEdges, cid);
    const ifTrivial = !ifEdge || ifEdge.target === "end";
    const elseTrivial = !elseEdge || elseEdge.target === "end";
    if (ifTrivial || elseTrivial || !ifEdge || !elseEdge) return;

    const pathA = branchPath(ifEdge, wfNodes, wfEdges);
    const setB = new Set(branchPath(elseEdge, wfNodes, wfEdges));
    const chainStart = pathA.find(t => t !== "end" && setB.has(t));
    if (!chainStart) return;

    let cur = chainStart;
    const seen = new Set();
    while (cur && cur !== "end" && positions[cur] && !seen.has(cur)) {
      seen.add(cur);
      positions[cur].x = positions[cid].x;
      if (isCondition(wfNodes, cur)) break;
      const next = wfEdges.find(e => e.source === cur);
      cur = next?.target;
    }
  });
}

function buildConditionMeta(wfNodes, wfEdges, columns, levels, positions) {
  const conditionIds = wfNodes
    .filter(n => NODE_TYPES[n.type]?.cat === "condition")
    .map(n => n.id);

  const meta = {};
  const usedLeft = [];
  const usedRight = [];

  conditionIds
    .slice()
    .sort((a, b) => (levels[a] ?? 0) - (levels[b] ?? 0))
    .forEach(cid => {
      const cc = colOf(cid, columns);
      const cx = positions[cid].x; // reflects straightenSingleActiveBranches, not raw spineX
      const depth = conditionDepth(cid, wfNodes, wfEdges);
      const { ifEdge, elseEdge } = getCondEdges(wfEdges, cid);
      const off = defaultSideOffset(depth, cc);

      let prefLeft = cx - off;
      let prefRight = cx + off;

      if (ifEdge?.target && ifEdge.target !== "end") {
        prefLeft = spineX(ifEdge.target, columns);
      }
      if (elseEdge?.target && elseEdge.target !== "end") {
        prefRight = spineX(elseEdge.target, columns);
      }

      if (ifEdge?.target && ifEdge.target !== "end") {
        const b = subtreeColBounds(ifEdge.target, wfNodes, wfEdges, columns);
        if (b) {
          const minRightClear = cx + Math.max(off, (b.maxC - cc + 1) * FLOW.BRANCH_OFFSET);
          prefRight = Math.max(prefRight, minRightClear);
        }
      }
      if (elseEdge?.target && elseEdge.target !== "end") {
        const b = subtreeColBounds(elseEdge.target, wfNodes, wfEdges, columns);
        if (b) {
          const minLeftClear = cx - Math.max(off, (cc - b.minC + 1) * FLOW.BRANCH_OFFSET);
          prefLeft = Math.min(prefLeft, minLeftClear);
        }
      }

      const tagLeftX = resolveLaneX(prefLeft, usedLeft, "left");
const tagRightX = resolveLaneX(prefRight, usedRight, "right");

      const pos = positions[cid];
      const condBottom = pos.y + FLOW.NODE_H;
      const forkY = condBottom + FLOW.FORK_GAP;
      const tagY = forkY + FLOW.TAG_DROP;
      const mergeY = Math.max(
        computeMergeY(cid, wfNodes, wfEdges, columns, positions),
        tagY + 56
      );
      const parentMergeId = findParentConditionMergeId(cid, wfNodes, wfEdges);
      // A nested condition's merge exits straight into its parent's merge - align its X with
      // wherever the parent's own merge renders (cascading through multiple nesting levels)
      // so that exit is a straight drop, not a long sideways jog.
      const parentCid = parentMergeId ? parentMergeId.replace("__merge", "") : null;
      const mergeCx = parentCid ? (meta[parentCid]?.mergeCx ?? spineX(parentCid, columns)) : cx;

      meta[cid] = {
        cx,
        mergeCx,
        forkY,
        tagY,
        mergeY,
        tagLeftX,
        tagRightX,
        ifEdge,
        elseEdge,
        mergeId: `${cid}__merge`,
        forkId: `${cid}__fork`,
        trueId: `${cid}__true`,
        falseId: `${cid}__false`,
        parentMergeId
      };
    });

  return { conditionIds, meta };
}

export function buildFlowElements(wfNodes, wfEdges, layout, { selected, insertEdgeId, dragType }) {
  const { levels, columns } = layout;
  const positions = {};
  const rfNodes = [];
  const rfEdges = [];
  const edgeKeys = new Set();
  const spineVertKeys = new Set();
  const mergeMeta = {};
  const exitEdgesMemo = new Map();

  const addEdge = (id, source, target, data = {}) => {
    if (!source || !target) return;
    const key = `${source}|${target}|${data.wfEdgeId || ""}|${data.kind || ""}|${data.sourceHandle || ""}|${data.railY || ""}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    const edgeType =
      data.kind === "forkArm" ? "forkArm"
        : data.kind === "branch" ? "branchRail"
          : "workflow";
    rfEdges.push({
      id,
      source,
      target,
      sourceHandle: data.sourceHandle,
      type: edgeType,
      data: { straight: data.kind === "spine" || data.straight, ...data },
      selectable: false
    });
  };

  /** Chỉ 1 đoạn dọc trên spine trùng Y — tránh double-line */
  const addSpineEdge = (id, source, target, data = {}) => {
    const sx = positions[source]?.x ?? FLOW.SPINE_X;
    const tx = positions[target]?.x ?? mergeNodeX(target, columns);
    if (Math.abs(sx - FLOW.SPINE_X) < 8 && Math.abs(tx - FLOW.SPINE_X) < 8) {
      const sy = positions[source]?.y ?? 0;
      const ty = positions[target]?.y ?? positions.end?.y ?? 0;
      const vKey = `${FLOW.SPINE_X}|${Math.round(Math.min(sy, ty))}|${Math.round(Math.max(sy, ty))}`;
      if (spineVertKeys.has(vKey)) return;
      spineVertKeys.add(vKey);
    }
    addEdge(id, source, target, { ...data, kind: "spine" });
  };

  wfNodes.forEach(n => {
    positions[n.id] = {
      x: spineX(n.id, columns),
      y: (levels[n.id] ?? 0) * FLOW.Y_STEP + 40
    };
  });
  straightenSingleActiveBranches(wfNodes, wfEdges, positions);

  const empty = isEmptyWorkflow(wfNodes, wfEdges);

  wfNodes.forEach(n => {
    const cat =
      n.id === "start" ? "trigger"
        : n.id === "end" ? "end"
          : NODE_TYPES[n.type]?.cat || "action";
    rfNodes.push({
      id: n.id,
      type: "workflow",
      position: positions[n.id],
      draggable: false,
      selectable: true,
      data: { wfNode: n, cat, selected: selected === n.id }
    });
  });

  if (empty) {
    const startEdge = wfEdges.find(e => e.source === "start" && e.target === "end");
    const midY = (positions.start.y + positions.end.y) / 2;
    rfNodes.push({
      id: "slot_empty",
      type: "insertSlot",
      position: { x: FLOW.SPINE_X, y: midY },
      draggable: false,
      selectable: false,
      data: {
        wfEdgeId: startEdge?.id,
        insertEdgeId,
        dragType,
        label: "Kéo item đầu tiên vào đây",
        overlayOnly: true
      }
    });
    addSpineEdge("e_start_end", "start", "end", {
      wfEdgeId:
startEdge?.id,
      insertable: true,
      straight: true
    });
    return { nodes: rfNodes, edges: rfEdges };
  }

  const { conditionIds, meta } = buildConditionMeta(wfNodes, wfEdges, columns, levels, positions);

  let maxEndY = positions.end?.y ?? 0;
  conditionIds.forEach(cid => {
    maxEndY = Math.max(maxEndY, meta[cid].mergeY + 80);
  });
  positions.end.y = maxEndY;
  const endRf = rfNodes.find(n => n.id === "end");
  if (endRf) endRf.position.y = maxEndY;

  function connectBranchExit(fromId, parentMergeId, railY, visited = new Set()) {
    if (!fromId || visited.has(fromId)) return;
    visited.add(fromId);
    if (isCondition(wfNodes, fromId)) return;

    const outs = wfEdges.filter(e => e.source === fromId);

    if (!outs.length) {
      addEdge(`${fromId}_exit_${parentMergeId}`, fromId, parentMergeId, {
        kind: "branch",
        railY
      });
      return;
    }

    outs.forEach(e => {
      if (e.target === "end") {
        addEdge(`${fromId}_exit_${parentMergeId}`, fromId, parentMergeId, {
          wfEdgeId: e.id,
          insertable: true,
          kind: "branch",
          railY
        });
      } else if (isCondition(wfNodes, e.target)) {
        // No railY: hop into a nested condition's own top, no shared row to align with.
        addEdge(`${fromId}_to_${e.target}`, fromId, e.target, {
          wfEdgeId: e.id,
          kind: "branch"
        });
      } else if (colOf(fromId, columns) === colOf(e.target, columns)) {
        addSpineEdge(e.id, fromId, e.target, {
          wfEdgeId: e.id,
          insertable: true,
          straight: true
        });
        connectBranchExit(e.target, parentMergeId, railY, visited);
      } else {
        addEdge(e.id, fromId, e.target, {
          wfEdgeId: e.id,
          insertable: true,
          kind: "branch",
          railY
        });
        connectBranchExit(e.target, parentMergeId, railY, visited);
      }
    });
  }

  conditionIds
    .slice()
    .sort((a, b) => (levels[a] ?? 0) - (levels[b] ?? 0))
    .forEach(cid => {
      const m = meta[cid];
      mergeMeta[m.mergeId] = { cx: m.mergeCx, mergeY: m.mergeY };

      rfNodes.push(
        {
          id: m.forkId,
          type: "junction",
          position: { x: m.cx, y: m.forkY },
          draggable: false,
          selectable: false,
          data: {}
        },
        {
          id: m.trueId,
          type: "branchTag",
          position: { x: m.tagLeftX, y: m.tagY },
          draggable: false,
          selectable: false,
          data: { label: "Đúng", side: "left", conditionId: cid }
        },
        {
          id: m.falseId,
          type: "branchTag",
          position: { x: m.tagRightX, y: m.tagY },
          draggable: false,
          selectable: false,
          data: { label: "Sai", side: "right", conditionId: cid }
        },
        {
          id: m.mergeId,
          type: "merge",
          position: { x: m.mergeCx, y: m.mergeY },
          draggable: false,
          selectable: false,
          data: { conditionId: cid }
        }
      );

      addSpineEdge(`${cid}_down`, cid, m.forkId, { straight: true });
      addEdge(`${cid}_t`, m.forkId, m.trueId, { kind: "forkArm", sourceHandle: "left" });
      addEdge(`${cid}_f`, m.forkId, m.falseId, { kind: "forkArm", sourceHandle: "right" });

      const wireSide = (tagId, edge, side) => {
        if (!edge || edge.target === "end") {
          addEdge(`${cid}_${side}_m`, tagId, m.mergeId, {
            wfEdgeId: edge?.id,
            insertable: true,
            side,
            kind: "branch",
            railY: m.mergeY
          });
          return;
        }
        if (isCondition(wfNodes, edge.target)) {
          addEdge(`${cid}_${side}_cond`, tagId, edge.target, {
            wfEdgeId: edge.id,
            insertable: true,
            kind: "branch"
          });
          return;
        }
        addEdge(`${cid}_${side}_to_${edge.target}`, tagId, edge.target, {
          wfEdgeId: edge.id,
          insertable: true,
          kind: "branch",
          railY: m.mergeY
});
        connectBranchExit(edge.target, m.mergeId, m.mergeY);
      };

      wireSide(m.trueId, m.ifEdge, "true");
      wireSide(m.falseId, m.elseEdge, "false");

      const outTarget = mergeSpineTarget(cid, wfNodes, wfEdges, columns);
      // Nested condition: merge routes into the PARENT's merge, no insert point here.
      const outIsParentMerge = outTarget.includes("__merge");
      // mergeCx was derived from the parent's own merge X, so this is always aligned already.
      const outX = outIsParentMerge ? m.mergeCx : mergeNodeX(outTarget, columns);
      const sameX = Math.abs(m.mergeCx - outX) < 8;
      const mergeEdgeIds = outIsParentMerge
        ? []
        : collectRealExitEdges(cid, outTarget, wfNodes, wfEdges, exitEdgesMemo);

      addEdge(`${cid}_out`, m.mergeId, outTarget, {
        insertable: !outIsParentMerge && mergeEdgeIds.length > 0,
        wfEdgeId: mergeEdgeIds[0],
        mergeInsert: (!outIsParentMerge && mergeEdgeIds.length > 0)
          ? { conditionId: cid, downstreamId: outTarget, edgeIds: mergeEdgeIds }
          : undefined,
        kind: sameX ? "spine" : "branch",
        straight: sameX,
        railY: outIsParentMerge
          ? mergeMeta[outTarget]?.mergeY ?? m.mergeY
          : m.mergeY
      });
    });

  const coveredSpinePairs = new Set();
  conditionIds.forEach(cid => {
    const out = mergeSpineTarget(cid, wfNodes, wfEdges, columns);
    if (!findParentConditionMergeId(cid, wfNodes, wfEdges)) {
      coveredSpinePairs.add(`merge|${out}`);
    }
    const m = meta[cid];
    if (m.parentMergeId) coveredSpinePairs.add(`${m.parentMergeId}|${m.mergeId}`);
  });

  wfEdges.forEach(e => {
    const src = wfNodes.find(n => n.id === e.source);
    const tgt = wfNodes.find(n => n.id === e.target);
    if (!src || !tgt) return;

    const srcCat = NODE_TYPES[src.type]?.cat;
    if (srcCat === "condition") return;
    if (colOf(e.source, columns) !== 0 && e.target === "end") return;

    const srcSpine = colOf(e.source, columns) === 0 || e.source === "start";
    const tgtSpine = colOf(e.target, columns) === 0 || e.target === "end";
    if (!srcSpine || !tgtSpine) return;

    if (e.target === "end") {
      const mergeReachesEnd = conditionIds.some(c => {
        if (findParentConditionMergeId(c, wfNodes, wfEdges)) return false;
        return mergeSpineTarget(c, wfNodes, wfEdges, columns) === "end";
      });
      if (mergeReachesEnd && e.source !== "start") return;
    }

    if (isCondition(wfNodes, e.target)) {
      const pairKey = `${e.source}|${e.target}`;
      if (coveredSpinePairs.has(pairKey)) return;
      addSpineEdge(e.id, e.source, e.target, { wfEdgeId: e.id, insertable: true });
      return;
    }

    if (e.target === "end") {
      addSpineEdge(e.id, e.source, e.target, { wfEdgeId: e.id, straight: true });
      return;
    }

    const coveredByMerge = conditionIds.some(c => {
      const t = mergeSpineTarget(c, wfNodes, wfEdges, columns);
      return t === e.target && !findParentConditionMergeId(c, wfNodes, wfEdges);
    });
    if (!coveredByMerge) {
      addSpineEdge(e.id, e.source, e.target, { wfEdgeId: e.id, insertable: true });
    }
  });

  return { nodes: rfNodes, edges: rfEdges };
}