import { NODE_TYPES } from "../constants.js";
import { isEmptyWorkflow } from "../utils/edgeRouting.js";

/** nodeOrigin=[0.5,0] → position.x là tâm ngang của node */
export const FLOW = {
  SPINE_X: 400,
  BRANCH_OFFSET: 200,
  BRANCH_OFFSET_LOCAL: 72,
  Y_STEP: 160,
  NODE_H: 72,
  NODE_W: 260,
  TAG_W: 80,
  MERGE_SIZE: 8,
  FORK_GAP: 8,
  TAG_DROP: 28,
  LANE_STEP: 56
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

function findParentConditionId(nodeId, nodes, edges) {
  let curr = nodeId;
  const seen = new Set();
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    const inc = edges.find(e => e.target === curr);
    if (!inc) break;
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

function mergeSpineTarget(condId, nodes, edges, columns) {
  const parentMerge = findParentConditionMergeId(condId, nodes, edges);
  if (parentMerge) return parentMerge;

  const { ifEdge, elseEdge } = getCondEdges(edges, condId);
  const outs = [ifEdge, elseEdge].filter(Boolean);
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

function subtreeMaxBottom(rootId, nodes, edges, columns, positions, memo = new Map()) {
  if (!rootId || rootId === "end") return 0;
  if (memo.has(rootId)) return memo.get(rootId);

  const pos = positions[rootId];
  let bottom = (pos?.y ?? 0) + FLOW.NODE_H;

  if (isCondition(nodes, rootId)) {
    const { ifEdge, elseEdge } = getCondEdges(edges, rootId);
    [ifEdge, elseEdge].forEach(e => {
      if (e?.target && e.target !== "end") {
        bottom = Math.max(bottom, subtreeMaxBottom(e.target, nodes, edges, columns, positions, memo) + 80);
      }
    });
    bottom = Math.max(bottom, (pos?.y ?? 0) + 130);
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
  const y =
    railY ??
    sourceY + Math.min(Math.max(36, (targetY - sourceY) * 0.4), targetY - sourceY - 12);
  return `M ${sourceX} ${sourceY} L ${sourceX} ${y} L ${targetX} ${y} L ${targetX} ${targetY}`;
}

function mergeNodeX(targetId, columns) {
  if (targetId === "end") return FLOW.SPINE_X;
  if (String(targetId).includes("__merge")) {
    const cid = String(targetId).replace("__merge", "");
    return spineX(cid, columns);
  }
  return spineX(targetId, columns);
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
      maxY = Math.max(maxY, subtreeMaxBottom(e.target, nodes, edges, columns, positions) + 24);
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
      const cx = spineX(cid, columns);
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

      meta[cid] = {
        cx,
        cc,
        depth,
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
        parentMergeId: findParentConditionMergeId(cid, wfNodes, wfEdges)
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
      wfEdgeId: startEdge?.id,
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

    const mergeCx = mergeMeta[parentMergeId]?.cx ?? mergeNodeX(parentMergeId, columns);
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
          kind: "branch",
          railY
        });
      } else if (isCondition(wfNodes, e.target)) {
        addEdge(`${fromId}_to_${e.target}`, fromId, e.target, {
          wfEdgeId: e.id,
          kind: "branch",
          railY: meta[e.target]?.tagY ?? railY
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
      mergeMeta[m.mergeId] = { cx: m.cx, mergeY: m.mergeY };

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
          position: { x: m.cx, y: m.mergeY },
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
            kind: "branch",
            railY: meta[edge.target]?.tagY ?? m.mergeY
          });
          return;
        }
        addEdge(`${cid}_${side}_to_${edge.target}`, tagId, edge.target, {
          wfEdgeId: edge.id,
          kind: "branch",
          railY: m.mergeY
        });
        connectBranchExit(edge.target, m.mergeId, m.mergeY);
      };

      wireSide(m.trueId, m.ifEdge, "true");
      wireSide(m.falseId, m.elseEdge, "false");

      const outTarget = mergeSpineTarget(cid, wfNodes, wfEdges, columns);
      const outX = mergeNodeX(outTarget, columns);
      const sameX = Math.abs(m.cx - outX) < 8;

      addEdge(`${cid}_out`, m.mergeId, outTarget, {
        insertable: outTarget === "end",
        wfEdgeId: outTarget === "end" ? m.ifEdge?.id || m.elseEdge?.id : undefined,
        kind: sameX ? "spine" : "branch",
        straight: sameX,
        railY: outTarget.includes("__merge")
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

  conditionIds.forEach(cid => {
    const m = meta[cid];
    const outTarget = mergeSpineTarget(cid, wfNodes, wfEdges, columns);
    if (outTarget === "end" && !rfEdges.some(re => re.source === m.mergeId && re.target === "end")) {
      const sameX = Math.abs(m.cx - FLOW.SPINE_X) < 8;
      addEdge(`${cid}_out_fix`, m.mergeId, "end", {
        kind: sameX ? "spine" : "branch",
        straight: sameX,
        railY: m.mergeY
      });
    }
  });

  return { nodes: rfNodes, edges: rfEdges };
}
