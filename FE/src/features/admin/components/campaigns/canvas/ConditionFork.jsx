import React from "react";

function BranchArm({ edge, side, label, nodeId, insertEdgeId, setInsertEdgeId, insertNode }) {
  return (
    <div className={`cb-fork-arm cb-fork-arm-${side}`}>
      <span
        className="cb-branch-label"
        id={nodeId ? `cb-fork-label-${nodeId}-${side}` : undefined}
      >
        {label}
      </span>
      <div className="cb-fork-arm-track" aria-hidden="true" />
      {edge ? (
        <button
          type="button"
          className={`cb-fork-plus${insertEdgeId === edge.id ? " active" : ""}`}
          id={`cb-fork-plus-${edge.id}`}
          title="Kéo-thả hoặc click để chèn khối"
          onClick={e => {
            e.stopPropagation();
            setInsertEdgeId(prev => (prev === edge.id ? null : edge.id));
          }}
          onDragOver={e => {
            e.preventDefault();
            e.currentTarget.classList.add("drag-over");
          }}
          onDragLeave={e => e.currentTarget.classList.remove("drag-over")}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.classList.remove("drag-over");
            const t = e.dataTransfer.getData("text/plain");
            if (t) insertNode(edge.id, t);
          }}
        >
          +
        </button>
      ) : (
        <div className="cb-fork-plus-placeholder" />
      )}
    </div>
  );
}

export default function ConditionFork({
  nodeId,
  edges,
  insertEdgeId,
  setInsertEdgeId,
  insertNode
}) {
  const outgoing = edges.filter(e => e.source === nodeId);
  const ifEdges = outgoing.filter(e => !e.isDefault);
  const elseEdge = outgoing.find(e => e.isDefault);
  const primaryIf = ifEdges[0];

  return (
    <div className="cb-fork" id={`cb-fork-${nodeId}`} onClick={e => e.stopPropagation()}>
      <div className="cb-fork-stem-in" aria-hidden="true" />
      <div className="cb-fork-rail">
        <BranchArm
          edge={primaryIf}
          side="left"
          label="Đúng"
          nodeId={nodeId}
          insertEdgeId={insertEdgeId}
          setInsertEdgeId={setInsertEdgeId}
          insertNode={insertNode}
        />
        <BranchArm
          edge={elseEdge}
          side="right"
          label="Sai"
          nodeId={nodeId}
          insertEdgeId={insertEdgeId}
          setInsertEdgeId={setInsertEdgeId}
          insertNode={insertNode}
        />
      </div>
      <div className="cb-fork-merge" id={`cb-fork-merge-${nodeId}`} aria-hidden="true" />
      <div className="cb-fork-stem-out" aria-hidden="true" />
      {ifEdges.length > 1 && (
        <small className="cb-fork-extra">
          +{ifEdges.length - 1} nhánh IF — panel phải
        </small>
      )}
    </div>
  );
}
