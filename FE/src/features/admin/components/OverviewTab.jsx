import React, { useMemo } from "react";
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

export default function OverviewTab({
  orders,
  products,
  loading,
  setActiveTab,
  handleQuickAddTemplate,
  salesStr,
  ordersCountStr,
  totalOrdersCount,
  newOrdersCount,
  completedOrdersCount,
  canceledOrdersCount,
  pendingOrdersCount,
  productSearch,
  setProductSearch
}) {
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
    const categoryMap = {};
    orders.forEach(o => {
      const items = o.items || [];
      items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        const cat = prod?.category || "Khác";
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
  }, [orders, products]);

  // Tính dữ liệu người dùng trực tuyến từ đơn hàng
  const liveUsersData = useMemo(() => {
    const base = Math.max(orders.length, 1);
    return Array.from({ length: 30 }, (_, i) => ({
      minute: i + 1,
      users: Math.max(0, Math.round(base * 0.03))
    }));
  }, [orders]);

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

  // Tính dữ liệu doanh số theo quốc gia (từ đơn hàng)
  const countrySales = useMemo(() => {
    const countryMap = {};
    orders.forEach(o => {
      const addr = o.shippingAddress || "";
      let country = "Việt Nam";
      if (addr.includes("USA") || addr.includes("US") || addr.includes("New York")) country = "Mỹ";
      else if (addr.includes("UK") || addr.includes("London")) country = "Anh";
      else if (addr.includes("JP") || addr.includes("Tokyo")) country = "Nhật Bản";
      else if (addr.includes("KR") || addr.includes("Seoul")) country = "Hàn Quốc";
      else if (addr.includes("AU") || addr.includes("Sydney")) country = "Úc";
      countryMap[country] = (countryMap[country] || 0) + (o.finalAmount || 0);
    });
    const entries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      return [];
    }
    return entries.slice(0, 4).map(([name, sales]) => {
      const total = entries.reduce((s, e) => s + e[1], 0);
      return {
        name,
        flag: name === "Mỹ" ? "🇺🇸" : name === "Anh" ? "🇬🇧" : name === "Nhật Bản" ? "🇯🇵" : name === "Hàn Quốc" ? "🇰🇷" : name === "Úc" ? "🇦🇺" : "🇻🇳",
        region: name === "Việt Nam" ? "Đông Nam Á" : name === "Mỹ" ? "Bắc Mỹ" : name === "Anh" ? "Châu Âu" : name === "Nhật Bản" ? "Đông Á" : name === "Hàn Quốc" ? "Đông Á" : name === "Úc" ? "Châu Đại Dương" : "Khác",
        sales: Math.round(sales / 1000) + "k",
        percent: total > 0 ? ((sales / total) * 100).toFixed(1) : "0"
      };
    });
  }, [orders]);

  // Dùng products từ API, không có fallback
  const filteredProductsForList = (products || []).filter(p =>
    p && p.name && String(p.name).toLowerCase().includes((productSearch || "").toLowerCase())
  ).slice(0, 4);



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

        {/* Người dùng trực tuyến & Quốc gia (6 Cột) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-1">
            <div>
              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Người dùng trực tuyến (30p)</h4>
              <span className="text-3xl font-extrabold text-slate-850 tracking-tight">{orders.length > 0 ? (orders.length * 1.5).toFixed(0) : "0"}</span>
            </div>
            <button className="text-slate-450 hover:text-slate-650">
              <Icon name="more_vert" />
            </button>
          </div>

          <span className="text-[10px] text-slate-400 font-medium">Lượt truy cập mỗi phút</span>

          <div className="w-full mt-3">
            <ResponsiveContainer width="100%" height={64} minWidth={0}>
              <BarChart data={liveUsersData}>
                <Bar dataKey="users" fill="#10b981" radius={[2, 2, 0, 0]} barSize={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Doanh số quốc gia */}
          <div className="mt-6 space-y-4 pt-4 border-t border-slate-50">
            <div className="flex justify-between items-center text-xs font-bold text-slate-800">
              <span>Doanh Số Theo Quốc Gia</span>
              <span>Doanh Số</span>
            </div>

            {countrySales.map((c, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{c.flag}</span>
                    <div>
                      <span className="font-extrabold text-slate-700 block text-xs">{c.name}</span>
                      <span className="text-[9px] text-slate-400 font-medium">{c.region}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-slate-850 block text-xs">{c.sales}</span>
                    <span className="text-[9px] text-emerald-600 font-bold">▲ {c.percent}%</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-purple-500' : idx === 2 ? 'bg-sky-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(20, 100 - idx * 15)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hàng bảng biểu và danh sách bán chạy */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bảng Giao Dịch Gần Đây (8 Cột) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden hover:shadow-md transition-all flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
            <h4 className="text-sm font-extrabold text-slate-800">Giao dịch gần đây</h4>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100/60 rounded-lg text-xs font-bold text-emerald-700 transition-colors">
              <Icon name="filter_list" className="text-sm" />
              <span>Bộ Lọc</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Đang tải danh sách giao dịch...</div>
          ) : orders.length === 0 ? (
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
                  {orders.slice(0, 5).map((o, idx) => (
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

            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Tìm sản phẩm nhanh..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-705 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
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

              {/* Các mẫu sản phẩm */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/60 rounded-xl border border-slate-100/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      EL
                  </div>
                    <div>
                      <span className="font-extrabold text-slate-700 text-xs block">Điện tử</span>
                      <span className="text-[9px] text-slate-400 font-medium">Bản mẫu Laptop / Điện thoại</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickAddTemplate("Laptop ThinkPad X1 Carbon", "Electronic", 32000000)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-extrabold text-slate-600 shadow-sm transition-colors"
                  >
                    + Thêm
                </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/60 rounded-xl border border-slate-100/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      FA
                  </div>
                    <div>
                      <span className="font-extrabold text-slate-700 text-xs block">Thời trang</span>
                      <span className="text-[9px] text-slate-400 font-medium">Bản mẫu Giày / Áo khoác</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickAddTemplate("Giày Thể Thao Sneaker Pro", "Fashion", 1250000)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-extrabold text-slate-600 shadow-sm transition-colors"
                  >
                    + Thêm
                </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/60 rounded-xl border border-slate-100/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      HO
                  </div>
                    <div>
                      <span className="font-extrabold text-slate-700 text-xs block">Gia dụng</span>
                      <span className="text-[9px] text-slate-400 font-medium">Bản mẫu Đèn / Ghế công thái học</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleQuickAddTemplate("Đèn Led Thông Minh SmartLux", "Home", 680000)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-extrabold text-slate-600 shadow-sm transition-colors"
                  >
                    + Thêm
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
