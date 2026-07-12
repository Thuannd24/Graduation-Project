import React from "react";
import { NODE_TYPES } from "../constants.js";
import BranchArmSlot from "./BranchArmSlot.jsx";

function branchHasContent(edge, nodes, columns) {
  if (!edge || edge.target === "end") return false;
  if ((columns[edge.target] ?? 0) === 0) return false;
  return nodes.some(n => n.id === edge.target);
}

function BranchSide({ side, conditionId, edge, nodes, columns, dragType, insertEdgeId, setInsertEdgeId, insertNode }) {
  const hasContent = branchHasContent(edge, nodes, columns);
  return (
    <div className={`cb-branch-side cb-branch-side-${side}`}>
      <span className="cb-branch-tag" id={`cb-fork-label-${conditionId}-${side}`}>
        {side === "left" ? "Đúng" : "Sai"}
      </span>
      {!hasContent && edge && (
        <BranchArmSlot
          edge={edge}
          dragType={dragType}
          insertEdgeId={insertEdgeId}
          setInsertEdgeId={setInsertEdgeId}
          insertNode={insertNode}
        />
      )}
    </div>
  );
}

export default function ConditionBranchRow({
  conditionId,
  nodes,
  edges,
  columns,
  dragType,
  insertEdgeId,
  setInsertEdgeId,
  insertNode
}) {
  const ifEdge = edges.find(e => e.source === conditionId && !e.isDefault);
  const elseEdge = edges.find(e => e.source === conditionId && e.isDefault);
  const condCol = columns[conditionId] ?? 0;
  const isCenter = condCol === 0;

  if (!isCenter) {
    const colClass = condCol < 0 ? "left" : "right";
    return (
      <div className="cb-flow-row-wide cb-branch-row cb-branch-row-local" onClick={e => e.stopPropagation()}>
        <div className="cb-col cb-col-left" />
        <div className="cb-col cb-col-center" />
        <div className={`cb-col cb-col-${colClass} cb-branch-local`}>
          <div className="cb-branch-local-fork">
            <BranchSide
              side="left"
              conditionId={conditionId}
              edge={ifEdge}
              nodes={nodes}
              columns={columns}
              dragType={dragType}
              insertEdgeId={insertEdgeId}
              setInsertEdgeId={setInsertEdgeId}
              insertNode={insertNode}
            />
            <BranchSide
              side="right"
              conditionId={conditionId}
              edge={elseEdge}
              nodes={nodes}
              columns={columns}
              dragType={dragType}
              insertEdgeId={insertEdgeId}
              setInsertEdgeId={setInsertEdgeId}
              insertNode={insertNode}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cb-flow-row-wide cb-branch-row" onClick={e => e.stopPropagation()}>
      <div className="cb-col cb-col-left cb-branch-arm">
        <BranchSide
          side="left"
          conditionId={conditionId}
          edge={ifEdge}
          nodes={nodes}
          columns={columns}
          dragType={dragType}
          insertEdgeId={insertEdgeId}
          setInsertEdgeId={setInsertEdgeId}
          insertNode={insertNode}
        />
      </div>
      <div className="cb-col cb-col-center cb-branch-arm-center" />
      <div className="cb-col cb-col-right cb-branch-arm">
        <BranchSide
          side="right"
          conditionId={conditionId}
          edge={elseEdge}
          nodes={nodes}
          columns={columns}
          dragType={dragType}
          insertEdgeId={insertEdgeId}
          setInsertEdgeId={setInsertEdgeId}
          insertNode={insertNode}
        />
      </div>
    </div>
  );
}
