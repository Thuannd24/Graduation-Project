import { NODE_TYPES } from "../constants.js";
import { isEmptyWorkflow } from "../utils/edgeRouting.js";
import { resolveBranchStructure } from "../utils/branchStructure.js";

/**
 * nodeOrigin=[0.5,0] → position.x là tâm ngang của node.
 * NODE_W phải khớp với width thật của .cb-rf-node trong campaign-builder.css,
 * nếu không các cột nhánh sẽ chồng lên nhau (offset < nửa bề rộng node).
 *
 * Layout đệ quy theo subtree (thay cho gán cột BFS tham lam + vá hậu kỳ cũ):
 * mỗi condition tự tính bề rộng cần thiết từ NỘI DUNG nhánh của chính nó (không dùng
 * mảng "lane" toàn cục), điểm hội tụ thật (joinNode) được `branchStructure.js` xác định
 * trước một cách cấu trúc (không suy đoán hậu kỳ) nên toạ độ X luôn thẳng hàng đúng ngay
 * từ đầu — không cần bước "straighten" hay "mergeNodeX" dò lại sau này.
 */
export const FLOW = {
  SPINE_X: 400,
  BRANCH_OFFSET: 200,
  MIN_LANE_WIDTH: 400, // = 2 * BRANCH_OFFSET: mỗi nhánh (kể cả nhánh trơn/trivial) chiếm tối thiểu 1 lane rộng chừng này
  Y_STEP: 160,
  NODE_H: 72,
  NODE_W: 280,
  TAG_W: 80,
  TAG_H: 36,
  FORK_GAP: 8,
  TAG_DROP: 48, // fork bar → tag (chiều cao "ngoặc trên") - cân đối với MERGE_GAP để 2 ngoặc trông đối xứng
  BRANCH_START_GAP: 64, // tag → node đầu nhánh
  MERGE_GAP: 64, // node cuối nhánh (hoặc tag, nếu nhánh trơn) → merge bar - tăng nhẹ cho đỡ "vuông"
  GAP_AFTER_MERGE: 80
};

function isCondition(nodes, id) {
  const n = nodes.find(x => x.id === id);
  return n && NODE_TYPES[n.type]?.cat === "condition";
}

/** Orthogonal path — railY cố định cho mọi nhánh gom về merge */
export function branchRailPath(sourceX, sourceY, targetX, targetY, railY) {
  if (Math.abs(sourceX - targetX) < 6) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }
  const lo = Math.min(sourceY, targetY);
  const hi = Math.max(sourceY, targetY);
  const fallback = sourceY + Math.min(Math.max(36, (targetY - sourceY) * 0.4), targetY - sourceY - 12);
  const y = railY != null ? Math.min(Math.max(railY, lo), hi) : fallback;
  return `M ${sourceX} ${sourceY} L ${sourceX} ${y} L ${targetX} ${y} L ${targetX} ${targetY}`;
}

// Real wfEdges to relink when inserting right after a condition's merge - every branch's true
// terminal edge(s) reaching joinNode, however deep (through actions/nested conditions).
function collectTerminalEdgeIds(condId, joinNode, nodes, edges, structure, memo) {
  const key = condId + "|" + joinNode;
  if (memo.has(key)) return memo.get(key);
  memo.set(key, []); // guard against pathological cycles while resolving
  const info = structure.get(condId);
  const result = [];

  const walk = edge => {
    if (!edge) return;
    if (edge.target === joinNode) {
      result.push(edge.id);
      return;
    }
    if (isCondition(nodes, edge.target)) {
      result.push(...collectTerminalEdgeIds(edge.target, joinNode, nodes, edges, structure, memo));
      return;
    }
    let cur = edge.target;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const outs = edges.filter(e => e.source === cur);
      let advanced = false;
      outs.forEach(e => {
        if (e.target === joinNode) result.push(e.id);
        else if (isCondition(nodes, e.target)) result.push(...collectTerminalEdgeIds(e.target, joinNode, nodes, edges, structure, memo));
        else if (e.target !== joinNode) { cur = e.target; advanced = true; }
      });
      if (!advanced) break;
    }
  };

  (info?.branchEdges || []).forEach(walk);
  memo.set(key, result);
  return result;
}

