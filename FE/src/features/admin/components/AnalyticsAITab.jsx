import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from "recharts";
import Icon from "../../../components/common/Icon.jsx";
import { aiApi } from "../../../services/aiApi.ts";
import { productApi } from "../../../services/productApi";
import { inventoryApi } from "../../../services/inventoryApi.ts";
import { formatVnd } from "../../../utils/format.js";

// Ngưỡng tồn thấp dùng cho khuyến nghị nhập hàng (khớp backend: quantity <= threshold).
const RESTOCK_THRESHOLD = 10;
const NOT_SUPPORTED = "Chưa hỗ trợ";

// Nhãn hiển thị rõ ràng cho mọi khối đang dùng số minh họa (không phải dữ liệu/model thật).
function DemoBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50"
      title="Số liệu minh họa, không phải kết quả từ dữ liệu thật"
    >
      <Icon name="science" className="text-[11px]" /> Dữ liệu minh họa
    </span>
  );
}

/** Khuyến nghị nhập hàng tính từ tồn kho THẬT: các SKU có tồn <= RESTOCK_THRESHOLD, thấp nhất lên đầu. */
async function loadRestockRecommendations() {
  const lowStock = await inventoryApi.getLowStock(RESTOCK_THRESHOLD);
  const top = [...lowStock].sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0)).slice(0, 10);
  const productIds = Array.from(new Set(top.map((r) => r.productId)));
  const details = await Promise.all(
    productIds.map((id) => productApi.adminGetProductDetail(id).catch(() => null))
  );
  const byId = new Map(details.filter(Boolean).map((d) => [String(d.id), d]));
  return top.map((r) => {
    const product = byId.get(String(r.productId));
    const variant = Array.isArray(product?.variants)
      ? product.variants.find((v) => Number(v?.id) === Number(r.variantId))
      : null;
    const variantLabel = variant?.variantAttr && typeof variant.variantAttr === "object"
      ? Object.values(variant.variantAttr).join(" / ")
      : "";
    return {
      key: `${r.productId}:${r.variantId ?? 0}`,
      productName: product?.name || `Sản phẩm #${r.productId}`,
      variantLabel,
      currentStock: Number(r.quantity ?? 0),
      status: Number(r.quantity ?? 0) <= 0 ? "out" : "low"
    };
  });
}

