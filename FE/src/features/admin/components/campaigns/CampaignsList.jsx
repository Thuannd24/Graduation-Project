import React from "react";

const KEY_STYLE = { fontSize: 10, background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 };
const DATE_CELL_STYLE = { fontSize: 10 };
const EMPTY_STYLE = { padding: 24, color: "#94a3b8" };

const toggleBtnStyle = active => ({
  border: "1px solid #e2e8f0",
  background: active ? "#fef7e0" : "#e8f5e9",
  color:      active ? "#d97706" : "#059669"
});

// Full-page table shown in the "list" view (also reused as the compact table
// inside the bottom-panel campaigns tab via `compact`).
export default function CampaignsList({
  campaigns,
  loading,
  compact = false,
  onEdit,
  onToggleActive,
  onEvaluate,
  onDelete
}) {
  if (loading) {
    return <div className="cb-text-center" style={{ padding: 40 }}>⏳ Đang tải danh sách…</div>;
  }

  return (
    <table className="cb-table">
      <thead>
        {compact ? (
          <tr>
            <th>ID</th><th>Tên</th><th>Mã BPMN Key</th>
            <th>Ngân Sách</th><th>Trạng Thái</th><th>Thao Tác</th>
          </tr>
        ) : (
          <tr>
            <th>ID</th><th>Tên Chiến Dịch</th><th>Mã BPMN Key</th>
            <th>Ngân Sách Còn Lại</th><th>Thời Gian Hiệu Lực</th>
            <th>Trạng Thái</th><th>Thao Tác Quản Lý</th>
          </tr>
        )}
      </thead>
      <tbody>
        {campaigns.length === 0 && (
          <tr>
            <td colSpan={compact ? 6 : 7} className="cb-text-center" style={EMPTY_STYLE}>
              Chưa có chiến dịch nào.
            </td>
          </tr>
        )}

        {campaigns.map(c => {
          const rem = Number(c.remainingBudget || 0).toLocaleString("vi-VN");
          const tot = Number(c.totalBudget || 0).toLocaleString("vi-VN");
          const badge = (
            <span className={"cb-badge " + (c.active ? "cb-badge-active" : "cb-badge-suspended")}>
              {c.active ? "KÍCH HOẠT" : "TẠM NGỪNG"}
            </span>
          );
          const actions = (
            <div className="cb-flex-gap">
              <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={() => onEdit(c)}>
                {compact ? "✏️" : "✏️ Sửa"}
              </button>
              <button
                className="cb-btn cb-btn-sm"
                style={toggleBtnStyle(c.active)}
                onClick={() => onToggleActive(c.id, c.active)}
              >
                {compact
                  ? (c.active ? "⏸" : "▶")
                  : (c.active ? "⏸ Tạm ngưng" : "▶ Kích hoạt")}
              </button>
              <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => onEvaluate(c)}>
                {compact ? "⚡" : "⚡ Test"}
              </button>
              <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={() => onDelete(c.id, c.name)}>
                {compact ? "🗑️" : "🗑️ Xóa"}
              </button>
            </div>
          );

          if (compact) {
            return (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td><code style={{ ...KEY_STYLE, fontSize: 9 }}>{c.bpmnProcessDefinitionKey}</code></td>
                <td>{tot}đ</td>
                <td>{badge}</td>
                <td>{actions}</td>
              </tr>
            );
          }
          return (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td><code style={KEY_STYLE}>{c.bpmnProcessDefinitionKey}</code></td>
              <td>{rem} / {tot} đ</td>
              <td style={DATE_CELL_STYLE}>
                <div>Bắt đầu: {c.startDate ? new Date(c.startDate).toLocaleString("vi-VN") : ""}</div>
                <div>Kết thúc: {c.endDate ? new Date(c.endDate).toLocaleString("vi-VN") : ""}</div>
              </td>
              <td>{badge}</td>
              <td>{actions}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
