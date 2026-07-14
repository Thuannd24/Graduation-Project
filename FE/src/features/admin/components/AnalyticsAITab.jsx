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
import { formatVnd } from "../../../utils/format.js";

export default function AnalyticsAITab() {
  const [activeSubTab, setActiveSubTab] = useState("forecasting");
  
  // States for data
  const [forecastData, setForecastData] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      aiApi.getDemandForecasting(),
      aiApi.getAnomalyLogs(),
      aiApi.getCustomerSegmentation()
    ])
      .then(([forecast, logs, segs]) => {
        setForecastData(forecast);
        setAnomalies(logs);
        setSegments(segs);
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

  // Handle actions
  const handleMarkClear = (id) => {
    setAnomalies(prev => prev.filter(item => item.id !== id));
    alert(`Đã gỡ cờ đỏ và đánh dấu giao dịch ${id} là An toàn.`);
  };

  const handleFreezeUser = (username) => {
    alert(`Đã tạm khóa tài khoản của khách hàng: ${username}. Yêu cầu xác thực bảo mật đã được gửi.`);
  };

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
              {/* Forecasting chart */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
                      Biểu đồ Dự Báo Doanh Số & Nhu Cầu Tồn Kho (30 ngày)
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Model: LightGBM & Facebook Prophet • Độ chính xác: MAPE ~ 4.2%
                    </p>
                  </div>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 px-3 py-1 rounded-full font-bold">
                    Dự báo tự động cập nhật lúc 00:00 hàng ngày
                  </span>
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

              {/* Warning stock recommendations table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">
                      Khuyến Nghị Tối Ưu Hóa Tồn Kho (Inventory Planning AI)
                    </h3>
                    <p className="text-[10.5px] text-slate-400 font-medium">Các mặt hàng dự báo sẽ thiếu hụt trong chu kỳ bán hàng tiếp theo.</p>
                  </div>
                  <Icon name="warning" className="text-amber-500 animate-bounce" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-900/60 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="p-4 font-bold text-[10px] uppercase">Sản phẩm</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-center">Tồn Kho Hiện Tại</th>
                        <th className="p-4 font-bold text-[10px] uppercase text-center">Nhu Cầu Dự Báo (30 ngày)</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Trạng Thái</th>
                        <th className="p-4 font-bold text-[10px] uppercase">Hành Động Khuyến Nghị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="p-4 font-extrabold text-slate-700 dark:text-slate-300">iPhone 15 Pro Max 256GB Titanium</td>
                        <td className="p-4 text-center font-extrabold text-slate-600 dark:text-slate-400">12 chiếc</td>
                        <td className="p-4 text-center font-extrabold text-rose-500">45 chiếc</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-50 dark:bg-rose-950/20 text-rose-600">
                            Cực kỳ thiếu hụt (Rủi ro Out-of-Stock)
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-500">
                          <button className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold border-none cursor-pointer transition-all shadow-sm">
                            Tạo Đơn Nhập Kho Khẩn Cấp
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-extrabold text-slate-700 dark:text-slate-300">Sony WH-1000XM5 Wireless Headphones</td>
                        <td className="p-4 text-center font-extrabold text-slate-600 dark:text-slate-400">5 chiếc</td>
                        <td className="p-4 text-center font-extrabold text-rose-500">22 chiếc</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-rose-50 dark:bg-rose-950/20 text-rose-600">
                            Cần bổ sung kho
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-500">
                          <button className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold border-none cursor-pointer transition-all shadow-sm">
                            Tạo Đơn Nhập Kho Khẩn Cấp
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 font-extrabold text-slate-700 dark:text-slate-300">Bàn phím cơ ASUS ROG Strix Scope II</td>
                        <td className="p-4 text-center font-extrabold text-slate-600 dark:text-slate-400">42 chiếc</td>
                        <td className="p-4 text-center font-extrabold text-emerald-600">18 chiếc</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600">
                            Dư thừa tồn kho
                          </span>
                        </td>
                        <td className="p-4 font-bold text-slate-500">
                          <span className="text-[10px] text-slate-400 font-semibold">Khuyến nghị tạo Campaign Xả hàng/Khuyến mãi</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===================== VIEW 2: ANOMALY DETECTION ===================== */}
          {activeSubTab === "anomalies" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">
                      Danh Sách Cảnh Báo Giao Dịch Bất Thường (LSTM Autoencoder)
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
                                onClick={() => handleMarkClear(item.id)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-[9px] font-bold cursor-pointer transition-all"
                              >
                                Đánh Dấu Sạch
                              </button>
                              <button
                                onClick={() => handleFreezeUser(item.user)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold border-none cursor-pointer transition-all shadow-sm"
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Segmentation breakdown chart */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
                      Mô hình Phân Cụm Khách Hàng (K-Means & RFM)
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
                    <Icon name="campaign" /> Kích hoạt Chiến Dịch Khuyến Mãi Nhắm Mục Tiêu (Targeted AI Campaign)
                  </h4>
                  <p className="text-[11px] text-white/80 font-medium max-w-2xl leading-relaxed">
                    Hệ thống AI đề xuất gửi mã giảm giá <strong>Giảm 10% Phụ kiện</strong> cho nhóm <strong>Khách hàng nguy cơ rời bỏ</strong> để tăng tỉ lệ giữ chân (Retention rate) và kích thích tái mua sắm.
                  </p>
                </div>
                <button
                  onClick={() => alert("Chiến dịch AI Targeted Campaign đã được khởi tạo! 220 Khách hàng đã được gửi email thông báo.")}
                  className="px-6 py-3 bg-white hover:bg-rose-50 text-rose-600 font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-none transition-all active:scale-[0.98] shrink-0"
                >
                  Kích Hoạt Chiến Dịch Ngay
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
