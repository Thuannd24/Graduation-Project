import React, { useMemo, useState } from "react";
import Icon from "../../../components/common/Icon.jsx";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const ORDER_STATUS_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Đang chờ" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "cancelled", label: "Đã hủy" }
];

const CATEGORY_COLOR_CLASSES = [
  "bg-emerald-50 text-emerald-600",
  "bg-sky-50 text-sky-600",
  "bg-amber-50 text-amber-600",
  "bg-violet-50 text-violet-600",
  "bg-rose-50 text-rose-600"
];

export default function OverviewTab({
  orders,
  products,
  categories,
  loading,
  setActiveTab,
  handleQuickAddTemplate,
  salesStr,
  ordersCountStr,
  totalOrdersCount,
  newOrdersCount,
  completedOrdersCount,
  canceledOrdersCount,
  pendingOrdersCount
}) {
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Tính dữ liệu báo cáo tuần từ đơn hàng thực tế
  const dailyReportData = useMemo(() => {
    const today = new Date();
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      
      const name = day.toLocaleDateString("vi-VN", { weekday: "short" });
      const dayOrders = orders.filter(o => {
        if (!o.createdAt) return false;
        const d = new Date(o.createdAt);
        return d >= day && d <= dayEnd;
      });
      
      const revenue = dayOrders
        .filter(o => ["DELIVERED", "CONFIRMED", "SHIPPED"].includes(o.status))
        .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
        
      data.push({
        name,
        "Doanh thu (M)": parseFloat((revenue / 1000000).toFixed(1)),
        "Số đơn": dayOrders.length
      });
    }
    return data;
  }, [orders]);

  // Tỷ lệ trạng thái đơn hàng (để vẽ Donut chart)
  const statusDistributionData = useMemo(() => {
    const counts = {
      DELIVERED: 0,
      SHIPPED: 0,
      CONFIRMED: 0,
      AWAITING_PAYMENT: 0,
      CANCELLED: 0,
      PENDING: 0
    };
    orders.forEach(o => {
      const status = String(o.status || "").toUpperCase();
      if (counts[status] !== undefined) {
        counts[status]++;
      } else {
        counts.PENDING++;
      }
    });
    return [
      { name: "Đã giao thành công", value: counts.DELIVERED, color: "#10b981" },
      { name: "Đang vận chuyển", value: counts.SHIPPED, color: "#3b82f6" },
      { name: "Đã xác nhận", value: counts.CONFIRMED, color: "#06b6d4" },
      { name: "Chờ thanh toán", value: counts.AWAITING_PAYMENT + counts.PENDING, color: "#f59e0b" },
      { name: "Đã hủy", value: counts.CANCELLED, color: "#ef4444" }
    ].filter(item => item.value > 0);
  }, [orders]);

  // Phân tích doanh số theo danh mục sản phẩm từ đơn hàng thực tế
  const categorySalesData = useMemo(() => {
    const categoryNameById = {};
    (categories || []).forEach(c => {
      if (c && c.id != null) categoryNameById[String(c.id)] = c.name || c.label || "Khác";
    });

    const categoryMap = {};
    orders.forEach(o => {
      const items = o.items || [];
      items.forEach(item => {
        const prod = products.find(p => String(p.id) === String(item.productId));
        const cat = (prod?.categoryId != null && categoryNameById[String(prod.categoryId)]) || prod?.category || "Khác";
        categoryMap[cat] = (categoryMap[cat] || 0) + (item.subtotal || (item.unitPrice || 0) * (item.quantity || 0));
      });
    });
    const entries = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      return [];
    }
    return entries.slice(0, 5).map(([name, val]) => ({
      name,
      value: parseFloat((val / 1000000).toFixed(1))
    }));
  }, [orders, products, categories]);

  // Đơn hàng mới trong 30 phút gần nhất, tính theo từng phút từ thời gian tạo đơn thực tế
  const recentOrdersData = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 30 }, (_, i) => ({ minute: 30 - i, count: 0 }));
    orders.forEach(o => {
      if (!o.createdAt) return;
      const diffMs = now - new Date(o.createdAt);
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin >= 0 && diffMin < 30) {
        buckets[29 - diffMin].count += 1;
      }
    });
    return buckets;
  }, [orders]);

  const recentOrdersCount = useMemo(
    () => recentOrdersData.reduce((sum, b) => sum + b.count, 0),
    [recentOrdersData]
  );

  // So sánh doanh thu 7 ngày trước
  const prevWeekData = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);
    const thisWeekSales = orders
      .filter(o => o && ["DELIVERED", "CONFIRMED", "SHIPPED"].includes(o.status) && new Date(o.createdAt) >= oneWeekAgo)
      .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
    const lastWeekSales = orders
      .filter(o => o && ["DELIVERED", "CONFIRMED", "SHIPPED"].includes(o.status) && new Date(o.createdAt) >= twoWeeksAgo && new Date(o.createdAt) < oneWeekAgo)
      .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
    const thisWeekOrders = orders.filter(o => new Date(o.createdAt) >= oneWeekAgo).length;
    const lastWeekOrders = orders.filter(o => new Date(o.createdAt) >= twoWeeksAgo && new Date(o.createdAt) < oneWeekAgo).length;
    return {
      prevSales: (lastWeekSales / 1000000).toFixed(1) + "M đ",
      prevOrders: lastWeekOrders >= 1000 ? (lastWeekOrders / 1000).toFixed(1) + "K" : String(lastWeekOrders),
      salesChange: lastWeekSales > 0 ? (((thisWeekSales - lastWeekSales) / lastWeekSales) * 100).toFixed(1) : "0",
      ordersChange: lastWeekOrders > 0 ? (((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100).toFixed(1) : "0"
    };
  }, [orders]);

  // Doanh số theo tỉnh/thành, trích xuất từ địa chỉ giao hàng thực tế của đơn hàng
  const regionSales = useMemo(() => {
    const regionMap = {};
    orders.forEach(o => {
      const addr = (o.shippingAddress || "").trim();
      if (!addr) return;
      const parts = addr.split(",").map(p => p.trim()).filter(Boolean);
      const region = parts.length > 0 ? parts[parts.length - 1] : "Khác";
      regionMap[region] = (regionMap[region] || 0) + (o.finalAmount || 0);
    });
    const entries = Object.entries(regionMap).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return [];
    const total = entries.reduce((s, e) => s + e[1], 0);
    return entries.slice(0, 4).map(([name, sales], idx) => ({
      name,
      colorClass: ["bg-blue-500", "bg-purple-500", "bg-sky-400", "bg-emerald-400"][idx] || "bg-slate-400",
      sales: sales >= 1000000 ? (sales / 1000000).toFixed(1) + "M" : Math.round(sales / 1000) + "k",
      percent: total > 0 ? ((sales / total) * 100).toFixed(1) : "0"
    }));
  }, [orders]);

  // Danh mục để "Thêm sản phẩm nhanh", lấy trực tiếp từ danh mục thực tế của hệ thống
  const quickAddCategories = useMemo(() => {
    return (categories || [])
      .filter(c => c && (c.name || c.label))
      .slice(0, 3)
      .map((c, idx) => {
        const name = c.name || c.label;
        return {
          id: c.id,
          name,
          initials: name.slice(0, 2).toUpperCase(),
          colorClasses: CATEGORY_COLOR_CLASSES[idx % CATEGORY_COLOR_CLASSES.length]
        };
      });
  }, [categories]);

  // Dùng products từ API, không có fallback
  const filteredProductsForList = (products || []).filter(p => p && p.name).slice(0, 4);

  const isPaidStatus = (status) => ["DELIVERED", "CONFIRMED", "SHIPPED"].includes(status);

  const filteredOrdersForTable = orders.filter(o => {
    if (transactionFilter === "all") return true;
    if (transactionFilter === "paid") return isPaidStatus(o.status);
    if (transactionFilter === "cancelled") return o.status === "CANCELLED";
    if (transactionFilter === "pending") return !isPaidStatus(o.status) && o.status !== "CANCELLED";
    return true;
  }).slice(0, 5);



  return (
    <div className="space-y-6 animate-fadeIn p-6">
      {/* Hàng 3 thẻ chỉ số chính */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Doanh thu */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doanh số đơn hàng (VNPAY & COD)</h4>
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{salesStr}</span>
              <p className="text-[9px] text-slate-400 font-medium mt-1 leading-normal">Tổng trị giá các đơn hàng đã Xác nhận / Đang giao / Đã giao</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">7 ngày trước: {prevWeekData.prevSales}</span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg flex items-center gap-0.5 ${parseFloat(prevWeekData.salesChange) >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
              {parseFloat(prevWeekData.salesChange) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(prevWeekData.salesChange))}%
            </span>
          </div>
        </div>

        {/* 2. Đơn hàng */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng đơn đặt hàng</h4>
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{ordersCountStr}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">7 ngày trước: {prevWeekData.prevOrders} đơn</span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg flex items-center gap-0.5 ${parseFloat(prevWeekData.ordersChange) >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
              {parseFloat(prevWeekData.ordersChange) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(prevWeekData.ordersChange))}%
            </span>
          </div>
        </div>

        {/* 3. Đơn hủy & Chờ xử lý */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chờ xử lý & Hủy</h4>
              <div className="flex items-baseline gap-4 mt-1">
                <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{pendingOrdersCount}</span>
                <span className="text-xs text-slate-400 font-bold">Chờ</span>
                <span className="text-2xl font-extrabold text-rose-600 tracking-tight">{canceledOrdersCount}</span>
                <span className="text-xs text-rose-400 font-bold">Hủy</span>
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">Tỷ lệ hủy: ~{totalOrdersCount > 0 ? ((canceledOrdersCount / totalOrdersCount) * 100).toFixed(1) : "0"}%</span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg flex items-center gap-0.5 ${parseFloat(prevWeekData.ordersChange) >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
              {parseFloat(prevWeekData.ordersChange) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(prevWeekData.ordersChange))}%
            </span>
          </div>
        </div>
      </div>

      {/* Hàng biểu đồ chính thứ nhất: Doanh thu & Phân bố trạng thái */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ Doanh thu & Lượng đơn hàng (8 Cột) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hiệu suất bán hàng</h4>
              <h3 className="text-lg font-extrabold text-slate-800 mt-1">Xu hướng Doanh thu & Đơn hàng</h3>
            </div>
            <div className="flex items-center gap-2 bg-slate-100/70 p-1 rounded-xl">
              <span className="text-xs px-3 py-1 bg-white rounded-lg shadow-sm font-bold text-slate-700">7 ngày qua</span>
            </div>
          </div>

          <div className="w-full">
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <AreaChart data={dailyReportData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "800" }}
                />
                <Area yAxisId="left" type="monotone" dataKey="Doanh thu (M)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name="Doanh thu (M đ)" />
                <Area yAxisId="right" type="monotone" dataKey="Số đơn" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" name="Số lượng đơn" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ Donut trạng thái đơn hàng (4 Cột) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trạng thái đơn hàng</h4>
            <h3 className="text-lg font-extrabold text-slate-800 mt-1">Phân bố trạng thái</h3>
          </div>
          <div className="w-full h-48 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Text ở giữa Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-4">
              <span className="text-2xl font-black text-slate-850">{orders.length}</span>
              <span className="text-[9px] text-slate-450 font-extrabold uppercase tracking-widest">Đơn hàng</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 pt-3 border-t border-slate-100">
            {statusDistributionData.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }}></span>
                <span className="truncate">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hàng biểu đồ chính thứ hai: Doanh số Danh mục & Người dùng trực tuyến + Quốc gia */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ Cột doanh thu danh mục (6 Cột) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân tích Sản phẩm</h4>
            <h3 className="text-lg font-extrabold text-slate-800 mt-1">Doanh thu theo danh mục</h3>
          </div>
          
          <div className="w-full mt-4">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <BarChart data={categorySalesData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} name="Doanh thu (M đ)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Đơn hàng mới & Doanh số theo khu vực (6 Cột) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-1">
            <div>
              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Đơn hàng mới (30 phút qua)</h4>
              <span className="text-3xl font-extrabold text-slate-850 tracking-tight">{recentOrdersCount}</span>
            </div>
            <button className="text-slate-450 hover:text-slate-650">
              <Icon name="more_vert" />
            </button>
          </div>

          <span className="text-[10px] text-slate-400 font-medium">Số đơn hàng tạo mới mỗi phút</span>

          <div className="w-full mt-3 relative">
            <ResponsiveContainer width="100%" height={64} minWidth={0}>
              <AreaChart data={recentOrdersData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecentOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", borderRadius: "10px", border: "none", color: "#fff", fontSize: "10px", fontWeight: "700", padding: "4px 8px" }}
                  labelFormatter={(m) => `${m} phút trước`}
                  formatter={(v) => [`${v} đơn`, "Số đơn"]}
                />
                <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRecentOrders)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
            {recentOrdersCount === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] text-slate-300 font-semibold">Chưa có đơn hàng mới</span>
              </div>
            )}
          </div>

          {/* Doanh số theo khu vực */}
          <div className="mt-6 space-y-4 pt-4 border-t border-slate-50">
            <div className="flex justify-between items-center text-xs font-bold text-slate-800">
              <span>Doanh Số Theo Khu Vực</span>
              <span>Doanh Số</span>
            </div>

            {regionSales.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-medium py-2">Chưa có dữ liệu địa chỉ giao hàng.</p>
            ) : (
              regionSales.map((r, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] ${r.colorClass}`}>
                        <Icon name="location_on" className="text-xs" />
                      </span>
                      <span className="font-extrabold text-slate-700 block text-xs">{r.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-slate-850 block text-xs">{r.sales}đ</span>
                      <span className="text-[9px] text-emerald-600 font-bold">{r.percent}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.colorClass}`} style={{ width: `${Math.max(20, r.percent)}%` }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hàng bảng biểu và danh sách bán chạy */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bảng Giao Dịch Gần Đây (8 Cột) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden hover:shadow-md transition-all flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white relative">
            <h4 className="text-sm font-extrabold text-slate-800">Giao dịch gần đây</h4>
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100/60 rounded-lg text-xs font-bold text-emerald-700 transition-colors"
              >
                <Icon name="filter_list" className="text-sm" />
                <span>{ORDER_STATUS_FILTERS.find(f => f.value === transactionFilter)?.label || "Bộ Lọc"}</span>
              </button>
              {isFilterOpen && (
                <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {ORDER_STATUS_FILTERS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => { setTransactionFilter(f.value); setIsFilterOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${
                        transactionFilter === f.value ? "text-emerald-700 bg-emerald-50/60" : "text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Đang tải danh sách giao dịch...</div>
          ) : filteredOrdersForTable.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">Không có dữ liệu giao dịch.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 text-slate-400 border-b border-slate-100">
                    <th className="p-4 font-bold text-[10px] uppercase">STT</th>
                    <th className="p-4 font-bold text-[10px] uppercase">Mã Đơn Hàng</th>
                    <th className="p-4 font-bold text-[10px] uppercase">Ngày Đặt</th>
                    <th className="p-4 font-bold text-[10px] uppercase">Trạng Thái</th>
                    <th className="p-4 font-bold text-[10px] uppercase text-right">Số Tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrdersForTable.map((o, idx) => (
                    <tr key={o.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-4 font-semibold text-slate-400">{idx + 1}.</td>
                      <td className="p-4 font-extrabold text-slate-700">#{o.id}</td>
                      <td className="p-4 text-slate-500">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString("vi-VN") : "21-06-2026"}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === "DELIVERED" || o.status === "CONFIRMED" || o.status === "SHIPPED"
                            ? "bg-emerald-50 text-emerald-700"
                            : o.status === "CANCELLED"
                            ? "bg-rose-50 text-rose-650"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            o.status === "DELIVERED" || o.status === "CONFIRMED" || o.status === "SHIPPED"
                              ? "bg-emerald-500"
                              : o.status === "CANCELLED"
                              ? "bg-rose-500"
                              : "bg-amber-500"
                          }`}></span>
                          {o.status === "DELIVERED" || o.status === "CONFIRMED" || o.status === "SHIPPED" ? "Đã thanh toán" : o.status === "CANCELLED" ? "Đã hủy" : "Đang chờ"}
                        </span>
                      </td>
                      <td className="p-4 font-extrabold text-slate-800 text-right">
                        {o.finalAmount?.toLocaleString("vi-VN")}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
            <button
              onClick={() => setActiveTab("orders")}
              className="text-xs px-4 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-650 transition-colors shadow-sm"
            >
              Chi tiết
            </button>
          </div>
        </div>

        {/* Cột phải: Top sản phẩm & Quick Add (4 Cột) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Top sản phẩm hàng đầu */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-extrabold text-slate-800">Sản phẩm hàng đầu</h4>
              <button
                onClick={() => setActiveTab("products")}
                className="text-[10px] font-extrabold text-emerald-650 hover:text-emerald-705"
              >
                Tất cả
              </button>
            </div>

            <div className="space-y-4">
              {filteredProductsForList.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center">
                      <img src={p.image} alt={p.name} className="w-full h-full object-contain rounded" />
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-700 text-xs block max-w-[150px] truncate">{p.name}</span>
                      <span className="text-[9px] text-slate-400 font-semibold block uppercase">Mã: #PROD-{String(p.id).slice(-4)}</span>
                    </div>
                  </div>
                  <span className="font-extrabold text-slate-800 text-xs text-right shrink-0">
                    {p.price?.toLocaleString("vi-VN")}đ
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Danh Mục Quick Add & Templates */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-xs font-extrabold text-slate-800">Thêm sản phẩm nhanh</h4>
                <button
                  onClick={() => setActiveTab("products")}
                  className="text-[10px] font-extrabold text-emerald-600 hover:text-emerald-700"
                >
                  Xem tất cả
                </button>
              </div>

              {/* Danh mục thực tế lấy từ hệ thống */}
              <div className="space-y-3">
                {quickAddCategories.length === 0 ? (
                  <p className="text-[10px] text-slate-400 font-medium py-2">Chưa có danh mục nào.</p>
                ) : (
                  quickAddCategories.map((cat) => (
                    <div key={cat.id ?? cat.name} className="flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/60 rounded-xl border border-slate-100/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${cat.colorClasses}`}>
                          {cat.initials}
                        </div>
                        <div>
                          <span className="font-extrabold text-slate-700 text-xs block">{cat.name}</span>
                          <span className="text-[9px] text-slate-400 font-medium">Thêm sản phẩm vào danh mục này</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleQuickAddTemplate("", cat.name)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-extrabold text-slate-600 shadow-sm transition-colors"
                      >
                        + Thêm
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
