import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { CANCEL_REASONS } from "../../utils/orderStatus.js";

/**
 * Hộp thoại hủy đơn: bắt buộc chọn lý do (order-service từ chối hủy không có lý do).
 * onConfirm(reasonCode, reason) trả Promise; lỗi được hiển thị ngay trong hộp thoại.
 */
export default function CancelOrderDialog({ open, orderId, title, note, confirmLabel = "Xác nhận hủy đơn", onConfirm, onClose }) {
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReasonCode("");
      setReason("");
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const needsText = reasonCode === "OTHER";
  const canSubmit = reasonCode && (!needsText || reason.trim().length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(reasonCode, reason.trim());
    } catch (err) {
      setError(err?.message || "Không thể hủy đơn hàng. Vui lòng thử lại.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{title || `Hủy đơn hàng #${orderId}`}</h3>
            {note && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{note}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="text-slate-400 hover:text-slate-600 p-1">
            <Icon name="close" className="text-base" />
          </button>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Lý do hủy <span className="text-red-500">*</span></legend>
          {CANCEL_REASONS.map((r) => (
            <label key={r.code} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
              reasonCode === r.code ? "border-primary bg-red-500/5 text-slate-800 dark:text-slate-100" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300"
            }`}>
              <input type="radio" name="cancelReason" value={r.code} checked={reasonCode === r.code} onChange={() => setReasonCode(r.code)} className="accent-primary" />
              <span className="font-semibold">{r.label}</span>
            </label>
          ))}
        </fieldset>

        {needsText && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            autoFocus
            placeholder="Vui lòng mô tả lý do..."
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        {error && <p className="text-[11px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            Giữ đơn hàng
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
