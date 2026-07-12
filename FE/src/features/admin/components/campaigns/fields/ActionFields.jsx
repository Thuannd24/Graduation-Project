import React from "react";
import { UPGRADE_TIERS } from "../constants.js";
import { EMAIL_TEMPLATES } from "../constants/emailTemplates.js";
import MoneyField from "./MoneyField.jsx";
import { validateInt } from "../utils/format.js";
import { formatVnd, reservePerIssue } from "../utils/workflowBudget.js";

const INFO_STYLE = {
  background: "#f0fdf4",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #bbf7d0",
  fontSize: 10,
  color: "#166534"
};
const ERROR_STYLE = { color: "#dc2626", fontSize: 10, marginTop: 2 };

function VoucherBudgetHint({ node }) {
  const reserve = reservePerIssue(node);
  if (!reserve) return null;
  return (
    <div className="cb-fg" style={INFO_STYLE}>
      Mỗi lần phát voucher trừ tối đa <strong>{formatVnd(reserve)}</strong> từ quỹ chiến dịch
      (thiết lập quỹ tổng trên thanh công cụ phía trên canvas).
    </div>
  );
}

function VoucherExpiryHint({ days }) {
  const d = Number(days) || 7;
  return (
    <small style={{ color: "#64748b", fontSize: 10 }}>
      Voucher hết hạn sau <strong>{d} ngày</strong> kể từ lúc phát cho khách.
    </small>
  );
}

export default function ActionFields({ node, updateProp }) {
  switch (node.type) {
    case "Action_IssueVoucher_Percent": {
      const pctErr = validateInt(node.properties.discountPercent, { min: 1, max: 100, label: "Phần trăm" });
      return (
        <>
          <div className="cb-fg">
            <label>Phần trăm giảm giá (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              value={node.properties.discountPercent ?? 10}
              onChange={e => updateProp("discountPercent", Number(e.target.value))}
            />
            {pctErr && <small style={ERROR_STYLE}>{pctErr}</small>}
          </div>
          <MoneyField
            label="Giảm tối đa (VNĐ)"
            value={node.properties.maxDiscountAmount ?? 50000}
            onChange={v => updateProp("maxDiscountAmount", v)}
            min={1000}
          />
          <div className="cb-fg">
            <label>Thời hạn voucher (ngày)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={node.properties.expireDays ?? 7}
              onChange={e => updateProp("expireDays", Number(e.target.value))}
            />
            <VoucherExpiryHint days={node.properties.expireDays} />
          </div>
          <VoucherBudgetHint node={node} />
        </>
      );
    }

    case "Action_IssueVoucher_Fixed":
      return (
        <>
          <MoneyField
            label="Số tiền giảm (VNĐ)"
            value={node.properties.discountAmount ?? 20000}
            onChange={v => updateProp("discountAmount", v)}
            min={1000}
          />
          <MoneyField
            label="Đơn hàng tối thiểu để dùng voucher (VNĐ)"
            value={node.properties.minOrderValue ?? 150000}
            onChange={v => updateProp("minOrderValue", v)}
            min={0}
          />
          <div className="cb-fg">
            <label>Thời hạn voucher (ngày)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={node.properties.expireDays ?? 7}
              onChange={e => updateProp("expireDays", Number(e.target.value))}
            />
            <VoucherExpiryHint days={node.properties.expireDays} />
          </div>
          <VoucherBudgetHint node={node} />
        </>
      );

    case "Action_IssueVoucher_Freeship":
      return (
        <>
          <MoneyField
            label="Giảm phí ship tối đa (VNĐ)"
            value={node.properties.maxShippingDiscount ?? 30000}
            onChange={v => updateProp("maxShippingDiscount", v)}
            min={1000}
          />
          <div className="cb-fg">
            <label>Thời hạn voucher (ngày)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={node.properties.expireDays ?? 7}
              onChange={e => updateProp("expireDays", Number(e.target.value))}
            />
            <VoucherExpiryHint days={node.properties.expireDays} />
          </div>
          <VoucherBudgetHint node={node} />
        </>
      );

    case "Action_Upgrade_MemberRank":
      return (
        <>
          <div className="cb-fg" style={INFO_STYLE}>
            Gán hạng trực tiếp qua user-service. Chỉ nâng lên SILVER/GOLD/VIP (BE không hỗ trợ hạ hạng).
          </div>
          <div className="cb-fg">
            <label>Hạng đích</label>
            <select
              value={node.properties.targetTier || "GOLD"}
              onChange={e => updateProp("targetTier", e.target.value)}
            >
              {UPGRADE_TIERS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </>
      );

    case "Action_Loyalty_Point": {
      const mode = node.properties.calculationMode || "FIXED";
      return (
        <>
          <div className="cb-fg">
            <label>Cách tính điểm</label>
            <select
              value={mode}
              onChange={e => updateProp("calculationMode", e.target.value)}
            >
              <option value="FIXED">Cố định — cộng/trừ điểm trực tiếp</option>
              <option value="ORDER_SPEND">Theo đơn — 10.000 VNĐ = 1 điểm × hệ số hạng</option>
            </select>
          </div>
          {mode === "FIXED" ? (
            <div className="cb-fg">
              <label>Số điểm cộng/trừ</label>
              <input
                type="number"
                value={node.properties.pointAmount ?? 100}
                onChange={e => updateProp("pointAmount", Number(e.target.value))}
              />
              <small>Dương = tặng, âm = trừ. Không được = 0.</small>
            </div>
          ) : (
            <div className="cb-fg">
              <label>Điểm thưởng thêm (tuỳ chọn)</label>
              <input
                type="number"
                min={0}
                value={node.properties.pointAmount ?? 0}
                onChange={e => updateProp("pointAmount", Number(e.target.value))}
              />
              <small>Cộng thêm sau khi tính điểm theo giá trị đơn hàng.</small>
            </div>
          )}
        </>
      );
    }

    case "Action_Send_Email": {
      const tpl = EMAIL_TEMPLATES.find(t => t.code === node.properties.templateId);
      const hasTemplate = Boolean(String(node.properties.templateId || "").trim());
      const hasRaw = Boolean(String(node.properties.rawContent || "").trim());
      return (
        <>
          <div className="cb-fg">
            <label>Mẫu email có sẵn</label>
            <select
              value={node.properties.templateId || ""}
              onChange={e => updateProp("templateId", e.target.value)}
            >
              <option value="">— Chọn mẫu —</option>
              {EMAIL_TEMPLATES.map(t => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
            {tpl && <small>{tpl.hint}</small>}
          </div>
          <div className="cb-fg">
            <label>Nội dung tùy chỉnh (khi không dùng mẫu)</label>
            <textarea
              rows={4}
              value={node.properties.rawContent || ""}
              placeholder="HTML hoặc text thuần…"
              onChange={e => updateProp("rawContent", e.target.value)}
            />
            <small>BE yêu cầu có Template ID hoặc nội dung tùy chỉnh.</small>
          </div>
          {!hasTemplate && !hasRaw && (
            <small style={ERROR_STYLE}>Chọn mẫu email hoặc nhập nội dung tùy chỉnh.</small>
          )}
        </>
      );
    }

    default:
      return null;
  }
}
