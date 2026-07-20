import React from "react";
import { NODE_TYPES, CAT_KEYS, CAT_NAMES, CAT_DOTS } from "./constants.js";

// Left sidebar in the editor view — draggable palette of every node type,
// grouped by category (Trigger / Condition / Action).
export default function Toolbox({ onQuickAdd, onDragStart, onDragEnd }) {
  return (
    <aside className="cb-sidebar">
      <h2>Thư Viện Khối</h2>
      <p className="cb-sidebar-desc">
        Kéo vào nút <strong style={{ color: "#6366f1" }}>+</strong>, hoặc click để thêm nhanh.
      </p>

      {CAT_KEYS.map(cat => (
        <div key={cat} className="cb-toolbox-group">
          <div className="cb-toolbox-header">
            <span className={"cb-dot " + CAT_DOTS[cat]} />
            <h3>{CAT_NAMES[cat]}</h3>
          </div>
          <div className="cb-toolbox-cards">
            {Object.entries(NODE_TYPES)
              .filter(([, meta]) => meta.cat === cat)
              .map(([type, meta]) => (
                <div
                  key={type}
                  className={"cb-toolbox-card cb-card-" + cat}
                  draggable
                  onClick={() => onQuickAdd(type)}
                  onDragStart={e => {
                    e.dataTransfer.setData("text/plain", type);
                    onDragStart(type);
                  }}
                  onDragEnd={onDragEnd}
                >
                  <div className="cb-card-details">
                    <h4>{meta.name}</h4>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "center", marginTop: 4 }}>
        Delete để xóa khối đang chọn
      </div>
    </aside>
  );
}
