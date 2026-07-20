import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";

/** Điểm giao fork — anchor ẩn, 1 handle dùng chung cho N nhánh (nhiều edge cùng xuất phát) */
function JunctionNode() {
  return (
    <div className="cb-rf-junction">
      <Handle type="target" position={Position.Top} className="cb-rf-handle" />
      <Handle type="source" position={Position.Bottom} className="cb-rf-handle" />
    </div>
  );
}

export default memo(JunctionNode);
