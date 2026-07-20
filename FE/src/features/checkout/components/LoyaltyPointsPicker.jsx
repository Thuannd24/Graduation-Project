import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import { formatVnd } from "../../../utils/format.js";
import { authApi } from "../../../services/authApi";

// Mirrors VoucherPicker's collapse/apply UX, but the redeemable cap always comes from
// user-service's balance-aware preview (authApi.previewLoyaltyRedeem) - never from
// order-service's checkout preview, which computes pointDiscount from whatever the client
// sends without checking the real point balance.
export default function LoyaltyPointsPicker({ orderAmount, appliedPoints, onApplied, onClear }) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(null); // { currentBalance, maxRedeemablePoints, maxDiscountAmount, vndPerPoint }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pointsInput, setPointsInput] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!(orderAmount > 0)) {
        setPreview(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await authApi.previewLoyaltyRedeem(orderAmount);
        if (cancelled) return;
        setPreview(result);

        // The max redeemable can shrink (e.g. a voucher was just applied, lowering the payable
        // amount) - re-clamp whatever's already applied instead of silently letting it exceed
        // the new limit until the user notices at checkout.
        if (appliedPoints?.pointsToRedeem > result.maxRedeemablePoints) {
          const clamped = result.maxRedeemablePoints;
          if (clamped <= 0) {
            onClear?.();
          } else {
            onApplied?.({ pointsToRedeem: clamped, pointDiscount: clamped * result.vndPerPoint });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : "Không thể tải thông tin điểm thưởng.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPreview();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderAmount]);

  useEffect(() => {
    if (expanded) {
      setPointsInput(appliedPoints?.pointsToRedeem ?? preview?.maxRedeemablePoints ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const maxPoints = preview?.maxRedeemablePoints ?? 0;
  const vndPerPoint = preview?.vndPerPoint ?? 0;

  const clampedInput = useMemo(
    () => Math.max(0, Math.min(pointsInput || 0, maxPoints)),
    [pointsInput, maxPoints]
  );
  const previewDiscount = clampedInput * vndPerPoint;

  const handleInputChange = (e) => {
    const raw = e.target.value === "" ? 0 : Math.floor(Number(e.target.value));
    if (Number.isNaN(raw)) return;
    setPointsInput(Math.max(0, Math.min(raw, maxPoints)));
  };

  const handleQuickPick = (fraction) => {
    setPointsInput(Math.floor(maxPoints * fraction));
  };

  const handleApply = () => {
    setError("");
    if (clampedInput <= 0) {
      setError("Chọn số điểm lớn hơn 0 để áp dụng.");
      return;
    }
    onApplied?.({ pointsToRedeem: clampedInput, pointDiscount: clampedInput * vndPerPoint });
    setExpanded(false);
  };

  const handleClear = () => {
    setError("");
    onClear?.();
  };

  const hasNoPoints = !loading && (!preview || preview.currentBalance <= 0);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => !hasNoPoints && setExpanded((v) => !v)}
        disabled={hasNoPoints}
        className={`w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-indigo-50/80 via-white to-blue-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 border-none text-left ${
          hasNoPoints ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
            <Icon name="stars" className="text-white text-xl" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Điểm thưởng
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {appliedPoints
                ? `Đã dùng ${appliedPoints.pointsToRedeem} điểm · tiết kiệm ${formatVnd(appliedPoints.pointDiscount)}`
                : loading
                  ? "Đang tải số điểm..."
                  : hasNoPoints
                    ? "Bạn chưa có điểm thưởng"
                    : `Bạn có ${preview.currentBalance} điểm khả dụng`}
            </p>
          </div>
        </div>
        {!hasNoPoints && (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <Icon name="expand_more" className="text-slate-400 text-2xl" />
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {appliedPoints && !expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 sm:px-5 pb-4 border-t border-slate-100 dark:border-slate-800"
          >
            <div className="mt-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon name="verified" className="text-indigo-600 text-xl shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {appliedPoints.pointsToRedeem} điểm
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    Giảm {formatVnd(appliedPoints.pointDiscount)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-bold text-slate-500 hover:text-primary bg-transparent border-none cursor-pointer shrink-0"
              >
                Bỏ chọn
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {expanded && !hasNoPoints && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-slate-100 dark:border-slate-800"
          >
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Số dư: {preview?.currentBalance ?? 0} điểm</span>
                <span>Tối đa dùng cho đơn này: {maxPoints} điểm</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={maxPoints}
                  step={1}
                  value={pointsInput}
                  onChange={handleInputChange}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                />
                <span className="text-[11px] font-bold text-slate-400 shrink-0">/ {maxPoints} điểm</span>
              </div>

              <div className="flex gap-2">
                {[0.25, 0.5, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    onClick={() => handleQuickPick(fraction)}
                    disabled={maxPoints <= 0}
                    className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fraction === 1 ? "Tối đa" : `${fraction * 100}%`}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Số tiền được giảm</span>
                <span className="text-sm font-black text-indigo-600">-{formatVnd(previewDiscount)}</span>
              </div>

              {error && (
                <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                  <Icon name="error_outline" className="text-sm" />
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                {appliedPoints && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-4 py-2.5 bg-transparent border border-slate-200 dark:border-slate-700 text-slate-500 text-xs font-black rounded-xl cursor-pointer"
                  >
                    Bỏ chọn
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={clampedInput <= 0}
                  className="flex-1 px-4 py-2.5 bg-slate-900 dark:bg-indigo-700 hover:bg-slate-800 dark:hover:bg-indigo-600 text-white text-xs font-black rounded-xl border-none cursor-pointer disabled:opacity-50"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
