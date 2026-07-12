import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import { formatVnd } from "../../../utils/format.js";
import { formatVoucherExpiry, getVoucherTypeMeta } from "../../../utils/voucherDisplay";
import { DEFAULT_SHIPPING_FEE, voucherApi } from "../../../services/voucherApi";

function VoucherTicket({ voucher, selected, savings, loading, disabled, onSelect }) {
  const meta = getVoucherTypeMeta(voucher.voucherType);
  const isDisabled = disabled || !voucher.usable;

  return (
    <motion.button
      type="button"
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      onClick={() => !isDisabled && onSelect(voucher)}
      disabled={isDisabled}
      className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all cursor-pointer ${
        selected
          ? "border-primary shadow-lg shadow-red-500/15 ring-2 ring-primary/20"
          : isDisabled
            ? "border-slate-100 dark:border-slate-800 opacity-55 cursor-not-allowed"
            : "border-slate-100 dark:border-slate-800 hover:border-primary/40 hover:shadow-md"
      }`}
    >
      <div className="flex min-h-[88px]">
        <div className={`w-[72px] shrink-0 bg-gradient-to-br ${meta.gradient} flex flex-col items-center justify-center text-white relative`}>
          <div className="absolute right-0 top-2 bottom-2 w-1 border-r border-dashed border-white/30" />
          <Icon name={meta.icon} className="text-2xl mb-1" />
          <span className="text-[9px] font-black uppercase tracking-wider">{meta.badge}</span>
        </div>

        <div className="flex-1 p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="min-w-0">
            <p className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">{voucher.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{voucher.description}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {voucher.code}
              </span>
              <span className="text-[10px] text-slate-400">HSD: {formatVoucherExpiry(voucher.expiresAt)}</span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : savings > 0 ? (
              <p className={`text-xs font-black ${meta.accent}`}>−{formatVnd(savings)}</p>
            ) : voucher.usable ? (
              <p className="text-[10px] font-bold text-slate-400">Chọn để áp dụng</p>
            ) : (
              <p className="text-[10px] font-bold text-slate-400 uppercase">{voucher.status}</p>
            )}
            {selected && (
              <div className="mt-1 flex justify-end">
                <Icon name="check_circle" className="text-primary text-lg" />
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function VoucherPicker({ orderTotal, appliedVoucher, onApplied, onClear }) {
  const [expanded, setExpanded] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchCode, setSearchCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [savingsMap, setSavingsMap] = useState({});
  const [previewingCode, setPreviewingCode] = useState("");

  useEffect(() => {
    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 4; // Tối đa 4 lần kiểm tra (0s, 1.5s, 3s, 4.5s)
    let timeoutId;

    const fetchVouchers = async () => {
      try {
        if (pollCount === 0) setLoadingList(true);
        const data = await voucherApi.getMyVouchers();
        if (!isMounted) return;

        setVouchers(data || []);
        
        // Eventual Consistency Polling:
        // Đợi tiến trình bất đồng bộ (Kafka + Camunda) phát voucher cho tài khoản mới
        if ((!data || data.length === 0) && pollCount < maxPolls) {
          pollCount++;
          timeoutId = setTimeout(fetchVouchers, 1500); // Thử lại sau 1.5s
        } else {
          setLoadingList(false);
        }
      } catch (err) {
        if (isMounted) {
          setVouchers([]);
          setLoadingList(false);
        }
      }
    };

    fetchVouchers();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const usableVouchers = useMemo(
    () => vouchers.filter((v) => v.usable),
    [vouchers]
  );

  const filteredVouchers = useMemo(() => {
    const q = searchCode.trim().toUpperCase();
    if (!q) return vouchers;
    return vouchers.filter((v) => v.code.includes(q) || v.title.toUpperCase().includes(q));
  }, [vouchers, searchCode]);

  const previewCode = async (code) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || orderTotal <= 0) return null;

    setPreviewingCode(normalized);
    try {
      const result = await voucherApi.previewVoucher({
        code: normalized,
        orderTotal,
        shippingFee: DEFAULT_SHIPPING_FEE
      });
      if (result.applied) {
        const productDiscount = Number(result.productDiscountAmount ?? 0);
        const shippingDiscount = Number(result.shippingDiscountAmount ?? 0);
        const totalSavings = Number(result.discountAmount ?? productDiscount + shippingDiscount);
        setSavingsMap((prev) => ({
          ...prev,
          [normalized]: totalSavings
        }));
        return result;
      }
      setError(result.message || "Voucher không áp dụng được.");
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể kiểm tra voucher.");
      return null;
    } finally {
      setPreviewingCode("");
    }
  };

  const handleSelectVoucher = async (voucher) => {
    setError("");
    setApplying(true);
    const result = await previewCode(voucher.code);
    setApplying(false);
    if (result?.applied) {
      onApplied?.({
        code: result.voucherCode || voucher.code,
        voucherType: result.voucherType || voucher.voucherType,
        discountAmount: Number(result.discountAmount || 0),
        productDiscountAmount: Number(result.productDiscountAmount || 0),
        shippingDiscountAmount: Number(result.shippingDiscountAmount || 0),
        message: result.message || "Áp dụng voucher thành công."
      });
      setExpanded(false);
    }
  };

  const handleApplyManualCode = async (e) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    setError("");
    setApplying(true);
    const result = await previewCode(searchCode);
    setApplying(false);
    if (result?.applied) {
      onApplied?.({
        code: result.voucherCode || searchCode.trim().toUpperCase(),
        voucherType: result.voucherType,
        discountAmount: Number(result.discountAmount || 0),
        productDiscountAmount: Number(result.productDiscountAmount || 0),
        shippingDiscountAmount: Number(result.shippingDiscountAmount || 0),
        message: result.message || "Áp dụng voucher thành công."
      });
      setExpanded(false);
    }
  };

  const handleClear = () => {
    setError("");
    onClear?.();
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-amber-50/80 via-white to-red-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-red-950/20 border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-md shadow-red-500/25">
            <Icon name="confirmation_number" className="text-white text-xl" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Ưu đãi & Voucher
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {appliedVoucher
                ? `Đã chọn ${appliedVoucher.code} · tiết kiệm ${formatVnd(appliedVoucher.discountAmount)}`
                : usableVouchers.length > 0
                  ? `Bạn có ${usableVouchers.length} voucher khả dụng`
                  : "Nhập mã hoặc chọn voucher của bạn"}
            </p>
          </div>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <Icon name="expand_more" className="text-slate-400 text-2xl" />
        </motion.div>
      </button>

      <AnimatePresence>
        {appliedVoucher && !expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 sm:px-5 pb-4 border-t border-slate-100 dark:border-slate-800"
          >
            <div className={`mt-4 flex items-center justify-between gap-3 p-3 rounded-xl ${getVoucherTypeMeta(appliedVoucher.voucherType).bg || "bg-red-50"}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon name="verified" className={`${getVoucherTypeMeta(appliedVoucher.voucherType).accent || "text-primary"} text-xl shrink-0`} />
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{appliedVoucher.code}</p>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    {appliedVoucher.voucherType === "FREESHIP"
                      ? `Giảm phí ship ${formatVnd(appliedVoucher.shippingDiscountAmount || appliedVoucher.discountAmount)}`
                      : `Giảm ${formatVnd(appliedVoucher.productDiscountAmount || appliedVoucher.discountAmount)}`}
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
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-slate-100 dark:border-slate-800"
          >
            <div className="p-4 sm:p-5 space-y-4">
              <form onSubmit={handleApplyManualCode} className="flex gap-2">
                <div className="relative flex-1">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm" />
                  <input
                    value={searchCode}
                    onChange={(e) => { setSearchCode(e.target.value); setError(""); }}
                    placeholder="Nhập hoặc tìm mã voucher..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={applying || !searchCode.trim()}
                  className="px-4 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-black rounded-xl border-none cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {applying ? "..." : "Áp dụng"}
                </button>
              </form>

              {error && (
                <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                  <Icon name="error_outline" className="text-sm" />
                  {error}
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Voucher của bạn</p>
                  {!loadingList && (
                    <span className="text-[10px] font-bold text-slate-400">{usableVouchers.length} khả dụng</span>
                  )}
                </div>

                {loadingList ? (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-[11px] text-slate-400 mt-2 font-semibold">Đang tải voucher...</p>
                  </div>
                ) : filteredVouchers.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800">
                    <Icon name="redeem" className="text-4xl text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Chưa có voucher phù hợp</p>
                    <p className="text-[10px] text-slate-400 mt-1">Mua hàng hoặc tham gia chiến dịch để nhận ưu đãi</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-0.5">
                    {filteredVouchers.map((voucher) => (
                      <VoucherTicket
                        key={voucher.id}
                        voucher={voucher}
                        selected={appliedVoucher?.code === voucher.code}
                        savings={savingsMap[voucher.code] || (appliedVoucher?.code === voucher.code ? appliedVoucher.discountAmount : 0)}
                        loading={previewingCode === voucher.code}
                        disabled={applying}
                        onSelect={handleSelectVoucher}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
