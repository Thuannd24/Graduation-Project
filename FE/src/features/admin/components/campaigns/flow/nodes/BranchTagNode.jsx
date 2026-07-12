import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function BranchTagNode({ data }) {
  const sideClass = data.side === "left" ? "cb-branch-tag-true" : "cb-branch-tag-false";
  return (
    <div className={`cb-branch-tag cb-rf-branch-tag ${sideClass}`}>
      <Handle type="target" position={Position.Top} className="cb-rf-handle" />
      {data.label}
      <Handle type="source" position={Position.Bottom} id="out" className="cb-rf-handle" />
    </div>
  );
}

export default memo(BranchTagNode);
