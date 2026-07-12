import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { formatVoucherExpiry, getVoucherTypeMeta } from "../../../utils/voucherDisplay";
import { voucherApi } from "../../../services/voucherApi";

export default function VouchersTab() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("usable");

  useEffect(() => {
    voucherApi
      .getMyVouchers()
      .then(setVouchers)
      .catch(() => setVouchers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === "usable") return vouchers.filter((v) => v.usable);
    if (filter === "used") return vouchers.filter((v) => v.status === "USED");
    return vouchers;
  }, [vouchers, filter]);

  const usableCount = vouchers.filter((v) => v.usable).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-secondary text-xs mt-3 font-semibold">Đang tải voucher...</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md border border-surface-container-highest space-y-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container-highest pb-md">
        <div>
          <h3 className="font-bold text-headline-md text-on-surface flex items-center gap-2">
            <Icon name="confirmation_number" className="text-primary text-[24px]" />
            Kho voucher của bạn
          </h3>
          <p className="text-xs text-secondary mt-1">{usableCount} voucher sẵn sàng dùng khi thanh toán</p>
        </div>
        <div className="flex gap-2">
          {[
            { id: "usable", label: "Khả dụng" },
            { id: "used", label: "Đã dùng" },
            { id: "all", label: "Tất cả" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                filter === item.id
                  ? "bg-primary text-white border-primary"
                  : "bg-transparent text-on-surface border-surface-container-highest"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Icon name="redeem" className="text-[48px] text-secondary opacity-40" />
          <p className="text-sm text-secondary">Chưa có voucher trong mục này.</p>
          <Link to="/" className="inline-block bg-primary text-on-primary font-bold px-lg py-2 rounded-lg text-xs">
            MUA SẮM NGAY
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((voucher) => {
            const meta = getVoucherTypeMeta(voucher.voucherType);
            return (
              <div
                key={voucher.id}
                className={`rounded-xl border border-surface-container-highest p-4 ${meta.bg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name={meta.icon} className={`${meta.accent || "text-primary"} text-xl`} />
                    <div>
                      <p className="font-bold text-sm text-on-surface">{voucher.title}</p>
                      <p className="text-[11px] text-secondary">{voucher.description}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-secondary">{voucher.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <code className="text-xs font-black text-on-surface bg-white/70 dark:bg-slate-900/50 px-2 py-1 rounded">
                    {voucher.code}
                  </code>
                  <span className="text-[10px] text-secondary">HSD: {formatVoucherExpiry(voucher.expiresAt)}</span>
                </div>
                {voucher.usable && (
                  <Link
                    to="/checkout"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    Dùng ngay
                    <Icon name="arrow_forward" className="text-sm" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
