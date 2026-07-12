import React, { memo } from "react";
import { BaseEdge } from "@xyflow/react";

/** Nhánh ngang từ junction → tag (orthogonal, không trùng line) */
function ForkArmEdge({ id, sourceX, sourceY, targetX, targetY }) {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${sourceY} L ${targetX} ${targetY}`;
  return <BaseEdge id={id} path={path} style={{ stroke: "#64748b", strokeWidth: 2 }} />;
}

export default memo(ForkArmEdge);
