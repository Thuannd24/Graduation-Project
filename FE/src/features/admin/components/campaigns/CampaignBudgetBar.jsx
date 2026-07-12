import React from "react";
import { estimateMinimumPool, formatVnd, workflowRequiresBudget } from "./utils/workflowBudget.js";

/**
 * Campaign budget pool — shown in editor when workflow issues vouchers.
 * Stored in workflowJson.meta.totalBudget (not in deploy modal).
 */
export default function CampaignBudgetBar({ nodes, meta, onChangeMeta }) {
  if (!workflowRequiresBudget(nodes)) return null;

  const minPool = estimateMinimumPool(nodes);
  const budgetVal = meta?.totalBudget ?? "";
  const budgetNum = budgetVal !== "" && budgetVal != null ? Number(budgetVal) : 0;
  const tooLow = budgetNum > 0 && minPool > 0 && budgetNum < minPool;

  return (
    <div className="cb-budget-bar">
      <div className="cb-budget-bar-label">
        <span className="cb-budget-bar-icon">💰</span>
        <div>
          <strong>Quỹ ngân sách chiến dịch</strong>
          <small>Trần tổng cho mọi lần phát voucher — cấu hình tại đây, không phải modal triển khai</small>
        </div>
      </div>
      <div className="cb-budget-bar-input">
        <input
          type="number"
          min={1}
          placeholder="VD: 50000000"
          value={budgetVal}
          onChange={e => onChangeMeta({ totalBudget: e.target.value })}
        />
        <span className="cb-budget-bar-hint">
          Trừ/lượt phát (tối thiểu gợi ý): <strong>{formatVnd(minPool)}</strong>
        </span>
        {tooLow && (
          <span className="cb-budget-bar-warn">
            Quỹ thấp hơn tổng trừ tối đa/lượt phát của các node voucher
          </span>
        )}
      </div>
    </div>
  );
}
