import React from "react";

/** Workflow trống: đường nối liền mạch, ô nét đứt chỉ khi kéo */
export default function DropZone({
  edgeId,
  label,
  dragType,
  insertEdgeId,
  setInsertEdgeId,
  insertNode
}) {
  const active = insertEdgeId === edgeId;
  const isDragging = !!dragType;

  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.dataTransfer.getData("text/plain");
    if (t) insertNode(edgeId, t);
  };

  return (
    <div
      className="cb-spine-drop"
      id={`cb-drop-${edgeId}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="cb-branch-drop-overlay cb-spine-drop-overlay" aria-hidden="true">
          <span className="cb-branch-drop-hint">{label}</span>
        </div>
      )}

      <button
        type="button"
        className={[
          "cb-branch-plus",
          "cb-spine-plus",
          active ? "active" : "",
          isDragging ? "drag-over" : ""
        ].filter(Boolean).join(" ")}
        title={label}
        onClick={e => {
          e.stopPropagation();
          setInsertEdgeId(prev => (prev === edgeId ? null : edgeId));
        }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
      >
        +
      </button>
    </div>
  );
}
