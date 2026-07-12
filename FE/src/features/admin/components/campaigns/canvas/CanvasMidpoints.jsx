import React, { Fragment } from "react";
import { NODE_TYPES } from "../constants.js";
import { getEdgeMidpoint, isEmptyWorkflow } from "../utils/graph.js";
import { shouldDrawEdge } from "../utils/edgeDraw.js";
import { computeEdgeAnchors } from "./anchors.js";

export default function CanvasMidpoints({
  nodes,
  edges,
  columns,
  canvasRef,
  version,
  setInsertEdgeId,
  insertNode
}) {
  const empty = isEmptyWorkflow(nodes, edges);

  return (
    <>
      {edges.map(edge => {
        if (!shouldDrawEdge(edge, nodes, edges, columns)) return null;

        const src = nodes.find(n => n.id === edge.source);
        const isConditionOut = src && NODE_TYPES[src.type]?.cat === "condition";
        if (isConditionOut) return null;

        if (empty && edge.source === "start" && edge.target === "end") return null;

        const a = computeEdgeAnchors(edge, nodes, edges, canvasRef.current, columns);
        if (!a) return null;

        const pathOpts = { branchSide: a.branchSide, mergeY: a.mergeY, isSpine: a.isSpine };
        const { mx, my } = getEdgeMidpoint(a.sx, a.sy, a.ex, a.ey, pathOpts);

        return (
          <Fragment key={"mid_" + edge.id + "_" + version}>
            <div
              className="cb-midpoint"
              style={{ left: mx, top: my }}
              title="Kéo-thả hoặc click để chèn khối"
              onClick={e => {
                e.stopPropagation();
                setInsertEdgeId(prev => (prev === edge.id ? null : edge.id));
              }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
              onDragLeave={e => e.currentTarget.classList.remove("drag-over")}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag-over");
                const t = e.dataTransfer.getData("text/plain");
                if (t) insertNode(edge.id, t);
              }}
            >
              +
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
