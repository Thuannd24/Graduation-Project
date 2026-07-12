import React, { useEffect, useState } from "react";
import { NODE_TYPES } from "../constants.js";
import { buildEdgePath, isEmptyWorkflow } from "../utils/graph.js";
import {
  shouldDrawEdge,
  getMergeStemTarget,
  buildForkBracketPath,
  buildMergeStemPath,
  buildBranchToChildPath,
  buildBranchToMergePath,
  branchSideHasContent,
  findParentCondition
} from "../utils/edgeDraw.js";
import {
  computeEdgeAnchors,
  getForkRailAnchors,
  getMergeStemAnchors,
  getBranchChildAnchors
} from "./anchors.js";

function rectEl(el, canvasEl) {
  const r = el.getBoundingClientRect();
  const c = canvasEl.getBoundingClientRect();
  return {
    cx: r.left - c.left + r.width / 2,
    top: r.top - c.top,
    bottom: r.bottom - c.top
  };
}

function PathLine({ d, version, keyId, arrow = false, hit = false, insertEdge }) {
  if (!d) return null;
  return (
    <g key={keyId + "_" + version}>
      <path
        d={d}
        fill="none"
        stroke="#d1d5db"
        strokeWidth="1.5"
        markerEnd={arrow ? "url(#cb-arr)" : undefined}
      />
      {hit && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth="24"
          style={{ cursor: "cell", pointerEvents: "stroke" }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const t = e.dataTransfer.getData("text/plain");
            if (t) insertEdge(hit, t);
          }}
        />
      )}
    </g>
  );
}

export default function CanvasSVG({ nodes, edges, columns, canvasRef, version, insertEdge }) {
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const empty = isEmptyWorkflow(nodes, edges);
  const canvasEl = canvasRef.current;

  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setDim({ w: Math.max(width, 800), h: Math.max(height, 600) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasRef]);

  const conditionNodes = nodes.filter(n => NODE_TYPES[n.type]?.cat === "condition");

  let emptySpine = null;
  if (empty && canvasEl) {
    const startEl = document.getElementById("cb-node-start");
    const endEl = document.getElementById("cb-node-end");
    if (startEl && endEl) {
      const sr = rectEl(startEl, canvasEl);
      const er = rectEl(endEl, canvasEl);
      emptySpine = `M ${sr.cx} ${sr.bottom} L ${er.cx} ${er.top}`;
    }
  }

  return (
    <svg
      className="cb-svg-overlay"
      width={dim.w}
      height={dim.h}
      style={{ minWidth: "100%", minHeight: "100%" }}
    >
      <defs>
        <marker id="cb-arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0,8 3,0 6" fill="#9ca3af" />
        </marker>
      </defs>

      {emptySpine && (
        <PathLine d={emptySpine} version={version} keyId="empty_spine" arrow />
      )}

      {conditionNodes.map(cn => {
        const rail = getForkRailAnchors(cn.id, canvasEl, columns);
        if (!rail) return null;
        const d = buildForkBracketPath(rail, {
          leftFilled: branchSideHasContent(cn.id, "left", edges, nodes, columns),
          rightFilled: branchSideHasContent(cn.id, "right", edges, nodes, columns)
        });
        return <PathLine key={`fork_${cn.id}`} d={d} version={version} keyId={`fork_${cn.id}`} />;
      })}

      {conditionNodes.flatMap(cn =>
        edges
          .filter(e => e.source === cn.id && e.target !== "end")
          .filter(e => (columns[e.target] ?? 0) !== 0)
          .map(edge => {
            const a = getBranchChildAnchors(edge, canvasEl);
            if (!a) return null;
            const d = buildBranchToChildPath(a.sx, a.sy, a.ex, a.ey);
            return (
              <PathLine
                key={`bchild_${edge.id}`}
                d={d}
                version={version}
                keyId={`bchild_${edge.id}`}
                arrow
              />
            );
          })
      )}

      {nodes
        .filter(n => (columns[n.id] ?? 0) !== 0 && n.id !== "end")
        .map(n => {
          const parentId = findParentCondition(n.id, nodes, edges);
          if (!parentId) return null;
          if (!edges.some(e => e.source === n.id && e.target === "end")) return null;
          const mergeEl = document.getElementById(`cb-fork-merge-${parentId}`);
          const sEl = document.getElementById(`cb-node-${n.id}`);
          if (!mergeEl || !sEl || !canvasEl) return null;
          const sr = rectEl(sEl, canvasEl);
          const mr = rectEl(mergeEl, canvasEl);
          const d = buildBranchToMergePath(sr.cx, sr.bottom, mr.cx, mr.top + 5);
          return (
            <PathLine key={`bmerge_${n.id}`} d={d} version={version} keyId={`bmerge_${n.id}`} />
          );
        })}

      {conditionNodes.map(cn => {
        const targetId = getMergeStemTarget(cn.id, nodes, edges, columns);
        if (!targetId) return null;
        const stem = getMergeStemAnchors(cn.id, targetId, canvasEl);
        if (!stem) return null;
        const d = buildMergeStemPath(stem.cx, stem.mergeBottom, stem.targetTop, stem.targetCx);
        return (
          <PathLine
            key={`stem_${cn.id}_${targetId}`}
            d={d}
            version={version}
            keyId={`stem_${cn.id}_${targetId}`}
            arrow
          />
        );
      })}

      {edges.map(edge => {
        if (!shouldDrawEdge(edge, nodes, edges, columns)) return null;
        if (empty && edge.source === "start" && edge.target === "end") return null;

        const a = computeEdgeAnchors(edge, nodes, edges, canvasEl, columns);
        if (!a) return null;

        const d = buildEdgePath(a.sx, a.sy, a.ex, a.ey, {
          branchSide: a.branchSide,
          mergeY: a.mergeY,
          isSpine: a.isSpine
        });

        return (
          <PathLine
            key={edge.id}
            d={d}
            version={version}
            keyId={edge.id}
            arrow
            hit={edge.id}
            insertEdge={insertEdge}
          />
        );
      })}
    </svg>
  );
}
