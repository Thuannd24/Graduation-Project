import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function MergeNode() {
  return (
    <div className="cb-rf-merge">
      <Handle type="target" position={Position.Top} className="cb-rf-handle" />
      <Handle type="source" position={Position.Bottom} className="cb-rf-handle" />
    </div>
  );
}

export default memo(MergeNode);
