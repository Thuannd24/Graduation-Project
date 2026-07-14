import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import { branchRailPath } from "../flowLayout.js";

/** Tag → merge: xuống dọc rồi ngang vào tâm merge (railY = merge bus) */
function BranchRailEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const path = branchRailPath(sourceX, sourceY, targetX, targetY, data?.railY);
  const labelX = sourceX;
  const labelY = (sourceY + targetY) / 2;
  const showPlus = data?.insertable && data?.wfEdgeId;

  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: "#64748b", strokeWidth: 2 }} />
      {showPlus && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={[
              "cb-branch-plus",
              "cb-rf-edge-plus",
              data.insertEdgeId === data.wfEdgeId ? "active" : "",
              data.dragType ? "drag-over" : ""
            ].filter(Boolean).join(" ")}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all"
            }}
            onClick={e => {
              e.stopPropagation();
              data.onInsertClick?.(data.wfEdgeId);
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const t = e.dataTransfer.getData("text/plain");
              if (t && data.onInsertDrop) data.onInsertDrop(data.wfEdgeId, t);
            }}
          >
            +
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(BranchRailEdge);
