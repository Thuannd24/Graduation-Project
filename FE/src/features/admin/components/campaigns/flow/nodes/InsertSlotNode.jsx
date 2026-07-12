import React, { memo } from "react";
import { NODE_TYPES } from "../../constants.js";

/** Overlay + trên spine — không tham gia graph (không handle) */
function InsertSlotNode({ data }) {
  const dragMeta = data.dragType ? NODE_TYPES[data.dragType] : null;
  const dragAllowed = dragMeta && dragMeta.cat !== "trigger";
  const isDragging = !!data.dragType;
  const showOverlay = isDragging && dragAllowed;
  const active = data.insertEdgeId === data.wfEdgeId;

  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.dataTransfer.getData("text/plain");
    if (t && data.onInsertDrop) data.onInsertDrop(data.wfEdgeId, t);
  };

  return (
    <div
      className="cb-rf-insert-slot cb-rf-insert-overlay"
      onDragOver={e => { if (!isDragging || dragAllowed) e.preventDefault(); }}
      onDrop={onDrop}
    >
      {showOverlay && (
        <div className="cb-branch-drop-overlay cb-rf-drop-overlay">
          <span className="cb-branch-drop-hint">{data.label}</span>
        </div>
      )}
      <button
        type="button"
        className={["cb-branch-plus", active ? "active" : "", showOverlay ? "drag-over" : ""].filter(Boolean).join(" ")}
        onClick={e => { e.stopPropagation(); data.onInsertClick?.(data.wfEdgeId); }}
        onDrop={onDrop}
      >
        +
      </button>
    </div>
  );
}

export default memo(InsertSlotNode);
