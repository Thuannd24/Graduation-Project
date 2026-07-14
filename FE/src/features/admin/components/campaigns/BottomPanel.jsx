import React from "react";
import CampaignsList from "./CampaignsList.jsx";

const TABS = [
  { k: "validation", l: "🔍 Kết quả kiểm tra (Validation)" },
  { k: "json",       l: "📋 Xem JSON Workflow Graph" },
  { k: "bpmn",       l: "📄 Xem BPMN XML Preview" },
  { k: "campaigns",  l: "📂 Danh Sách Chiến Dịch Đã Chạy" }
];

// Bottom panel of the editor view — 4 stacked tabs sharing the same content
// pane. Validation is the primary one; the other three are diagnostic.
export default function BottomPanel({
  activeTab,
  onChangeTab,
  validating,
  validationResult,
  editingId,
  jsonPreview,
  bpmnPreview,
  campaigns,
  loading,
  onOpenDeploy,
  onCopy,
  onDownloadBpmn,
  onEdit,
  onToggleActive,
  onEvaluate,
  onDelete,
  onSelectErrorNode
}) {
  return (
    <section className="cb-bottom-panel">
      <div className="cb-tabs">
        {TABS.map(t => (
          <button
            key={t.k}
            className={"cb-tab-btn " + (activeTab === t.k ? "active" : "")}
            onClick={() => onChangeTab(t.k)}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 10, background: "#fff" }}>
        <div className={"cb-tab-content " + (activeTab === "validation" ? "active" : "")}>
          <ValidationTabBody
            validating={validating}
            result={validationResult}
            editingId={editingId}
            onOpenDeploy={onOpenDeploy}
            onSelectErrorNode={onSelectErrorNode}
          />
        </div>

        <div className={"cb-tab-content " + (activeTab === "json" ? "active" : "")}>
          <div className="cb-json-bar">
            <span>Cấu trúc JSON Graph gửi lên máy chủ để biên dịch sang định dạng Camunda BPMN XML:</span>
            <button
              className="cb-btn cb-btn-secondary cb-btn-sm"
              onClick={() => onCopy(jsonPreview, "JSON")}
            >
              Sao Chép JSON
            </button>
          </div>
          <div className="cb-code-block"><code>{jsonPreview}</code></div>
        </div>

        <div className={"cb-tab-content " + (activeTab === "bpmn" ? "active" : "")}>
          <div className="cb-json-bar">
            <span>Preview BPMN XML (có layout BPMNDI — mở được trong Camunda Modeler; BE compile lại khi deploy):</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="cb-btn cb-btn-secondary cb-btn-sm"
                onClick={() => onCopy(bpmnPreview, "BPMN XML")}
              >
                Sao Chép XML
              </button>
              <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={onDownloadBpmn}>
                💾 Tải .bpmn
              </button>
            </div>
          </div>
          <div className="cb-code-block"><code>{bpmnPreview}</code></div>
        </div>

        <div className={"cb-tab-content " + (activeTab === "campaigns" ? "active" : "")}>
          <CampaignsList
            compact
            loading={loading}
            campaigns={campaigns}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onEvaluate={onEvaluate}
            onDelete={onDelete}
          />
        </div>
      </div>
    </section>
  );
}

function ValidationTabBody({ validating, result, editingId, onOpenDeploy, onSelectErrorNode }) {
  if (validating) {
    return <div className="cb-val-summary cb-val-info">⚡ Đang kiểm tra cấu hình quy trình từ server…</div>;
  }
  if (!result) {
    return (
      <div className="cb-val-summary cb-val-info">
        Nhấn nút <strong>Kiểm Tra Sơ Đồ</strong> ở góc trên bên phải để bắt đầu quét lỗi cấu hình.
      </div>
    );
  }

  const errors = result.errors || [];
  return (
    <>
      <div className={"cb-val-summary " + (result.valid ? "cb-val-success" : "cb-val-failed")}>
        {result.valid
          ? "✅ Cấu hình hợp lệ! Sơ đồ hoàn toàn đáp ứng các tiêu chuẩn kỹ thuật & quy tắc vận hành. Có thể tiến hành Triển khai."
          : "❌ Cấu hình không hợp lệ! Tìm thấy " + errors.length + " lỗi cần chỉnh sửa trước khi deploy."}
      </div>

      {errors.length > 0 && (
        <div className="cb-val-errors">
          {errors.map((err, i) => (
            <button
              type="button"
              key={i}
              className={"cb-val-card" + (err.nodeId ? " cb-val-card-click" : "")}
              onClick={() => err.nodeId && onSelectErrorNode?.(err.nodeId)}
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
        <button
          className="cb-btn cb-btn-primary cb-btn-sm"
          style={{ marginTop: 8 }}
          onClick={onOpenDeploy}
        >
          {editingId ? "💾 Cập nhật ngay" : "🚀 Triển khai ngay"}
        </button>
      )}
    </>
  );
}
