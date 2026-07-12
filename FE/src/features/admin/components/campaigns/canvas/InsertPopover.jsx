import React, { useMemo } from "react";
import { NODE_TYPES } from "../constants.js";
import { getInsertAnchor } from "./anchors.js";

export default function InsertPopover({ edgeId, edges, canvasRef, onClose, onPick }) {
  const edge = edges.find(e => e.id === edgeId);
  const conditions = useMemo(
    () => Object.entries(NODE_TYPES).filter(([, m]) => m.cat === "condition"),
    []
  );
  const actions = useMemo(
    () => Object.entries(NODE_TYPES).filter(([, m]) => m.cat === "action"),
    []
  );

  if (!edge) return null;
  const c = canvasRef.current;
  const anchor = getInsertAnchor(edge, c);
  if (!anchor) return null;

  return (
    <div
      className="cb-insert-popover"
      style={{ left: anchor.x - 130, top: anchor.y + 16 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="cb-insert-popover-header">
        <h4>Chèn Khối Mới Vào Sơ Đồ</h4>
        <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={onClose}>✕</button>
      </div>
      <div className="cb-insert-group">
        <h5>Điều Kiện Rẽ Nhánh</h5>
        {conditions.map(([type, meta]) => (
          <button key={type} className="cb-insert-btn" onClick={() => onPick(type)}>
            {meta.name}
          </button>
        ))}
      </div>
      <div className="cb-insert-group" style={{ marginTop: 8 }}>
        <h5>Hành Động Nhận Thưởng</h5>
        {actions.map(([type, meta]) => (
          <button key={type} className="cb-insert-btn" onClick={() => onPick(type)}>
            {meta.name}
          </button>
        ))}
      </div>
    </div>
  );
}
