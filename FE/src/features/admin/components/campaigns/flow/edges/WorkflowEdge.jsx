import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import { branchRailPath } from "../flowLayout.js";

function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}) {
  const dx = Math.abs(sourceX - targetX);
  const dy = Math.abs(sourceY - targetY);
  const useStraight = data?.straight || (dx < 12 && dy > 8);

  const step = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: useStraight ? 0 : 6,
    offset: useStraight ? 0 : undefined
  });

  const path =
    data?.railY != null
      ? branchRailPath(sourceX, sourceY, targetX, targetY, data.railY)
      : useStraight && dx < 12
        ? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
        : useStraight
          ? branchRailPath(sourceX, sourceY, targetX, targetY)
          : step[0];
  const labelX = useStraight ? (sourceX + targetX) / 2 : step[1];
  const labelY = useStraight
    ? dx < 12
      ? (sourceY + targetY) / 2
      : sourceY + (targetY - sourceY) * 0.45
    : step[2];

  const showPlus = data?.insertable && data?.wfEdgeId && data?.dragType;

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
              data.onInsertClick?.(data.wfEdgeId, data.mergeInsert);
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const t = e.dataTransfer.getData("text/plain");
              if (t && data.onInsertDrop) data.onInsertDrop(data.wfEdgeId, t, data.mergeInsert);
            }}
          >
            +
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(WorkflowEdge);
