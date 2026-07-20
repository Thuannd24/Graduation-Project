import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { getNodeSummary, getTriggerLabel, getNodeCategoryLabel, stripNodeDisplayName } from "../../utils/nodeDisplay.js";
import { getConditionBranchSummary } from "../../utils/branchDisplay.js";

function WorkflowNode({ data }) {
  const n = data.wfNode;
  const cat = data.cat;
  const sel = data.selected;
  const hasError = data.hasError;

  let title;
  let subtitle;

  if (n.id === "start") {
    title = getTriggerLabel(n.type);
    subtitle = null;
  } else if (n.id === "end") {
    title = "Kết thúc";
    subtitle = null;
  } else if (cat === "condition") {
    title = stripNodeDisplayName(n.name) || getNodeCategoryLabel(n.type);
    subtitle = getConditionBranchSummary(n, data.edges) || "Chưa cấu hình nhánh IF";
  } else {
    title = stripNodeDisplayName(n.name) || getNodeCategoryLabel(n.type);
    subtitle = getNodeSummary(n) || null;
  }

  const shapeClass =
    n.id === "start" ? "cb-shape-start cb-node-trigger"
      : n.id === "end" ? "cb-shape-end cb-node-end"
        : cat === "condition" ? "cb-shape-block cb-shape-condition cb-node-condition"
          : "cb-shape-block cb-shape-action cb-node-action";

  return (
    <div className={`cb-rf-node ${shapeClass}${sel ? " selected" : ""}${hasError ? " has-error" : ""}`}>
      {n.id !== "start" && (
        <Handle type="target" position={Position.Top} className="cb-rf-handle" />
      )}
      <span className="cb-shape-line cb-shape-line-strong">{title}</span>
      {subtitle && (
        <span className="cb-shape-line cb-shape-line-sub">{subtitle}</span>
      )}
      {hasError && <span className="cb-node-error-dot" title="Có lỗi cấu hình">!</span>}
      {n.id !== "end" && (
        <Handle type="source" position={Position.Bottom} className="cb-rf-handle" />
      )}
      {cat === "condition" && (
        <>
          <Handle type="source" position={Position.Left} id="branchLeft" className="cb-rf-handle" />
          <Handle type="source" position={Position.Right} id="branchRight" className="cb-rf-handle" />
        </>
      )}
    </div>
  );
}

export default memo(WorkflowNode);
