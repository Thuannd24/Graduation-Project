import React from "react";
import { NODE_TYPES } from "../constants.js";

/** Ô trống nét đứt + dấu cộng — giống CMS khi nhánh chưa có node */
export default function BranchDropSlot({
  edge,
  dragType,
  insertEdgeId,
  setInsertEdgeId,
  insertNode,
  hint = "Kéo item vào đây"
}) {
  if (!edge) return null;

  const active = insertEdgeId === edge.id;
  const dragMeta = dragType ? NODE_TYPES[dragType] : null;
  const dragAllowed = dragMeta && dragMeta.cat !== "trigger";
  const isDragging = !!dragType;

  return (
    <div
      className={[
        "cb-branch-slot",
        active ? "active" : "",
        isDragging && dragAllowed ? "cb-branch-slot-highlight" : "",
        isDragging && !dragAllowed ? "cb-branch-slot-disabled" : ""
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
      <span className="cb-branch-slot-plus">+</span>
      {(isDragging && dragAllowed) || !isDragging ? (
        <span className="cb-branch-slot-hint">{hint}</span>
      ) : null}
    </div>
  );
}
