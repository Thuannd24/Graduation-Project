import { NODE_TYPES } from "../constants.js";
import { getLevels } from "./graph.js";

function isCondition(nodes, id) {
  const n = nodes.find(x => x.id === id);
  return n && NODE_TYPES[n.type]?.cat === "condition";
}

// All outgoing branches of a condition: every IF edge (N >= 1) plus the single Else edge.
// Order matches the edges array (insertion order from addBranch/ensureConditionBranches).
export function getCondBranches(edges, condId) {
  const all = edges.filter(e => e.source === condId);
  return {
    ifEdges: all.filter(e => !e.isDefault),
    elseEdge: all.find(e => e.isDefault),
    all
  };
}

// A condition is "nested" only if it's reached through exactly one incoming edge whose
// source (possibly through a chain of plain single-incoming action nodes) is a condition.
// A node with 2+ incoming edges is a reconvergence point, not nested one level down.
function findParentConditionId(nodeId, nodes, edges) {
  let curr = nodeId;
  const seen = new Set();
  while (curr && !seen.has(curr)) {
    seen.add(curr);
    const incs = edges.filter(e => e.target === curr);
    if (incs.length !== 1) return null;
    const src = incs[0].source;
    if (isCondition(nodes, src)) return src;
    curr = src;
  }
  return null;
}

function conditionDepth(cid, nodes, edges) {
  let d = 0;
  let p = findParentConditionId(cid, nodes, edges);
  const seen = new Set([cid]);
  while (p && !seen.has(p)) {
    d++;
    seen.add(p);
    p = findParentConditionId(p, nodes, edges);
  }
  return d;
}

// Finds the first node present in every branch's accumulated set (checked after each
// simultaneous BFS round, so the first hit is always the shallowest shared node).
function findIntersection(branches) {
  if (!branches.length) return null;
  const [first, ...rest] = branches;
  for (const node of first.accumulated) {
    if (rest.every(b => b.accumulated.has(node))) return node;
  }
  return null;
}

// Resolves where a single condition's branches truly reconverge, walking all branches
// simultaneously one hop per round. A branch that reaches an already-resolved nested
// condition collapses past it (jumps straight to that condition's own joinNode next round)
// instead of re-walking its internals - this is what lets nesting compose across levels
// without re-deriving already-solved subtrees. A branch that reaches a dead end (no
// outgoing edges - "end" included) simply stops growing; if no common node ever appears,
// joinNode is null (never a false-positive fallback to "end").
function resolveJoin(cid, nodes, edges, resolved) {
  const { ifEdges, elseEdge } = getCondBranches(edges, cid);
  const branchEdges = elseEdge ? [...ifEdges, elseEdge] : [...ifEdges];
  if (branchEdges.length < 2) return { branchEdges, joinNode: branchEdges[0]?.target ?? null };

  const branches = branchEdges.map(e => ({
    accumulated: new Set([e.target]),
    frontier: new Set([e.target])
  }));

  const maxRounds = nodes.length + 5;
  let joinNode = findIntersection(branches);
  let round = 0;
  while (joinNode === null && round < maxRounds) {
    round++;
    let anyGrew = false;
    branches.forEach(b => {
      const nextFrontier = new Set();
      b.frontier.forEach(f => {
        if (f === cid) return; // safety: never loop back into the condition itself
        const child = resolved.get(f);
        if (child) {
          // f is itself a resolved nested condition - collapse past its internals.
          if (child.joinNode != null && !b.accumulated.has(child.joinNode)) {
            nextFrontier.add(child.joinNode);
          }
        } else if (isCondition(nodes, f)) {
          // Defensive fallback (shouldn't happen given decreasing-level processing order):
          // treat an unresolved condition as a plain pass-through via all its own edges.
          edges.filter(e => e.source === f).forEach(e => {
            if (!b.accumulated.has(e.target)) nextFrontier.add(e.target);
          });
        } else {
          edges.filter(e => e.source === f).forEach(e => {
            if (!b.accumulated.has(e.target)) nextFrontier.add(e.target);
          });
        }
      });
      if (nextFrontier.size) anyGrew = true;
      nextFrontier.forEach(n => b.accumulated.add(n));
      b.frontier = nextFrontier;
    });
    joinNode = findIntersection(branches);
    if (!anyGrew && joinNode === null) break;
  }

  return { branchEdges, joinNode };
}

// Full topology resolution for every condition in the graph: its branch edges (N-ary),
// its true reconvergence node (however deep/nested), and its nesting depth. Processes
// conditions deepest-level-first so a nested child's join is always resolved before its
// parent needs to collapse past it (any condition reachable forward from `cid` necessarily
// has a strictly greater level, since `getLevels` is a longest-path fixpoint).
export function resolveBranchStructure(nodes, edges) {
  const conditionIds = nodes
    .filter(n => NODE_TYPES[n.type]?.cat === "condition")
    .map(n => n.id);
  const levels = getLevels(nodes, edges);
  const order = conditionIds.slice().sort((a, b) => (levels[b] ?? 0) - (levels[a] ?? 0));

  const resolved = new Map();
  order.forEach(cid => {
    const { branchEdges, joinNode } = resolveJoin(cid, nodes, edges, resolved);
    resolved.set(cid, {
      branchEdges,
      joinNode,
      parentId: findParentConditionId(cid, nodes, edges),
      depth: conditionDepth(cid, nodes, edges)
    });
  });
  return resolved;
}