export function buildFlowElements(wfNodes, wfEdges, layout, { selected, insertEdgeId, dragType }) {
  const empty = isEmptyWorkflow(wfNodes, wfEdges);
  const positions = {};
  const rfNodes = [];
  const rfEdges = [];
  const edgeKeys = new Set();
  const placed = new Set();
  const halfWidthCache = new Map();
  const exitEdgesMemo = new Map();

  const isCond = id => isCondition(wfNodes, id);

  const addEdge = (id, source, target, data = {}) => {
    if (!source || !target) return;
    const key = `${source}|${target}|${data.wfEdgeId || ""}|${data.kind || ""}`;
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

  if (empty) {
    const startEdge = wfEdges.find(e => e.source === "start" && e.target === "end");
    wfNodes.forEach(n => {
      positions[n.id] = { x: FLOW.SPINE_X, y: n.id === "end" ? 200 : 40 };
    });
    wfNodes.forEach(n => {
      const cat = n.id === "start" ? "trigger" : n.id === "end" ? "end" : NODE_TYPES[n.type]?.cat || "action";
      rfNodes.push({
        id: n.id, type: "workflow", position: positions[n.id], draggable: false, selectable: true,
        data: { wfNode: n, cat, selected: selected === n.id }
      });
    });
    const midY = (positions.start.y + positions.end.y) / 2;
    rfNodes.push({
      id: "slot_empty", type: "insertSlot", position: { x: FLOW.SPINE_X, y: midY },
      draggable: false, selectable: false,
      data: { wfEdgeId: startEdge?.id, insertEdgeId, dragType, label: "Kéo item đầu tiên vào đây", overlayOnly: true }
    });
    addEdge("e_start_end", "start", "end", { wfEdgeId: startEdge?.id, insertable: true, kind: "spine" });
    return { nodes: rfNodes, edges: rfEdges };
  }

  const structure = resolveBranchStructure(wfNodes, wfEdges);

  function computeBranchHalfWidth(target, joinNode) {
    if (!target || target === joinNode) return 0;
    if (isCond(target)) return computeConditionHalfWidth(target);
    return 0;
  }

  function computeConditionHalfWidth(condId) {
    if (halfWidthCache.has(condId)) return halfWidthCache.get(condId);
    halfWidthCache.set(condId, FLOW.MIN_LANE_WIDTH / 2); // provisional guard, only matters for malformed cyclic input
    const info = structure.get(condId);
    const slots = (info?.branchEdges || []).map(e =>
      Math.max(FLOW.MIN_LANE_WIDTH, computeBranchHalfWidth(e.target, info.joinNode) * 2)
    );
    const total = slots.reduce((a, b) => a + b, 0) || FLOW.MIN_LANE_WIDTH;
    const half = total / 2;
    halfWidthCache.set(condId, half);
    return half;
  }

  const cat = n => n.id === "start" ? "trigger" : n.id === "end" ? "end" : NODE_TYPES[n.type]?.cat || "action";

  function placeNode(id, x, y) {
    if (placed.has(id)) return;
    placed.add(id);
    positions[id] = { x, y };
    const n = wfNodes.find(x2 => x2.id === id);
    rfNodes.push({
      id, type: "workflow", position: { x, y }, draggable: false, selectable: true,
      data: { wfNode: n, cat: cat(n), selected: selected === id }
    });
  }

  function placeJunction(condId, x, y) {
    const id = `${condId}__fork`;
    positions[id] = { x, y };
    rfNodes.push({ id, type: "junction", position: { x, y }, draggable: false, selectable: false, data: {} });
    return id;
  }

  function placeTag(condId, edge, index, x, y) {
    const id = `${condId}__tag${index}`;
    positions[id] = { x, y };
    const isIf = !edge.isDefault;
    rfNodes.push({
      id, type: "branchTag", position: { x, y }, draggable: false, selectable: false,
      data: {
        label: isIf ? (edge.label || "Đúng") : "Sai",
        side: isIf ? "left" : "right",
        conditionId: condId
      }
    });
    return id;
  }

  function placeMerge(condId, x, y) {
    const id = `${condId}__merge`;
    positions[id] = { x, y };
    rfNodes.push({ id, type: "merge", position: { x, y }, draggable: false, selectable: false, data: { conditionId: condId } });
    return id;
  }

  // Lays out one condition fully: itself, fork junction, N branch tags (+ their subtrees),
  // and its own merge. Does NOT draw the merge's outgoing edge - the caller (layoutChain)
  // decides that, since it depends on whether this condition's join is being absorbed into
  // an enclosing merge or continues the current chain.
  function layoutCondition(condId, x, y) {
    placeNode(condId, x, y);
    const info = structure.get(condId);
    const branchEdges = info?.branchEdges || [];

    const tagY = y + FLOW.NODE_H + FLOW.FORK_GAP + FLOW.TAG_DROP;
    // The common binary Đúng/Sai case connects straight from the condition box's own left/right
    // sides (matches the reference diagram - no separate fork dot below the box). N-ary (3+
    // branches, no side-only geometry to fall back on) keeps the junction-below approach.
    const useSides = branchEdges.length === 2;
    let forkId = null;
    if (!useSides) {
      forkId = placeJunction(condId, x, y + FLOW.NODE_H + FLOW.FORK_GAP);
      addEdge(`${condId}_to_fork`, condId, forkId, { kind: "spine", straight: true });
    }

    const slots = branchEdges.map(e => Math.max(FLOW.MIN_LANE_WIDTH, computeBranchHalfWidth(e.target, info.joinNode) * 2));
    const total = slots.reduce((a, b) => a + b, 0);
    let cursor = x - total / 2;
    let maxBottom = tagY + FLOW.TAG_H;
    const ifSeen = { count: 0 };
    // Local to this call (not shared across recursive layoutCondition calls) - a nested
    // condition processed while resolving one branch must never clobber a sibling branch's
    // already-pushed terminal here.
    const branchTerminals = [];

    branchEdges.forEach((e, i) => {
      const w = slots[i];
      const tagX = cursor + w / 2;
      cursor += w;
      if (!e.isDefault) {
        ifSeen.count++;
        e = { ...e, label: branchEdges.filter(b => !b.isDefault).length > 1 ? `Đúng ${ifSeen.count}` : "Đúng" };
      }
      const tagId = placeTag(condId, e, i, tagX, tagY);
      if (useSides) {
        addEdge(`${condId}_arm_${i}`, condId, tagId, {
          kind: "forkArm", sourceHandle: i === 0 ? "branchLeft" : "branchRight"
        });
      } else {
        addEdge(`${condId}_arm_${i}`, forkId, tagId, { kind: "forkArm" });
      }

      if (!e.target || e.target === info.joinNode) {
        // trivial branch: tag connects straight to this condition's own merge (drawn after
        // mergeY known) - the edge IS `e` itself, so it stays insertable.
        maxBottom = Math.max(maxBottom, tagY + FLOW.TAG_H);
        branchTerminals.push({ lastId: tagId, edgeId: e.id });
        return;
      }

      const entryY = tagY + FLOW.BRANCH_START_GAP;
      addEdge(`${condId}_b${i}_to_${e.target}`, tagId, e.target, { wfEdgeId: e.id, insertable: true, kind: "branch" });
      const { y: bottomY, lastId } = layoutChain(e.target, info.joinNode, tagX, entryY);
      maxBottom = Math.max(maxBottom, bottomY);
      // lastId is either a real node id (look up its real outgoing edge into joinNode - still
      // insertable) or a nested condition's own "<id>__merge" (no single real edge, not
      // insertable - matches how a nested merge-to-merge hop always behaved).
      const realEdge = wfEdges.find(x2 => x2.source === lastId && x2.target === info.joinNode);
      branchTerminals.push({ lastId, edgeId: realEdge?.id });
    });

    const mergeY = maxBottom + FLOW.MERGE_GAP;
    const mergeId = placeMerge(condId, x, mergeY);

    branchTerminals.forEach(({ lastId, edgeId }) => {
      if (!lastId) return;
      addEdge(`${lastId}_to_${mergeId}`, lastId, mergeId, {
        kind: "branch", railY: mergeY, wfEdgeId: edgeId, insertable: !!edgeId
      });
    });

    return mergeId;
  }

  // Walks a straight chain of real nodes starting at `nodeId`, stopping at `joinNode`, a dead
  // end, or an already-placed node (defensive reconvergence guard for malformed input). When
  // it passes through a nested condition, decides whether this chain continues past it
  // (draws the merge->next edge itself) or whether the condition's join equals the outer
  // `joinNode` (defers the final wiring to the caller, returning the merge id as `lastId`).
  function layoutChain(nodeId, joinNode, x, startY) {
    let cur = nodeId;
    let y = startY;
    let lastId = null;

    while (cur && cur !== joinNode) {
      if (placed.has(cur)) { lastId = cur; break; }

      if (isCond(cur)) {
        const mergeId = layoutCondition(cur, x, y);
        const mergeY = positions[mergeId].y;
        const next = structure.get(cur)?.joinNode ?? null;
        if (next === joinNode || next == null) {
          lastId = mergeId;
          y = mergeY; // caller's maxBottom must see this subtree's real extent, not the pre-recursion y
          break;
        }
        drawMergeExit(cur, mergeId, next, x, mergeY, { kind: "spine", straight: true });
        y = mergeY + FLOW.GAP_AFTER_MERGE;
        cur = next;
        continue;
      }

      placeNode(cur, x, y);
      lastId = cur;
      y += FLOW.Y_STEP;
      const next = wfEdges.find(e => e.source === cur);
      if (!next) { cur = null; break; }
      if (next.target !== joinNode) {
        addEdge(next.id, cur, next.target, { wfEdgeId: next.id, insertable: true, kind: "spine", straight: true });
      }
      cur = next.target;
    }

    return { y, lastId };
  }

  function drawMergeExit(condId, mergeId, joinNode, x, mergeY, extra) {
    const terminalIds = collectTerminalEdgeIds(condId, joinNode, wfNodes, wfEdges, structure, exitEdgesMemo);
    addEdge(`${mergeId}_out`, mergeId, joinNode, {
      insertable: terminalIds.length > 0,
      wfEdgeId: terminalIds[0],
      mergeInsert: terminalIds.length > 0 ? { conditionId: condId, downstreamId: joinNode, edgeIds: terminalIds } : undefined,
      railY: mergeY,
      ...extra
    });
  }

  const { y: topY, lastId: topLastId } = layoutChain("start", null, FLOW.SPINE_X, 40);

  // The top-level chain has no enclosing condition, so if it ended on an absorbed merge
  // (topLastId is a synthetic "<id>__merge"), wire that merge's real outgoing edge to "end"
  // here - mirrors what layoutChain does for nested continuations, but for the outermost level.
  if (typeof topLastId === "string" && topLastId.endsWith("__merge") && !placed.has("end")) {
    const condId = topLastId.slice(0, -"__merge".length);
    const mergeY = positions[topLastId].y;
    placeNode("end", FLOW.SPINE_X, mergeY + FLOW.GAP_AFTER_MERGE);
    drawMergeExit(condId, topLastId, "end", FLOW.SPINE_X, mergeY, { straight: true });
  }

  // Any wfNode the walk never reached (malformed/orphaned input) still needs a position so it
  // isn't silently dropped from the canvas - stack these below everything else as a fallback.
  let fallbackY = Math.max(topY, positions.end ? positions.end.y + FLOW.GAP_AFTER_MERGE : topY);
  wfNodes.forEach(n => {
    if (placed.has(n.id)) return;
    placeNode(n.id, FLOW.SPINE_X, fallbackY);
    fallbackY += FLOW.Y_STEP;
  });

  return { nodes: rfNodes, edges: rfEdges };
}
