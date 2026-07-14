import React from "react";
import { NODE_TYPES } from "../constants.js";

/** Nhánh trống: + xanh trên đường nối; ô nét đứt chỉ khi đang kéo */
export default function BranchArmSlot({
  edge,
  dragType,
  insertEdgeId,
  setInsertEdgeId,
  insertNode,
  hint = "Kéo item tiếp theo vào đây"
}) {
  if (!edge) return null;

  const active = insertEdgeId === edge.id;
  const dragMeta = dragType ? NODE_TYPES[dragType] : null;
  const dragAllowed = dragMeta && dragMeta.cat !== "trigger";
  const isDragging = !!dragType;
  const showOverlay = isDragging && dragAllowed;

  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.dataTransfer.getData("text/plain");
    if (t) insertNode(edge.id, t);
  };

  return (
    <div
      className="cb-branch-arm-track"
      onDragOver={e => {
        if (isDragging && !dragAllowed) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
    >
      {showOverlay && (
        <div className="cb-branch-drop-overlay" aria-hidden="true">
          <span className="cb-branch-drop-hint">{hint}</span>
        </div>
      )}

      <button
        type="button"
        className={[
          "cb-branch-plus",
          active ? "active" : "",
          showOverlay ? "drag-over" : ""
        ].filter(Boolean).join(" ")}
        id={`cb-fork-plus-${edge.id}`}
        title={hint}
        onClick={e => {
          e.stopPropagation();
          setInsertEdgeId(prev => (prev === edge.id ? null : edge.id));
        }}
        onDragOver={e => {
          if (isDragging && !dragAllowed) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={onDrop}
      >
        +
      </button>
    </div>
  );
}
