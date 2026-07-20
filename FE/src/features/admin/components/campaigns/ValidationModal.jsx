import React from "react";

// Validation results — shown on demand after "Kiểm tra sơ đồ" instead of a permanent bottom
// panel, so the canvas keeps the full editor height. Clicking an error jumps to that node and
// closes the modal so the PropertyPanel (now visible) can be used to fix it right away.
export default function ValidationModal({
  open,
  validating,
  result,
  editingId,
  onClose,
  onOpenDeploy,
  onSelectErrorNode
}) {
  if (!open) return null;

  const errors = result?.errors || [];

  return (
    <div className="cb-modal-overlay" onClick={onClose}>
      <div className="cb-modal" onClick={e => e.stopPropagation()}>
        <div className="cb-modal-header">
          <h2>🔍 Kết Quả Kiểm Tra Sơ Đồ</h2>
          <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={onClose}>✕</button>
        </div>

        {validating && (
          <div className="cb-val-summary cb-val-info">⚡ Đang kiểm tra cấu hình quy trình từ server…</div>
        )}

        {!validating && !result && (
          <div className="cb-val-summary cb-val-info">Chưa có kết quả kiểm tra.</div>
        )}

        {!validating && result && (
          <>
            <div className={"cb-val-summary " + (result.valid ? "cb-val-success" : "cb-val-failed")}>
              {result.valid
                ? "✅ Cấu hình hợp lệ! Có thể tiến hành Triển khai."
                : "❌ Tìm thấy " + errors.length + " lỗi cần chỉnh sửa trước khi deploy."}
            </div>

            {errors.length > 0 && (
              <div className="cb-val-errors">
                {errors.map((err, i) => (
                  <button
                    type="button"
                    key={i}
                    className={"cb-val-card" + (err.nodeId ? " cb-val-card-click" : "")}
                    onClick={() => {
                      if (!err.nodeId) return;
                      onSelectErrorNode?.(err.nodeId);
                      onClose();
                    }}
                    disabled={!err.nodeId}
                  >
                    <div className="cb-val-card-header">
                      <span>Khối: {err.nodeId || "Hệ thống"}</span>
                      <span>{err.errorType ? err.errorType.replace(/_/g, " ").toUpperCase() : "LỖI"}</span>
                    </div>
                    {err.field && <div className="cb-val-card-field">Trường: {err.field}</div>}
                    <div className="cb-val-card-msg">{err.message}</div>
                  </button>
                ))}
              </div>
            )}

            {result.valid && (
              <div className="cb-modal-actions">
                <button
                  className="cb-btn cb-btn-primary"
                  onClick={() => { onClose(); onOpenDeploy(); }}
                >
                  {editingId ? "💾 Cập nhật ngay" : "🚀 Triển khai ngay"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
