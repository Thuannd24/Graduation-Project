import React from "react";
import { MultiSelect } from "./OptionList.jsx";

const INFO_BOX_STYLE = {
  background: "#e8f4fd",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #b3e5fc"
};
const INFO_TEXT_STYLE = { color: "#0277bd", fontWeight: 600 };

export default function ConditionFields({ node, updateProp, lookup }) {
  const categories = lookup?.categories || [];

  switch (node.type) {
    // Rank is configured per-branch below, not here.
    case "Condition_MemberRank":
      return (
        <div className="cb-fg" style={INFO_BOX_STYLE}>
          <small style={INFO_TEXT_STYLE}>
            Cấu hình từng hạng IF ở mục &quot;Điều kiện rẽ nhánh&quot;. Else khi không khớp.
          </small>
        </div>
      );

    // Threshold amount is configured per-branch below; daysLookback stays here (BE reads it).
    case "Condition_TotalSpending":
      return (
        <>
          <div className="cb-fg" style={INFO_BOX_STYLE}>
            <small style={INFO_TEXT_STYLE}>
              Cấu hình ngưỡng IF ở mục &quot;Điều kiện rẽ nhánh&quot;. Else khi không đạt.
            </small>
          </div>
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

    // Province is configured per-branch, not here.
    case "Condition_Location":
      return null;

    // targetIds restricts voucher redemption scope - separate from branch routing.
    case "Condition_ContainsCategory": {
      const arr = Array.isArray(node.properties.targetIds) ? node.properties.targetIds.map(String) : [];
      const options = categories.map(c => ({ value: String(c.id), label: c.path }));
      return (
        <div className="cb-fg">
          <label>Giới hạn redeem: danh mục được phép</label>
          <MultiSelect
            options={options}
            value={arr}
            onChange={next => updateProp("targetIds", next)}
            emptyText="Không tải được danh mục"
            size={8}
          />
          <small>Voucher chiến dịch này chỉ redeem được cho đơn có 1 trong các danh mục đã chọn. Để trống = không giới hạn.</small>
        </div>
      );
    }

    case "Condition_ContainsProduct": {
      const arr = Array.isArray(node.properties.targetIds) ? node.properties.targetIds.map(String) : [];
      return (
        <div className="cb-fg">
          <label>Giới hạn redeem: mã sản phẩm được phép (ID)</label>
          <input
            type="text"
            value={arr.join(", ")}
            placeholder="Để trống = không giới hạn, hoặc nhập ID cách nhau bằng dấu phẩy"
            onChange={e => updateProp(
              "targetIds",
              e.target.value.split(",").map(s => s.trim()).filter(Boolean)
            )}
          />
          <small>Voucher chiến dịch này chỉ redeem được cho đơn có 1 trong các sản phẩm đã chọn. Để trống = không giới hạn.</small>
        </div>
      );
    }

    default:
      return null;
  }
}
