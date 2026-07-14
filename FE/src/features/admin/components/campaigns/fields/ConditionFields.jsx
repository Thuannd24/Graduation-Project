import React from "react";
import { MEMBER_RANKS } from "../constants.js";
import { OptionChecklist, MultiSelect } from "./OptionList.jsx";
import MoneyField from "./MoneyField.jsx";

const INFO_BOX_STYLE = {
  background: "#e8f4fd",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #b3e5fc"
};
const INFO_TEXT_STYLE = { color: "#0277bd", fontWeight: 600 };

function provinceOptions(provinces) {
  if (!Array.isArray(provinces)) return [];
  return provinces.map(p => {
    if (typeof p === "string") return { value: p, label: p };
    const name = p?.name || p?.provinceName || String(p?.code ?? "");
    return { value: name, label: name };
  }).filter(o => o.value);
}

export default function ConditionFields({ node, updateProp, lookup }) {
  const provinces = lookup?.provinces || [];
  const categories = lookup?.categories || [];

  switch (node.type) {
    case "Condition_MemberRank": {
      const arr = Array.isArray(node.properties.allowedRanks) ? node.properties.allowedRanks : [];
      return (
        <>
          <div className="cb-fg" style={INFO_BOX_STYLE}>
            <small style={INFO_TEXT_STYLE}>
              Cấu hình từng hạng IF ở mục &quot;Điều kiện rẽ nhánh&quot;. Else khi không khớp.
            </small>
          </div>
          <div className="cb-fg">
            <label>Hạng thành viên được phép</label>
            <OptionChecklist
              options={MEMBER_RANKS}
              value={arr}
              onChange={next => updateProp("allowedRanks", next)}
            />
            {!arr.length && (
              <small style={{ color: "#dc2626", fontSize: 10 }}>Chọn ít nhất 1 hạng</small>
            )}
          </div>
        </>
      );
    }

    case "Condition_TotalSpending":
      return (
        <>
          <div className="cb-fg" style={INFO_BOX_STYLE}>
            <small style={INFO_TEXT_STYLE}>
              Cấu hình ngưỡng IF ở mục &quot;Điều kiện rẽ nhánh&quot;. Else khi không đạt.
            </small>
          </div>
          <MoneyField
            label="Ngưỡng chi tiêu tham chiếu (VNĐ)"
            value={node.properties.minSpendingAmount ?? 5000000}
            onChange={v => updateProp("minSpendingAmount", v)}
            min={0}
          />
          <div className="cb-fg">
            <label>Khoảng thống kê</label>
            <select
              value={node.properties.daysLookback ?? 30}
              onChange={e => updateProp("daysLookback", Number(e.target.value))}
            >
              <option value={7}>7 ngày gần nhất</option>
              <option value={30}>30 ngày gần nhất</option>
              <option value={90}>90 ngày gần nhất</option>
            </select>
          </div>
        </>
      );

    case "Condition_Location": {
      const arr = Array.isArray(node.properties.targetProvinces) ? node.properties.targetProvinces : [];
      const options = provinceOptions(provinces);
      return (
        <div className="cb-fg">
          <label>Tỉnh/Thành áp dụng</label>
          <MultiSelect
            options={options}
            value={arr}
            onChange={next => updateProp("targetProvinces", next)}
            emptyText="Không tải được danh sách tỉnh/thành"
            size={8}
          />
          <small>Giữ Ctrl (Windows) hoặc Cmd (Mac) để chọn nhiều tỉnh.</small>
          {!arr.length && (
            <small style={{ color: "#dc2626", fontSize: 10 }}>Chọn ít nhất 1 tỉnh/thành</small>
          )}
        </div>
      );
    }

    case "Condition_ContainsCategory": {
      const arr = Array.isArray(node.properties.targetIds) ? node.properties.targetIds.map(String) : [];
      const options = categories.map(c => ({ value: String(c.id), label: c.path }));
      return (
        <div className="cb-fg">
          <label>Danh mục sản phẩm bắt buộc</label>
          <MultiSelect
            options={options}
            value={arr}
            onChange={next => updateProp("targetIds", next)}
            emptyText="Không tải được danh mục"
            size={8}
          />
          <small>Giữ Ctrl/Cmd để chọn nhiều danh mục.</small>
          {!arr.length && (
            <small style={{ color: "#dc2626", fontSize: 10 }}>Chọn ít nhất 1 danh mục</small>
          )}
        </div>
      );
    }

    case "Condition_ContainsProduct": {
      const arr = Array.isArray(node.properties.targetIds) ? node.properties.targetIds.map(String) : [];
      return (
        <div className="cb-fg">
          <label>Mã sản phẩm bắt buộc (ID)</label>
          <input
            type="text"
            value={arr.join(", ")}
            placeholder="Chọn từng nhánh IF bên dưới hoặc nhập ID"
            onChange={e => updateProp(
              "targetIds",
              e.target.value.split(",").map(s => s.trim()).filter(Boolean)
            )}
          />
          <small>Dùng ô tìm kiếm ở từng nhánh IF để chọn sản phẩm chính xác.</small>
        </div>
      );
    }

    default:
      return null;
  }
}
