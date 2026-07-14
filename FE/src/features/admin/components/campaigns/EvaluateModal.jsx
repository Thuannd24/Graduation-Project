import React from "react";

const RESULT_LABEL_STYLE = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 };

export default function EvaluateModal({ open, form, result, onChangeForm, onClose, onSubmit, lookup }) {
  if (!open) return null;

  const patch = partial => onChangeForm({ ...form, ...partial });
  const provinces = lookup?.provinces || [];
  const categories = lookup?.categories || [];

  return (
    <div className="cb-modal-overlay" onClick={onClose}>
      <div className="cb-modal" onClick={e => e.stopPropagation()}>
        <div className="cb-modal-header">
          <h2>Giả Lập Quy Trình (Evaluate Camunda)</h2>
          <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="cb-fg">
            <label>
              Chiến dịch: <strong>{form.campaignName}</strong>
              {" "}(Key: <code>{form.processKey}</code>)
            </label>
          </div>
          <div className="cb-fg">
            <label>User ID (BE tự tải hạng thành viên)</label>
            <input
              type="text"
              value={form.userId}
              placeholder="VD: 1"
              onChange={e => patch({ userId: e.target.value })}
            />
          </div>
          <div className="cb-fg">
            <label>Tỉnh/Thành phố nhận hàng</label>
            <select value={form.location} onChange={e => patch({ location: e.target.value })}>
              <option value="">— Chọn tỉnh/thành —</option>
              {provinces.map(p => (
                <option key={p.code} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="cb-fg">
            <label>Danh mục trong giỏ</label>
            <select
              value={form.categories}
              onChange={e => patch({ categories: e.target.value })}
            >
              <option value="">— Chọn danh mục —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.path}</option>
              ))}
            </select>
          </div>
          <div className="cb-fg">
            <label>Sản phẩm trong giỏ (ID)</label>
            <input
              type="text"
              value={form.products}
              placeholder="VD: product UUID"
              onChange={e => patch({ products: e.target.value })}
            />
          </div>
          <div className="cb-fg">
            <label>Biến bổ sung (JSON)</label>
            <textarea
              rows={3}
              value={form.raw}
              placeholder='{"totalAmount": 150000}'
              onChange={e => patch({ raw: e.target.value })}
            />
          </div>

          <div className="cb-modal-actions">
            <button type="button" className="cb-btn cb-btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="cb-btn cb-btn-primary">Chạy Thử Nghiệm</button>
          </div>
        </form>

        {result && (
          <div style={{ marginTop: 12 }}>
            <div style={RESULT_LABEL_STYLE}>Kết quả</div>
            <pre style={{ fontSize: 10, maxHeight: 200, overflow: "auto" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
