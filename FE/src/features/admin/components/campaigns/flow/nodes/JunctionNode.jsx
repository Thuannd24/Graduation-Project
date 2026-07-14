import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";

/** Điểm giao fork — anchor ẩn, handle trái/phải cho nhánh */
function JunctionNode() {
  return (
    <div className="cb-rf-junction">
      <Handle type="target" position={Position.Top} className="cb-rf-handle" />
      <Handle type="source" position={Position.Left} id="left" className="cb-rf-handle" />
      <Handle type="source" position={Position.Right} id="right" className="cb-rf-handle" />
    </div>
  );
}

export default memo(JunctionNode);
