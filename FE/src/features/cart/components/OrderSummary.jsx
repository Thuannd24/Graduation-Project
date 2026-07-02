import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { formatVnd } from "../../../utils/format.js";
import Icon from "../../../components/common/Icon.jsx";
import { useState } from "react";

export default function OrderSummary({ 
  summary, 
  actionLabel = "Tiến hành thanh toán", 
  actionTo = "/checkout", 
  asButton = false, 
  onAction,
  onApplyVoucher 
}) {
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [couponAnimating, setCouponAnimating] = useState(false);

  const Action = asButton ? "button" : Link;
  const actionProps = asButton ? { type: "button", onClick: onAction } : { to: actionTo };

  const handleApply = (e) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;
    const code = voucherCode.trim().toUpperCase();
    if (code === "AURATECH2026" || code === "TECHSTORE2026" || code === "KM10") {
      setCouponAnimating(true);
      setTimeout(() => {
        setVoucherApplied(true);
        setErrorMsg("");
        setCouponAnimating(false);
        if (onApplyVoucher) onApplyVoucher(code);
      }, 600);
    } else {
      setErrorMsg("Mã giảm giá không hợp lệ hoặc đã hết hạn.");
      setVoucherApplied(false);
    }
  };

  const paymentMethods = [
    { name: "Visa/Mastercard", icon: "credit_card" },
    { name: "VNPAY", icon: "account_balance" },
    { name: "COD", icon: "payments" },
  ];

  return (
    <aside className="w-full lg:w-[380px] shrink-0 space-y-4 lg:sticky lg:top-24">
      {/* ===== Order Summary Card ===== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-red-50 dark:from-primary/20 dark:to-red-950/20 flex items-center justify-center">
            <Icon name="receipt_long" className="text-primary text-lg" />
          </div>
          <div>
            <h2 className="font-black text-sm text-slate-800 dark:text-slate-200 tracking-tight">
              Tóm tắt đơn hàng
            </h2>
            <p className="text-[10px] text-slate-400 font-medium">Chi tiết thanh toán</p>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          {/* ===== Voucher Section ===== */}
          <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">
              Mã giảm giá
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
                  <Icon name="sell" className="text-slate-300 text-sm" />
                </div>
                <input
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  placeholder="Nhập mã ưu đãi"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  disabled={voucherApplied}
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleApply}
                className={`px-4 py-2 font-black text-xs uppercase rounded-lg border-none cursor-pointer transition-all whitespace-nowrap ${
                  voucherApplied 
                    ? "bg-emerald-500 text-white shadow-sm" 
                    : "bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-700 dark:hover:bg-slate-600 shadow-sm hover:shadow"
                }`}
                type="button"
                disabled={couponAnimating}
              >
                {couponAnimating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                ) : voucherApplied ? (
                  "✓ Đã áp dụng"
                ) : (
                  "Áp dụng"
                )}
              </motion.button>
            </div>
            <AnimatePresence>
              {voucherApplied && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-2.5 py-1.5"
                >
                  <Icon name="check_circle" className="text-sm" />
                  Giảm 10% với mã <span className="uppercase bg-emerald-200 dark:bg-emerald-800/50 px-1 rounded">{voucherCode.trim().toUpperCase()}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {errorMsg && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-1.5 text-[11px] font-bold text-red-500 flex items-center gap-1"
              >
                <Icon name="error_outline" className="text-sm" />
                {errorMsg}
              </motion.p>
            )}
          </div>

          {/* ===== Price Breakdown ===== */}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium text-xs">Tạm tính</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold text-xs">{formatVnd(summary.subtotal)}</span>
            </div>
            
            <motion.div
              animate={summary.discount > 0 ? { x: [0, -3, 3, -3, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="flex justify-between items-center"
            >
              <span className="text-slate-500 font-medium text-xs">Giảm giá</span>
              <span className={`font-bold text-xs ${summary.discount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                {summary.discount > 0 ? `-${formatVnd(summary.discount)}` : "—"}
              </span>
            </motion.div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium text-xs">Phí vận chuyển</span>
              <span className="text-emerald-600 font-bold text-xs flex items-center gap-0.5">
                <Icon name="local_shipping" className="text-xs" />
                Miễn phí
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium text-xs">Thuế VAT (10%)</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold text-xs">{formatVnd(summary.vat)}</span>
            </div>
          </div>

          {/* ===== Total ===== */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
            <div className="flex justify-between items-center">
              <strong className="text-slate-800 dark:text-slate-100 uppercase font-black text-sm tracking-tight">Tổng cộng</strong>
              <motion.span
                key={summary.total}
                initial={{ scale: 1.3, color: "#a90010" }}
                animate={{ scale: 1, color: "#a90010" }}
                transition={{ type: "spring", stiffness: 300 }}
                className="text-xl font-black text-primary"
              >
                {formatVnd(summary.total)}
              </motion.span>
            </div>
            {summary.subtotal > 0 && (
              <p className="text-right text-[10px] text-slate-400 font-medium">
                (Đã bao gồm VAT)
              </p>
            )}
          </div>

          {/* ===== Action Button ===== */}
          <Action
            className="w-full py-3.5 bg-gradient-to-r from-primary to-red-600 hover:from-red-700 hover:to-red-800 text-white font-black text-sm uppercase rounded-xl transition-all shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer border-none"
            {...actionProps}
          >
            <span>{actionLabel}</span>
            <Icon name={asButton ? "shopping_bag" : "arrow_forward"} className="text-base" />
          </Action>

          {/* ===== Payment Methods ===== */}
          <div className="pt-1">
            <p className="text-[10px] text-slate-400 font-medium text-center mb-2.5">
              Chấp nhận thanh toán qua
            </p>
            <div className="flex items-center justify-center gap-3">
              {paymentMethods.map((method) => (
                <div
                  key={method.name}
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800"
                >
                  <Icon name={method.icon} className="text-sm text-slate-500" />
                  {method.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Support Card ===== */}
      <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 overflow-hidden">
        <div className="flex gap-3 items-start">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-red-50 dark:from-primary/20 dark:to-red-950/20 flex items-center justify-center shrink-0">
            <Icon name="support_agent" className="text-primary text-xl" />
          </div>
          <div className="text-xs leading-relaxed">
            <h4 className="font-extrabold text-slate-800 dark:text-slate-200">Bạn cần hỗ trợ?</h4>
            <p className="text-slate-500 mt-1">
              Gọi ngay hotline{' '}
              <a href="tel:18002097" className="text-primary font-bold hover:underline">
                1800.2097
              </a>{' '}
              để được tư vấn 24/7.
            </p>
            <div className="flex gap-2 mt-2.5">
              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Miễn phí</span>
              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">24/7</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Trust Badge ===== */}
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 font-medium bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-full border border-slate-100 dark:border-slate-800">
          <Icon name="lock" className="text-xs text-emerald-500" />
          Thanh toán an toàn & bảo mật
        </div>
      </div>
    </aside>
  );
}