export default function AnalyticsAITab({ onNavigate }) {
  const [activeSubTab, setActiveSubTab] = useState("forecasting");
  
  // States for data
  const [forecastData, setForecastData] = useState(null);
  const [forecastMeta, setForecastMeta] = useState({ is_demo_data: true, note: null });
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesMeta, setAnomaliesMeta] = useState({ is_demo_data: true, note: null });
  const [segments, setSegments] = useState([]);
  const [segmentsMeta, setSegmentsMeta] = useState({ is_demo_data: false, note: null });
  const [stockRecommendations, setStockRecommendations] = useState([]);
  const [stockRecError, setStockRecError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      aiApi.getDemandForecasting(),
      aiApi.getAnomalyLogs(),
      aiApi.getCustomerSegmentation(),
      loadRestockRecommendations().catch((err) => {
        console.warn("Không tải được tồn kho cho khuyến nghị nhập hàng", err);
        setStockRecError("Không tải được dữ liệu tồn kho (cần đăng nhập ADMIN/STAFF).");
        return [];
      })
    ])
      .then(([forecast, logs, segs, restock]) => {
        setForecastData(forecast.data);
        setForecastMeta({ is_demo_data: forecast.is_demo_data, note: forecast.note });
        setAnomalies(logs.data);
        setAnomaliesMeta({ is_demo_data: logs.is_demo_data, note: logs.note });
        setSegments(segs.data);
        setSegmentsMeta({ is_demo_data: segs.is_demo_data, note: segs.note });
        setStockRecommendations(restock);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Format forecasting data for Recharts
  const chartData = useMemo(() => {
    if (!forecastData) return [];
    return forecastData.dates.map((date, idx) => ({
      name: date,
      "Thực tế": forecastData.actual[idx],
      "Dự báo (AI)": forecastData.forecast[idx]
    }));
  }, [forecastData]);

  // Các nút "Đánh dấu sạch", "Tạm khóa user", "Kích hoạt chiến dịch" trước đây chỉ hiện thông báo
  // giả (không gọi API nào) -> nay bị vô hiệu hóa kèm tooltip "Chưa hỗ trợ".

  // Banner minh bạch: 2/3 tab (demand-forecasting, anomalies) chưa có model thật đứng sau — dựng
  // bản thật là hướng phát triển riêng ngoài phạm vi tính năng churn-risk. Không ẩn đi để tránh
  // trình bày số minh họa như kết quả AI thật khi demo.
  const DemoDataBanner = ({ note }) =>
    note ? (
      <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 text-[11px] font-semibold">
        <Icon name="info" className="text-sm shrink-0 mt-0.5" />
        <span>{note}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-6 animate-fadeIn p-6 text-slate-800 dark:text-slate-200">
      
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-black uppercase rounded-full tracking-wider mb-2">
            <Icon name="bolt" className="text-sm" /> Aura AI Analytics
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">
            Trung Tâm Phân Tích & Dự Báo Trí Tuệ Nhân Tạo
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Hệ thống phân tích thông minh sử dụng các mô hình học máy phục vụ tối ưu hóa vận hành, quản trị kho và phòng chống rủi ro.
          </p>
        </div>

        {/* View Switcher buttons */}
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveSubTab("forecasting")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
              activeSubTab === "forecasting"
                ? "bg-rose-600 text-white shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent"
            }`}
          >
            <Icon name="trending_up" className="text-sm" />
            <span>Dự Báo Nhu Cầu</span>
          </button>
          <button
            onClick={() => setActiveSubTab("anomalies")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
              activeSubTab === "anomalies"
                ? "bg-rose-600 text-white shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent"
            }`}
          >
            <Icon name="gpp_bad" className="text-sm" />
            <span>Phát Hiện Bất Thường</span>
          </button>
          <button
            onClick={() => setActiveSubTab("segmentation")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
              activeSubTab === "segmentation"
                ? "bg-rose-600 text-white shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-transparent"
            }`}
          >
            <Icon name="groups_3" className="text-sm" />
            <span>Phân Cụm KH</span>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-rose-100 dark:border-rose-950/20 border-t-rose-600 animate-spin"></div>
          <p className="text-xs text-rose-600 dark:text-rose-400 font-bold animate-pulse">Đang truy xuất dữ liệu phân tích từ máy chủ AI...</p>
        </div>
      ) : (
        <>
          {/* ===================== VIEW 1: FORECASTING ===================== */}
          {activeSubTab === "forecasting" && (
            <div className="space-y-6">
              <DemoDataBanner note={forecastMeta.note} />
              {/* Forecasting chart */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                      Biểu đồ Dự Báo Doanh Số & Nhu Cầu Tồn Kho (30 ngày)
                      {forecastMeta.is_demo_data !== false && <DemoBadge />}
                    </h3>
                  </div>
                </div>

                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                        labelStyle={{ color: "#94a3b8", fontWeight: "800" }}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px", fontWeight: "700" }} />
                      <Area type="monotone" dataKey="Thực tế" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                      <Area type="monotone" dataKey="Dự báo (AI)" stroke="#f43f5e" strokeWidth={3} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorForecast)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Khuyến nghị nhập hàng: tính từ tồn kho thật (không phải dự báo) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">
                      Khuyến Nghị Nhập Hàng (theo tồn kho thực tế)
                    </h3>
                    <p className="text-[10.5px] text-slate-400 font-medium">
                      Các SKU có tồn kho ≤ {RESTOCK_THRESHOLD}, sắp xếp từ thấp nhất. Chưa tính tốc độ bán / dự báo nhu cầu.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 shrink-0">
                    <Icon name="database" className="text-[11px]" /> Dữ liệu thật
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-900/60 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="p-4 font-bold text-[10px] uppercase">Sản phẩm</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-center">Tồn Kho Hiện Tại</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Trạng Thái</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {stockRecommendations.map((rec) => (
                        <tr key={rec.key}>
                          <td className="p-4 font-extrabold text-slate-700 dark:text-slate-300">
                            <span className="line-clamp-2">{rec.productName}</span>
                            {rec.variantLabel && (
                              <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">{rec.variantLabel}</span>
                            )}
                          </td>
                          <td className="p-4 text-center font-extrabold text-slate-600 dark:text-slate-400">
                            {rec.currentStock}
                          </td>
                          <td className="p-4">
                            {rec.status === "out" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-50 dark:bg-rose-950/20 text-rose-600">
                                Hết hàng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-amber-50 dark:bg-amber-950/20 text-amber-600">
                                Sắp hết (≤ {RESTOCK_THRESHOLD})
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-500">
                            <button
                              type="button"
                              onClick={() => onNavigate && onNavigate("inventory")}
                              disabled={!onNavigate}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold border-none cursor-pointer transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Nhập kho
                            </button>
                          </td>
                        </tr>
                      ))}
                      {stockRecommendations.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                            {stockRecError || `Không có SKU nào tồn kho ≤ ${RESTOCK_THRESHOLD}.`}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================== VIEW 2: ANOMALY DETECTION ===================== */}
          {activeSubTab === "anomalies" && (
            <div className="space-y-6">
              <DemoDataBanner note={anomaliesMeta.note} />
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                      Danh Sách Cảnh Báo Giao Dịch Bất Thường
                      {anomaliesMeta.is_demo_data !== false && <DemoBadge />}
                    </h3>
                    <p className="text-[10.5px] text-slate-400 font-medium">
                      Các giao dịch mua sắm có dấu hiệu bất thường về mặt hành vi, số lượng hoặc thanh toán được AI gắn cờ đỏ rủi ro.
                    </p>
                  </div>
                  <Icon name="gpp_bad" className="text-rose-600 animate-pulse text-lg" />
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-900/60 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="p-4 font-bold text-[10px] uppercase w-28">Mã Giao Dịch</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Thời Gian</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Khách Hàng</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-right">Số Tiền</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-center w-28">Chỉ Số Rủi Ro</th>
                        <th className="p-4 font-bold text-[10px] uppercase w-64">Lý do Cảnh Báo từ AI</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-center w-40">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                      {anomalies.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <td className="p-4 font-extrabold text-slate-900 dark:text-white">{item.id}</td>
                          <td className="p-4 text-xs font-medium text-slate-400">{item.timestamp}</td>
                          <td className="p-4 text-xs font-semibold">{item.user}</td>
                          <td className="p-4 text-right font-black text-slate-800 dark:text-white">{formatVnd(item.amount)}</td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black ${
                              item.riskScore >= 80 ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              {item.riskScore}%
                            </span>
                          </td>
                          <td className="p-4 text-xs text-rose-600 dark:text-rose-400 font-bold leading-normal">{item.reason}</td>
                          <td className="p-4 text-center">
                            <div className="flex gap-2 justify-center">
                              <button
                                type="button"
                                disabled
                                title={NOT_SUPPORTED}
                                className="px-2.5 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg text-[9px] font-bold opacity-50 cursor-not-allowed"
                              >
                                Đánh Dấu Sạch
                              </button>
                              <button
                                type="button"
                                disabled
                                title={NOT_SUPPORTED}
                                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[9px] font-bold border-none opacity-50 cursor-not-allowed shadow-sm"
                              >
                                Tạm Khóa User
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {anomalies.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">Không phát hiện giao dịch bất thường nào trong hàng đợi.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================== VIEW 3: CUSTOMER SEGMENTATION ===================== */}
          {activeSubTab === "segmentation" && (
            <div className="space-y-6">
              <DemoDataBanner note={segmentsMeta.note} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Segmentation breakdown chart */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                      Mô hình Phân Cụm Khách Hàng (K-Means & RFM)
                      {segmentsMeta.is_demo_data && <DemoBadge />}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Phân chia khách hàng dựa trên tần suất mua (Frequency), mức chi tiêu (Monetary) và thời gian tương tác gần nhất (Recency).
                    </p>
                  </div>

                  <div className="w-full h-72 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={segments} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                        <XAxis dataKey="segment" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                          labelStyle={{ color: "#94a3b8", fontWeight: "800" }}
                        />
                        <Bar dataKey="count" radius={[10, 10, 0, 0]} name="Số lượng khách hàng">
                          {segments.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie chart with spend contribution ratio */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
                      Tỷ lệ Đóng Góp Doanh Thu
                    </h3>
                    <p className="text-[10.5px] text-slate-400 font-medium">Tỷ trọng doanh số mang lại theo từng phân khúc khách hàng.</p>
                  </div>

                  <div className="w-full h-44 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={segments}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={5}
                          dataKey="spendRatio"
                          nameKey="segment"
                        >
                          {segments.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#fff", fontSize: "10px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 mt-4">
                    {segments.map(seg => (
                      <div key={seg.segment} className="flex items-center justify-between text-[11px] font-bold">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                          <span className="text-slate-500 truncate max-w-[150px]">{seg.segment}</span>
                        </div>
                        <span className="text-slate-800 dark:text-white">{seg.spendRatio}% Doanh thu</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action targeting box */}
              <div className="bg-gradient-to-r from-rose-500 to-red-600 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1 text-center md:text-left">
                  <h4 className="text-sm font-extrabold tracking-tight flex items-center gap-1.5 justify-center md:justify-start">
                    <Icon name="campaign" /> Đề xuất chiến dịch khuyến mãi nhắm mục tiêu
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[9px] font-black uppercase tracking-wider">Chưa hỗ trợ tự động</span>
                  </h4>
                  <p className="text-[11px] text-white/80 font-medium max-w-2xl leading-relaxed">
                    Gợi ý: gửi mã <strong>Giảm 10% đơn tiếp theo</strong> cho nhóm <strong>Khách hàng nguy cơ rời bỏ</strong> để tăng tỉ lệ giữ chân. Nút kích hoạt tự động chưa được nối với hệ thống chiến dịch.
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled
                    title={`${NOT_SUPPORTED} — tạo chiến dịch tại mục Quy trình khuyến mãi`}
                    className="px-6 py-3 bg-white text-rose-600 font-extrabold text-xs rounded-xl shadow-md border-none opacity-60 cursor-not-allowed"
                  >
                    Kích Hoạt Chiến Dịch Ngay
                  </button>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate("campaigns")}
                      className="text-[10px] font-bold text-white/90 underline bg-transparent border-none cursor-pointer"
                    >
                      Tạo chiến dịch thủ công
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
