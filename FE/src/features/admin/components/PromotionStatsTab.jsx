import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import Icon from "../../../components/common/Icon.jsx";
import { campaignApi } from "../../../services/campaignApi.ts";
import { hasAuthToken } from "../../../services/apiClient.ts";

const STATUS_COLORS = {
  UNUSED: "#10b981",
  USED: "#3b82f6",
  EXPIRED: "#94a3b8",
  RESERVED: "#f59e0b"
};

const TYPE_COLORS = {
  PERCENT: "#8b5cf6",
  FIXED: "#06b6d4",
  FREESHIP: "#f97316"
};

function formatMoney(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B đ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M đ`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K đ`;
  return `${n.toLocaleString("vi-VN")} đ`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function statusLabel(status) {
  const map = {
    UNUSED: "Chưa dùng",
    USED: "Đã dùng",
    EXPIRED: "Hết hạn",
    RESERVED: "Đang giữ",
    CANCELLED: "Đã hủy"
  };
  return map[status] || status;
}

function typeLabel(type) {
  const map = { PERCENT: "Giảm %", FIXED: "Giảm tiền", FREESHIP: "Freeship" };
  return map[type] || type;
}

function budgetPercent(committed, total) {
  const t = Number(total) || 0;
  const c = Number(committed) || 0;
  if (t <= 0) return 0;
  return Math.min(100, Math.round((c / t) * 100));
}

function StatCard({ icon, label, value, sub, accent = "emerald" }) {
  const accents = {
    emerald: "from-emerald-500/10 to-emerald-600/5 border-emerald-200/60 text-emerald-700",
    blue: "from-blue-500/10 to-blue-600/5 border-blue-200/60 text-blue-700",
    violet: "from-violet-500/10 to-violet-600/5 border-violet-200/60 text-violet-700",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-200/60 text-amber-700",
    rose: "from-rose-500/10 to-rose-600/5 border-rose-200/60 text-rose-700"
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-800/80 ${accents[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
          <p className="text-2xl font-extrabold mt-1 text-slate-800 dark:text-white">{value}</p>
          {sub && <p className="text-[11px] font-semibold mt-1 opacity-80">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/70 dark:bg-slate-900/50 flex items-center justify-center shrink-0">
          <Icon name={icon} className="text-xl" />
        </div>
      </div>
    </div>
  );
}

export default function PromotionStatsTab() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [voucherFilter, setVoucherFilter] = useState("all");
  const [campaignSearch, setCampaignSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!hasAuthToken()) {
      setLoadError("Cần đăng nhập ADMIN/STAFF để xem thống kê promotion.");
      setDashboard(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await campaignApi.getPromotionDashboard();
      setDashboard(data);
      setSelectedCampaignId(prev => prev ?? data?.campaigns?.[0]?.campaignId ?? null);
    } catch (err) {
      console.error("Promotion dashboard load failed:", err);
      setLoadError(err.message || "Không tải được thống kê promotion.");
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedCampaignId || !hasAuthToken()) {
      setVouchers([]);
      return;
    }
    let cancelled = false;
    setVouchersLoading(true);
    campaignApi.listCampaignVouchers(selectedCampaignId)
      .then(data => { if (!cancelled) setVouchers(data || []); })
      .catch(err => {
        console.warn("Voucher list failed:", err);
        if (!cancelled) setVouchers([]);
      })
      .finally(() => { if (!cancelled) setVouchersLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCampaignId]);

  const selectedCampaign = useMemo(
    () => dashboard?.campaigns?.find(c => c.campaignId === selectedCampaignId) || null,
    [dashboard, selectedCampaignId]
  );

  const filteredCampaigns = useMemo(() => {
    const list = dashboard?.campaigns || [];
    const q = campaignSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      String(c.campaignName || "").toLowerCase().includes(q)
      || String(c.bpmnProcessDefinitionKey || "").toLowerCase().includes(q)
    );
  }, [dashboard, campaignSearch]);

  const statusChart = useMemo(() => {
    if (!dashboard) return [];
    return [
      { name: "Chưa dùng", value: dashboard.totalUnused, color: STATUS_COLORS.UNUSED },
      { name: "Đã dùng", value: dashboard.totalUsed, color: STATUS_COLORS.USED },
      { name: "Hết hạn", value: dashboard.totalExpired, color: STATUS_COLORS.EXPIRED },
      { name: "Đang giữ", value: dashboard.totalReserved, color: STATUS_COLORS.RESERVED }
    ].filter(d => d.value > 0);
  }, [dashboard]);

  const typeChart = useMemo(() => {
    if (!dashboard) return [];
    return [
      { name: "Giảm %", value: dashboard.totalPercent, fill: TYPE_COLORS.PERCENT },
      { name: "Giảm tiền", value: dashboard.totalFixed, fill: TYPE_COLORS.FIXED },
      { name: "Freeship", value: dashboard.totalFreeship, fill: TYPE_COLORS.FREESHIP }
    ].filter(d => d.value > 0);
  }, [dashboard]);

  const campaignBarChart = useMemo(() => {
    return (dashboard?.campaigns || [])
      .slice()
      .sort((a, b) => b.totalIssued - a.totalIssued)
      .slice(0, 8)
      .map(c => ({
        name: c.campaignName?.length > 14 ? c.campaignName.slice(0, 14) + "…" : c.campaignName,
        issued: c.totalIssued,
        used: c.totalUsed,
        conversion: c.conversionRate
      }));
  }, [dashboard]);

  const filteredVouchers = useMemo(() => {
    if (voucherFilter === "all") return vouchers;
    return vouchers.filter(v => v.status === voucherFilter);
  }, [vouchers, voucherFilter]);

  const card = "bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-sm";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[320px]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Icon name="hourglass_empty" className="text-3xl animate-pulse" />
          <p className="text-sm font-bold">Đang tải thống kê promotion…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6 pb-10">
      {loadError && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-3">
          <Icon name="error" className="text-rose-600 text-xl shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Không tải được dữ liệu</p>
            <p className="text-xs text-rose-700/90 mt-1">{loadError}</p>
            <button type="button" onClick={loadDashboard} className="mt-2 text-xs font-bold text-rose-600 hover:underline">
              Thử lại
            </button>
          </div>
        </div>
      )}

      {dashboard && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Thống kê Promotion</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ngân sách cam kết khi phát voucher · Tỷ lệ chuyển đổi = đã dùng / đã phát
              </p>
            </div>
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <Icon name="refresh" className="text-base" />
              Làm mới
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <StatCard icon="campaign" label="Chiến dịch" value={dashboard.totalCampaigns}
              sub={`${dashboard.activeCampaigns} đang hoạt động`} accent="emerald" />
            <StatCard icon="confirmation_number" label="Voucher đã phát" value={dashboard.totalIssued.toLocaleString("vi-VN")}
              sub={`${dashboard.averageConversionRate}% tỷ lệ dùng TB`} accent="blue" />
            <StatCard icon="payments" label="Ngân sách tổng" value={formatMoney(dashboard.totalBudget)}
              sub={`Còn ${formatMoney(dashboard.remainingBudget)}`} accent="violet" />
            <StatCard icon="account_balance" label="Đã cam kết" value={formatMoney(dashboard.committedBudget)}
              sub={`${budgetPercent(dashboard.committedBudget, dashboard.totalBudget)}% ngân sách`} accent="amber" />
            <StatCard icon="schedule" label="Hết hạn / Giữ" value={`${dashboard.totalExpired} / ${dashboard.totalReserved}`}
              sub={`${dashboard.totalUsed} voucher đã redeem`} accent="rose" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className={`${card} p-4 lg:col-span-1`}>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3">Trạng thái voucher</h3>
              {statusChart.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Chưa có voucher</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {statusChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [v, "Số lượng"]} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className={`${card} p-4 lg:col-span-1`}>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3">Loại voucher</h3>
              {typeChart.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Chưa có dữ liệu</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={typeChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fontWeight: 600 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className={`${card} p-4 lg:col-span-1`}>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3">Top chiến dịch (đã phát)</h3>
              {campaignBarChart.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Chưa có chiến dịch</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={campaignBarChart} margin={{ bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 600 }} interval={0} angle={-20} textAnchor="end" height={52} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="issued" name="Đã phát" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="used" name="Đã dùng" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid xl:grid-cols-5 gap-4">
            <div className={`${card} p-4 xl:col-span-2`}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">Danh sách chiến dịch</h3>
                <input
                  type="text"
                  placeholder="Tìm tên / process key…"
                  value={campaignSearch}
                  onChange={e => setCampaignSearch(e.target.value)}
                  className="w-40 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredCampaigns.map(c => {
                  const pct = budgetPercent(c.committedBudget, c.totalBudget);
                  const active = c.campaignId === selectedCampaignId;
                  return (
                    <button
                      key={c.campaignId}
                      type="button"
                      onClick={() => setSelectedCampaignId(c.campaignId)}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        active
                          ? "border-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-emerald-400/40"
                          : "border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800 dark:text-white truncate">{c.campaignName}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{c.bpmnProcessDefinitionKey || "—"}</p>
                        </div>
                        <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {c.active ? "ON" : "OFF"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        <span>Phát: {c.totalIssued}</span>
                        <span>Dùng: {c.totalUsed}</span>
                        <span>CR: {c.conversionRate}%</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1">{formatMoney(c.committedBudget)} / {formatMoney(c.totalBudget)} cam kết</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`${card} p-4 xl:col-span-3`}>
              {selectedCampaign ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-800 dark:text-white">{selectedCampaign.campaignName}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Trigger: {selectedCampaign.triggerType || "—"} · Instance: {selectedCampaign.activeProcessInstances}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(selectedCampaign.startDate)} → {formatDate(selectedCampaign.endDate)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="rounded-xl px-3 py-2 bg-emerald-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                        <p className="text-[9px] font-bold uppercase text-slate-500">Phát</p>
                        <p className="text-lg font-extrabold text-slate-800 dark:text-white">{selectedCampaign.totalIssued}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2 bg-blue-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                        <p className="text-[9px] font-bold uppercase text-slate-500">Dùng</p>
                        <p className="text-lg font-extrabold text-slate-800 dark:text-white">{selectedCampaign.totalUsed}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                        <p className="text-[9px] font-bold uppercase text-slate-500">Hết hạn</p>
                        <p className="text-lg font-extrabold text-slate-800 dark:text-white">{selectedCampaign.totalExpired}</p>
                      </div>
                      <div className="rounded-xl px-3 py-2 bg-amber-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700">
                        <p className="text-[9px] font-bold uppercase text-slate-500">Giữ</p>
                        <p className="text-lg font-extrabold text-slate-800 dark:text-white">{selectedCampaign.totalReserved}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-2 mb-4 text-xs font-semibold">
                    <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 px-3 py-2 border border-violet-100 dark:border-violet-900">
                      Giảm %: <strong>{selectedCampaign.totalPercent}</strong>
                    </div>
                    <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 px-3 py-2 border border-cyan-100 dark:border-cyan-900">
                      Giảm tiền: <strong>{selectedCampaign.totalFixed}</strong>
                    </div>
                    <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 px-3 py-2 border border-orange-100 dark:border-orange-900">
                      Freeship: <strong>{selectedCampaign.totalFreeship}</strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h4 className="text-sm font-extrabold text-slate-800 dark:text-white">Voucher đã phát</h4>
                    <select
                      value={voucherFilter}
                      onChange={e => setVoucherFilter(e.target.value)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="UNUSED">Chưa dùng</option>
                      <option value="USED">Đã dùng</option>
                      <option value="RESERVED">Đang giữ</option>
                      <option value="EXPIRED">Hết hạn</option>
                    </select>
                  </div>

                  {vouchersLoading ? (
                    <p className="text-xs text-slate-400 py-6 text-center">Đang tải voucher…</p>
                  ) : filteredVouchers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">Không có voucher phù hợp bộ lọc.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3 py-2.5 font-bold">Mã</th>
                            <th className="px-3 py-2.5 font-bold">Loại</th>
                            <th className="px-3 py-2.5 font-bold">User</th>
                            <th className="px-3 py-2.5 font-bold">Trạng thái</th>
                            <th className="px-3 py-2.5 font-bold">Hết hạn</th>
                            <th className="px-3 py-2.5 font-bold">Đơn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {filteredVouchers.slice(0, 50).map(v => (
                            <tr key={v.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                              <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">{v.code}</td>
                              <td className="px-3 py-2">{typeLabel(v.voucherType)}</td>
                              <td className="px-3 py-2">#{v.userId}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  v.status === "USED" ? "bg-blue-100 text-blue-700"
                                  : v.status === "UNUSED" ? "bg-emerald-100 text-emerald-700"
                                  : v.status === "RESERVED" ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                                }`}>
                                  {statusLabel(v.status)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">{formatDate(v.expiresAt)}</td>
                              <td className="px-3 py-2">{v.usedOrderId ? `#${v.usedOrderId}` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredVouchers.length > 50 && (
                        <p className="text-[10px] text-slate-400 px-3 py-2 border-t border-slate-100">
                          Hiển thị 50 / {filteredVouchers.length} voucher
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 py-16 text-center">Chọn một chiến dịch để xem chi tiết</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
