import React from "react";

// BPMN XML preview — moved out of the old always-visible bottom panel into an on-demand
// modal opened from the header, next to "Căn chỉnh"/"Danh sách".
export default function BpmnModal({ open, bpmnPreview, onClose, onCopy, onDownloadBpmn }) {
  if (!open) return null;

  return (
    <div className="cb-modal-overlay" onClick={onClose}>
      <div className="cb-modal cb-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="cb-modal-header">
          <h2>📄 BPMN XML Preview</h2>
          <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="cb-json-bar">
          <span>Có layout BPMNDI — mở được trong Camunda Modeler; BE compile lại khi deploy.</span>
        </div>
        <div className="cb-code-block"><code>{bpmnPreview}</code></div>

        <div className="cb-modal-actions">
          <button className="cb-btn cb-btn-secondary" onClick={() => onCopy(bpmnPreview, "BPMN XML")}>
            Sao Chép XML
          </button>
          <button className="cb-btn cb-btn-primary" onClick={onDownloadBpmn}>
            💾 Tải .bpmn
          </button>
        </div>
      </div>
    </div>
  );
}
