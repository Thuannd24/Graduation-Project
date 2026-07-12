import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatVnd } from "../../../utils/format.js";
import Icon from "../../../components/common/Icon.jsx";

export default function OrderSummary({ 
  summary, 
  actionLabel = "Tiến hành thanh toán", 
  actionTo = "/checkout", 
  asButton = false, 
  onAction,
  hideVoucherSection = false,
  voucherHint = "Chọn voucher khi thanh toán",
  asDiv = false,
  className = "",
  disabled = false
}) {
  const Action = asButton ? "button" : Link;
  const actionProps = asButton ? { type: "button", onClick: onAction, disabled } : { to: actionTo };
  const paymentMethods = [
    { name: "VNPAY", icon: "account_balance" },
    { name: "COD", icon: "payments" },
  ];

  const Wrapper = asDiv ? "div" : "aside";
  const defaultClasses = asDiv ? "space-y-4" : "w-full lg:w-[380px] shrink-0 space-y-4 lg:sticky lg:top-24";

  return (
    <Wrapper className={`${defaultClasses} ${className}`}>
      {/* ===== Order Summary Card ===== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-none overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-850">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-red-50 dark:from-primary/20 dark:to-red-950/20 flex items-center justify-center shadow-sm">
            <Icon name="receipt_long" className="text-primary text-lg" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-850 dark:text-slate-200 tracking-tight">
              Tóm tắt đơn hàng
            </h2>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Chi tiết thanh toán & chiết khấu</p>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          {!hideVoucherSection && (
            <Link
              to={actionTo}
              className="relative overflow-hidden bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-2xl p-3.5 flex items-center justify-between group hover:border-primary/20 transition-all duration-300 cursor-pointer block"
            >
              {/* Decorative ticket notches */}
              <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-850" />
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-850" />
              
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                  <Icon name="confirmation_number" className="text-base" />
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">Voucher & Ưu đãi</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">{voucherHint}</p>
                </div>
              </div>
              <Icon name="chevron_right" className="text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all text-base" />
            </Link>
          )}

          {summary.voucherCode && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl px-3 py-2 border border-emerald-100 dark:border-emerald-900/30">
              <Icon name="check_circle" className="text-sm" />
              Voucher <span className="uppercase text-xs font-black">{summary.voucherCode}</span> đã được áp dụng
            </div>
          )}

          {/* ===== Price Breakdown ===== */}
          <div className="space-y-3.5 text-sm pt-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold text-xs">Tạm tính</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold text-xs">{formatVnd(summary.subtotal)}</span>
            </div>
            
            <motion.div
              animate={summary.discount > 0 ? { x: [0, -3, 3, -3, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="flex justify-between items-center"
            >
              <span className="text-slate-500 font-semibold text-xs">Giảm giá sản phẩm</span>
              <span className={`font-extrabold text-xs ${summary.discount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                {summary.discount > 0 ? `-${formatVnd(summary.discount)}` : "—"}
              </span>
            </motion.div>

            {(summary.shippingDiscount ?? 0) > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold text-xs">Giảm phí vận chuyển</span>
                <span className="font-extrabold text-xs text-emerald-600">-{formatVnd(summary.shippingDiscount)}</span>
              </div>
            )}

            {(summary.pointDiscount ?? 0) > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold text-xs">Giảm bằng điểm</span>
                <span className="font-extrabold text-xs text-emerald-600">-{formatVnd(summary.pointDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold text-xs">Phí vận chuyển</span>
              {summary.shipping === 0 ? (
                <span className="text-emerald-600 font-bold text-xs flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">
                  <Icon name="local_shipping" className="text-xs" />
                  Miễn phí
                </span>
              ) : (
                <span className="text-slate-800 dark:text-slate-200 font-extrabold text-xs">{formatVnd(summary.shipping)}</span>
              )}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-semibold text-xs">Thuế VAT (10%)</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold text-xs">{formatVnd(summary.vat)}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 dark:border-slate-800 my-4" />

          {/* ===== Total ===== */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <strong className="text-slate-800 dark:text-slate-100 uppercase font-black text-xs tracking-wider">Tổng thanh toán</strong>
              <motion.span
                key={summary.total}
                initial={{ scale: 1.15, color: "#a90010" }}
                animate={{ scale: 1, color: "#a90010" }}
                transition={{ type: "spring", stiffness: 300 }}
                className="text-lg font-black text-primary"
              >
                {formatVnd(summary.total)}
              </motion.span>
            </div>
            {summary.subtotal > 0 && (
              <p className="text-right text-[9px] text-slate-400 font-semibold">
                (Đã bao gồm VAT & các khoản giảm trừ)
              </p>
            )}
          </div>

          {/* ===== Action Button ===== */}
          <Action
            className={`w-full mt-4 py-3.5 bg-gradient-to-r from-primary via-red-500 to-rose-600 hover:from-primary hover:to-rose-600 text-white font-extrabold text-xs uppercase rounded-xl transition-all shadow-[0_6px_20px_rgba(239,68,68,0.15)] hover:shadow-[0_8px_25px_rgba(239,68,68,0.25)] hover:-translate-y-0.5 flex items-center justify-center gap-2 border-none ${
              disabled ? "opacity-60 cursor-not-allowed pointer-events-none" : "cursor-pointer"
            }`}
            {...actionProps}
          >
            <span>{actionLabel}</span>
            <Icon name={asButton ? "shopping_bag" : "arrow_forward"} className="text-sm animate-pulse" />
          </Action>

          {/* ===== Payment Methods ===== */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-850">
            <p className="text-[9px] text-slate-400 font-extrabold text-center uppercase tracking-wider mb-2.5">
              Chấp nhận thanh toán
            </p>
            <div className="flex items-center justify-center gap-2">
              {paymentMethods.map((method) => (
                <div
                  key={method.name}
                  className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-850"
                >
                  <Icon name={method.icon} className="text-xs text-slate-400" />
                  {method.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Support Card ===== */}
      <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 border border-slate-105 dark:border-slate-850 rounded-2xl p-5 overflow-hidden">
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
        <div className="inline-flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider bg-slate-50 dark:bg-slate-900 px-3.5 py-2 rounded-full border border-slate-100 dark:border-slate-850">
          <Icon name="lock" className="text-xs text-emerald-500" />
          Thanh toán an toàn & bảo mật SSL
        </div>
      </div>
    </Wrapper>
  );
}
