import React from "react";
import { NODE_TYPES } from "./constants.js";
import { stripNodeDisplayName } from "./utils/nodeDisplay.js";
import TriggerFields from "./fields/TriggerFields.jsx";
import ConditionFields from "./fields/ConditionFields.jsx";
import ActionFields from "./fields/ActionFields.jsx";
import BranchEditor from "./fields/BranchEditor.jsx";

const ADD_BRANCH_BTN_STYLE = { padding: "2px 8px", fontSize: 9, height: "auto" };
const HEADER_STYLE = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const DISABLED_INPUT_STYLE = { background: "#e2e8f0", fontFamily: "monospace" };

// Right sidebar in the editor view — configures the currently selected node
// (or shows an empty-state hint). For condition nodes it also renders one
// BranchEditor per outgoing edge.
const NODE_ERROR_STYLE = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 6,
  padding: 8,
  marginBottom: 10,
  fontSize: 10,
  color: "#991b1b"
};

export default function PropertyPanel({
  selectedNode,
  nodeErrors = [],
  nodes,
  edges,
  onDeleteNode,
  onChangeTriggerType,
  onUpdateProp,
  onUpdateProps,
  onUpdateName,
  onUpdateEdgeExpr,
  onAddBranch,
  onDeleteBranch,
  lookup
}) {
  return (
    <aside className="cb-sidebar-right" onClick={e => e.stopPropagation()}>
      {selectedNode ? (
        <div key={selectedNode.id}>
          <div className="cb-panel-header" style={HEADER_STYLE}>
            <span>Bảng Cấu Hình Chi Tiết</span>
            {selectedNode.id !== "start" && selectedNode.id !== "end" && (
              <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={onDeleteNode}>
                Xóa
              </button>
            )}
          </div>

          {nodeErrors.length > 0 && (
            <div style={NODE_ERROR_STYLE}>
              <strong style={{ display: "block", marginBottom: 4 }}>
                {nodeErrors.length} lỗi trên khối này
              </strong>
              {nodeErrors.map((e, i) => (
                <div key={i} style={{ marginTop: i ? 4 : 0 }}>
                  {e.field ? `${e.field}: ` : ""}{e.message}
                </div>
              ))}
            </div>
          )}

          <div className="cb-fg">
            <label>Mã Khối Định Danh (ID)</label>
            <input type="text" value={selectedNode.id} disabled style={DISABLED_INPUT_STYLE} />
          </div>

          {selectedNode.id !== "start" && selectedNode.id !== "end" && (
            <div className="cb-fg">
              <label>Tên hiển thị</label>
              <input
                type="text"
                value={stripNodeDisplayName(selectedNode.name) || selectedNode.name}
                onChange={e => onUpdateName(e.target.value)}
              />
            </div>
          )}

          {selectedNode.id === "start" && (
            <div className="cb-fg">
              <label>Loại Sự Kiện Bắt Đầu (Trigger)</label>
              <select value={selectedNode.type} onChange={e => onChangeTriggerType(e.target.value)}>
                <option value="Trigger_Event_NewUser">Đăng ký mới</option>
                <option value="Trigger_Event_OrderSuccess">Mua hàng thành công</option>
                <option value="Trigger_Event_ReviewProduct">Đánh giá sản phẩm</option>
                <option value="Trigger_Timer_Schedule">Hẹn giờ định kỳ</option>
              </select>
            </div>
          )}

          {NODE_TYPES[selectedNode.type]?.cat === "trigger" && (
            <TriggerFields
              node={selectedNode}
              updateProp={onUpdateProp}
              updateProps={onUpdateProps}
            />
          )}
          {NODE_TYPES[selectedNode.type]?.cat === "condition" && (
            <ConditionFields node={selectedNode} updateProp={onUpdateProp} lookup={lookup} />
          )}
          {NODE_TYPES[selectedNode.type]?.cat === "action" && (
            <ActionFields node={selectedNode} updateProp={onUpdateProp} />
          )}

          {NODE_TYPES[selectedNode.type]?.cat === "condition" && (
            <div className="cb-edge-section">
              <div className="cb-fg" style={{ background: "#f9fafb", padding: 8, borderRadius: 6, border: "1px solid #e5e7eb" }}>
                <small style={{ fontSize: 10, color: "#374151", lineHeight: 1.45 }}>
                  Luồng: khách thỏa <strong>IF (Đúng)</strong> đi nhánh trái · không thỏa đi <strong>Else (Sai)</strong>.
                  Mỗi nhánh có thể chèn hành động riêng qua nút <strong>+</strong> trên canvas.
                </small>
              </div>
              <div className="cb-edge-header">
                <label>Nhánh Đúng (IF)</label>
                <button
                  className="cb-btn cb-btn-secondary cb-btn-sm"
                  style={ADD_BRANCH_BTN_STYLE}
                  onClick={() => onAddBranch(selectedNode.id)}
                >
                  Thêm IF
                </button>
              </div>
              {edges
                .filter(e => e.source === selectedNode.id && !e.isDefault)
                .map(edge => {
                  const tgt = nodes.find(n => n.id === edge.target);
                  const rawTarget = tgt ? tgt.name : edge.target;
                  return (
                    <BranchEditor
                      key={edge.id}
                      node={selectedNode}
                      edge={edge}
                      targetName={stripNodeDisplayName(rawTarget) || rawTarget}
                      updateEdgeExpr={onUpdateEdgeExpr}
                      onDelete={() => onDeleteBranch(edge.id)}
                      lookup={lookup}
                    />
                  );
                })}
              <div className="cb-edge-header" style={{ marginTop: 10 }}>
                <label>Nhánh Sai (Else)</label>
              </div>
              {edges
                .filter(e => e.source === selectedNode.id && e.isDefault)
                .map(edge => {
                  const tgt = nodes.find(n => n.id === edge.target);
                  const rawTarget = tgt ? tgt.name : edge.target;
                  return (
                    <BranchEditor
                      key={edge.id}
                      node={selectedNode}
                      edge={edge}
                      targetName={stripNodeDisplayName(rawTarget) || rawTarget}
                      updateEdgeExpr={onUpdateEdgeExpr}
                      onDelete={() => onDeleteBranch(edge.id)}
                      lookup={lookup}
                    />
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <div className="cb-no-sel">
          <p>Chọn một khối trên bản vẽ để cấu hình tham số.</p>
        </div>
      )}
    </aside>
  );
}
