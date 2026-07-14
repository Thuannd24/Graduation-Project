import { NODE_TYPES, CANVAS_X_STEP, CANVAS_Y_STEP, CANVAS_X_ORIGIN, CANVAS_Y_ORIGIN } from "../constants.js";
import { enrichBranchProps } from "./expression.js";
import { BRANCH_COL, isDuplicateBranchEdge, findMainEdgeToEnd } from "./edgeRouting.js";
import { workflowRequiresBudget } from "./workflowBudget.js";

export { isDuplicateBranchEdge, findMainEdgeToEnd };

const X0 = CANVAS_X_ORIGIN ?? 100;
const Y0 = CANVAS_Y_ORIGIN ?? 80;
const X_STEP = CANVAS_X_STEP ?? 220;
const Y_STEP = CANVAS_Y_STEP ?? 160;

// Normalize edge shape from BE (from/to) or FE (source/target) into one format.
export function normalizeEdge(e) {
  return {
    id: e.id,
    source: e.source || e.from,
    target: e.target || e.to,
    isDefault: !!e.isDefault,
    properties: (() => {
      const base = { ...(e.properties || {}) };
      if (e.condition && !base.expression) base.expression = e.condition;
      return base;
    })()
  };
}

import { stripNodeDisplayName } from "./nodeDisplay.js";

// Merge node defaults + enrich condition-branch edge props for validate/deploy.
export function normalizeWorkflow(rawNodes, rawEdges) {
  const nodes = (rawNodes || []).map(n => ({
    id: n.id,
    name: stripNodeDisplayName(n.name) || n.name,
    type: n.type,
    properties: {
      ...(NODE_TYPES[n.type]?.def || {}),
      ...(n.properties || {})
    }
  }));

  const edges = (rawEdges || []).map(normalizeEdge).map(e => {
    if (e.isDefault) return e;
    const src = nodes.find(n => n.id === e.source);
    if (!src || NODE_TYPES[src.type]?.cat !== "condition") return e;
    return { ...e, properties: enrichBranchProps(src.type, e.properties) };
  });

  return { nodes, edges };
}

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// BFS levels (rank of each node from "start")
export function getLevels(nodes, edges) {
  const lv = {};
  const visited = new Set();
  const q = ["start"];
  lv["start"] = 0;
  while (q.length) {
    const c = q.shift();
    const cl = lv[c] || 0;
    edges.filter(e => e.source === c).forEach(e => {
      lv[e.target] = Math.max(lv[e.target] || 0, cl + 1);
      if (!visited.has(e.target)) q.push(e.target);
    });
    visited.add(c);
  }
  nodes.forEach(n => { if (lv[n.id] === undefined) lv[n.id] = 1; });
  const maxLv = Math.max(...Object.values(lv).filter(x => x !== lv["end"]), 0);
  lv["end"] = maxLv + 1;
  return lv;
}

// Layered layout with column assignment, spreads condition branches left/right
export function computeLayout(nodes, edges) {
  const levels = getLevels(nodes, edges);
  const cols = {};
  const occupied = {};

  function occupy(id, lvl, pref) {
    let col = pref;
    let step = 1;
    let dir = 1;
    while (occupied[lvl + "_" + col] && occupied[lvl + "_" + col] !== id) {
      col = pref + dir * step;
      if (dir === 1) dir = -1;
      else { dir = 1; step++; }
    }
    cols[id] = col;
    occupied[lvl + "_" + col] = id;
  }

  occupy("start", 0, 0);
  const visited = new Set();
  const queue = ["start"];
  while (queue.length) {
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    const cc = cols[curr] || 0;
    const cl = levels[curr] || 0;
    const srcNode = nodes.find(n => n.id === curr);
    const isCond = srcNode && NODE_TYPES[srcNode.type]?.cat === "condition";
    const out = edges.filter(e => e.source === curr);
    if (!out.length) continue;

    const sorted = [...out].sort((a, b) => (a.isDefault ? 1 : 0) - (b.isDefault ? 1 : 0));
    if (sorted.length === 1) {
      const t = sorted[0].target;
      const tl = levels[t] || (cl + 1);
      if (cols[t] === undefined) {
        occupy(t, tl, t === "end" ? 0 : cc);
      }
      queue.push(t);
    } else {
      const nonDef = sorted.filter(e => !e.isDefault);
      /** Cột gốc dùng ±2; condition lồng nhánh chỉ ±1 để Else không kéo về spine */
      const spacing = isCond ? (cc === 0 ? BRANCH_COL : 1) : Math.max(1, Math.ceil(sorted.length / 2));
      sorted.forEach(e => {
        const t = e.target;
        const tl = levels[t] || (cl + 1);
        if (cols[t] !== undefined) { queue.push(t); return; }
        if (t === "end") { occupy(t, tl, 0); queue.push(t); return; }
        if (e.isDefault) {
          occupy(t, tl, cc === 0 ? cc + spacing : cc + 1);
        } else {
          const ndIdx = nonDef.findIndex(x => x.id === e.id);
          const total = nonDef.length;
          let offset;
          if (total === 1) offset = -spacing;
          else if (total === 2) offset = ndIdx === 0 ? -spacing : spacing;
          else offset = ndIdx % 2 === 0
            ? -spacing * (Math.floor(ndIdx / 2) + 1)
            : spacing * Math.ceil(ndIdx / 2);
          occupy(t, tl, cc + offset);
        }
        queue.push(t);
      });
    }
  }

  if (cols["end"] === undefined) cols["end"] = 0;
  nodes.forEach(n => {
    if (cols[n.id] === undefined) occupy(n.id, levels[n.id] || 1, 0);
  });

  return { levels, columns: cols };
}

// Re-export routing helpers used by canvas
export { buildEdgePath, getEdgeMidpoint, colSide, isEmptyWorkflow } from "./edgeRouting.js";

// Payload sent to backend for validate + deploy (includes x/y for Camunda diagram)
export function buildGraphPayload(nodes, edges, meta = {}) {
  const { levels, columns } = computeLayout(nodes, edges);
  const payload = {
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      x: X0 + (columns[n.id] || 0) * X_STEP,
      y: Y0 + (levels[n.id] || 0) * Y_STEP,
      properties: n.properties || {}
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      from: e.source,
      to: e.target,
      condition: e.properties && e.properties.expression ? e.properties.expression : "",
      isDefault: !!e.isDefault,
      properties: e.properties || {}
    }))
  };

  if (workflowRequiresBudget(nodes)) {
    const raw = meta?.totalBudget;
    const num = raw !== "" && raw != null ? Number(raw) : 0;
    payload.meta = { totalBudget: Number.isFinite(num) ? num : 0 };
  }

  return payload;
}

/** Parse stored workflowJson object into nodes, edges, meta. */
export function parseStoredWorkflow(raw) {
  if (!raw || typeof raw !== "object") {
    return { nodes: [], edges: [], meta: { totalBudget: "" } };
  }
  const metaBudget = raw.meta?.totalBudget;
  return {
    nodes: raw.nodes || [],
    edges: raw.edges || [],
    meta: {
      totalBudget: metaBudget != null && metaBudget !== "" ? String(metaBudget) : ""
    }
  };
}
