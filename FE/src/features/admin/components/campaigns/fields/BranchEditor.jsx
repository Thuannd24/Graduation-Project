import React, { useEffect } from "react";
import { MEMBER_RANKS } from "../constants.js";
import { parseExpression, buildBranchProps, enrichBranchProps } from "../utils/expression.js";
import { formatBranchCondition } from "../utils/branchDisplay.js";
import ProductSearchSelect from "./ProductSearchSelect.jsx";

const HEADER_STYLE = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 6
};
const DELETE_BTN_STYLE = { padding: "1px 6px", fontSize: 9, height: "auto", background: "none" };
const ROW_STYLE = { display: "flex", gap: 6 };
const CELL_STYLE = { flex: 1, marginBottom: 0 };
const PREVIEW_STYLE = {
  fontSize: 10,
  color: "#374151",
  background: "#f3f4f6",
  padding: "6px 8px",
  borderRadius: 4,
  marginBottom: 6
};

function IfBranchForm({ node, edge, commit, lookup }) {
  const nt = node.type;
  const parsed = parseExpression(nt, edge.properties?.expression);
  const provinces = lookup?.provinces || [];
  const categories = lookup?.categories || [];
  const searchProducts = lookup?.searchProducts;

  return (
    <>
      {nt === "Condition_MemberRank" && (
        <div className="cb-fg" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 9 }}>Khi hạng thành viên là</label>
          <select value={parsed.rank || "VIP"} onChange={e => commit({ rank: e.target.value })}>
            {MEMBER_RANKS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {nt === "Condition_TotalSpending" && (
        <div style={ROW_STYLE}>
          <div className="cb-fg" style={CELL_STYLE}>
            <label style={{ fontSize: 9 }}>Phép toán</label>
            <select
              value={parsed.operator || ">="}
              onChange={e => commit({ operator: e.target.value, amount: parsed.amount ?? 5000000 })}
            >
              <option value=">=">≥</option>
              <option value=">">&gt;</option>
              <option value="<=">≤</option>
              <option value="<">&lt;</option>
              <option value="==">=</option>
            </select>
          </div>
          <div className="cb-fg" style={CELL_STYLE}>
            <label style={{ fontSize: 9 }}>Số tiền (VNĐ)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={parsed.amount ?? 5000000}
              onChange={e => commit({ operator: parsed.operator || ">=", amount: Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      {nt === "Condition_AntiFraudScore" && (
        <div style={ROW_STYLE}>
          <div className="cb-fg" style={CELL_STYLE}>
            <label style={{ fontSize: 9 }}>Phép toán</label>
            <select
              value={parsed.operator || "<="}
              onChange={e => commit({ operator: e.target.value, score: parsed.score ?? 50 })}
            >
              <option value="<=">≤</option>
              <option value="<">&lt;</option>
              <option value=">=">≥</option>
              <option value=">">&gt;</option>
              <option value="==">=</option>
            </select>
          </div>
          <div className="cb-fg" style={CELL_STYLE}>
            <label style={{ fontSize: 9 }}>Điểm (1-100)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={parsed.score ?? 50}
              onChange={e => commit({ operator: parsed.operator || "<=", score: Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      {nt === "Condition_Location" && (
        <div className="cb-fg" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 9 }}>Khi tỉnh/thành là</label>
          <select value={parsed.value || ""} onChange={e => commit({ value: e.target.value })}>
            <option value="">— Chọn tỉnh/thành —</option>
            {provinces.map(p => {
              const name = typeof p === "string" ? p : (p?.name || p?.provinceName || "");
              return name ? <option key={name} value={name}>{name}</option> : null;
            })}
          </select>
        </div>
      )}

      {nt === "Condition_ContainsCategory" && (
        <div className="cb-fg" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 9 }}>Khi có danh mục</label>
          <select value={parsed.value || ""} onChange={e => commit({ value: e.target.value })}>
            <option value="">— Chọn danh mục —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.path}</option>
            ))}
          </select>
        </div>
      )}

      {nt === "Condition_ContainsProduct" && searchProducts && (
        <div className="cb-fg" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 9 }}>Khi có sản phẩm</label>
          <ProductSearchSelect
            value={parsed.value || ""}
            onChange={v => commit({ value: v })}
            searchProducts={searchProducts}
          />
        </div>
      )}

      <div style={PREVIEW_STYLE}>
        Điều kiện: <strong>{formatBranchCondition(nt, edge) || "Chưa đặt"}</strong>
      </div>
    </>
  );
}

export default function BranchEditor({ node, edge, updateEdgeExpr, onDelete, targetName, lookup }) {
  const nt = node.type;

  if (edge.isDefault) {
    return (
      <div className="cb-edge-card cb-edge-default">
        <div style={HEADER_STYLE}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>Nhánh Sai (Else)</span>
        </div>
        <small style={{ display: "block", fontSize: 10, color: "#64748b" }}>
          Chạy khi <strong>không</strong> khớp nhánh Đúng nào → <strong>{targetName}</strong>
        </small>
        <small style={{ display: "block", fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
          Không cần cấu hình điều kiện. Dùng nút + trên nhánh Sai để chèn hành động.
        </small>
      </div>
    );
  }

  const commit = params => updateEdgeExpr(edge.id, buildBranchProps(nt, params));

  useEffect(() => {
    const props = edge.properties || {};
    if (props.operator && props.expression) return;
    updateEdgeExpr(edge.id, enrichBranchProps(nt, props));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge.id, nt]);

  return (
    <div className="cb-edge-card">
      <div style={HEADER_STYLE}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>Nhánh Đúng (IF)</span>
        <button className="cb-btn cb-btn-danger cb-btn-sm" style={DELETE_BTN_STYLE} onClick={onDelete}>
          Xóa
        </button>
      </div>
      <small style={{ display: "block", fontSize: 9, color: "#64748b", marginBottom: 6 }}>
        Khi thỏa điều kiện → <strong>{targetName}</strong>
      </small>
      <IfBranchForm node={node} edge={edge} commit={commit} lookup={lookup} />
    </div>
  );
}
