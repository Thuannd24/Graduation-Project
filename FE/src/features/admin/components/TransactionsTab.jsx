import React, { useState, useMemo, useEffect } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { orderApi } from "../../../services/orderApi";
import { authApi } from "../../../services/authApi.ts";

export default function TransactionsTab({ orders = [], payments = [], users = [], onRefresh }) {
  const [filterPill, setFilterPill] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCardActive, setIsCardActive] = useState(true);
  const [selectedTx, setSelectedTx] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [resolvedNames, setResolvedNames] = useState({});
  const itemsPerPage = 8;

  // Lấy danh sách giao dịch từ dữ liệu thanh toán thực tế kết hợp đơn hàng
  const dynamicTx = useMemo(() => {
    const findRelatedUser = (userId) => {
      if (!userId) return null;
      return users.find(u => 
        String(u.keycloakUserId || "").toLowerCase() === String(userId).toLowerCase() ||
        String(u.id || "").toLowerCase() === String(userId).toLowerCase() ||
        String(u.userId || "").toLowerCase() === String(userId).toLowerCase() ||
        String(u.username || "").toLowerCase() === String(userId).toLowerCase()
      );
    };

    if (!payments || payments.length === 0) {
      if (!orders || orders.length === 0) return [];
      return orders.map((o, idx) => {
        const relatedUser = findRelatedUser(o.userId);
        const mappedCustId = relatedUser?.id ? `US-${relatedUser.id}` : (o.userId ? (String(o.userId).length > 15 ? `US-${String(o.userId).slice(0, 8)}` : `US-${o.userId}`) : `US-GUEST-${idx + 1}`);
        return {
          id: o.id || `TXN-${idx + 100}`,
          orderId: o.id,
          userId: o.userId || null,
          custId: mappedCustId,
          name: relatedUser?.fullName || relatedUser?.username || resolvedNames[o.userId] || "Khách hàng",
          date: o.createdAt ? new Date(o.createdAt).toLocaleString("vi-VN") : "—",
          dateRaw: o.createdAt || null,
          total: (o.finalAmount || 0).toLocaleString("vi-VN") + " đ",
          method: o.paymentMethod || "COD",
          status: o.status === "DELIVERED" ? "Complete" : (o.status === "CANCELLED" ? "Canceled" : "Pending"),
          txnRef: o.txnRef || `ORD-${o.id || idx}`,
          paidAt: null,
          failureCode: null
        };
      });
    }

    return payments.map((p, idx) => {
      const relatedOrder = orders.find(o => o.id === p.orderId);
      const relatedUser = findRelatedUser(relatedOrder?.userId);
      const mappedCustId = relatedUser?.id ? `US-${relatedUser.id}` : (relatedOrder?.userId ? (String(relatedOrder.userId).length > 15 ? `US-${String(relatedOrder.userId).slice(0, 8)}` : `US-${relatedOrder.userId}`) : `US-GUEST-${idx + 1}`);
      let mappedStatus = "Pending";
      const statusUpper = String(p.status || "").toUpperCase();
      if (statusUpper === "SUCCESS" || statusUpper === "COMPLETED") {
        mappedStatus = "Complete";
      } else if (statusUpper === "REFUNDED") {
        mappedStatus = "Refunded";
      } else if (statusUpper === "FAILED" || statusUpper === "EXPIRED" || statusUpper === "CANCELLED") {
        mappedStatus = "Canceled";
      }

      return {
        id: p.id || `TXN-${idx + 100}`,
        orderId: p.orderId,
        userId: relatedOrder?.userId || null,
        txnRef: p.transactionNo || p.txnRef || "—",
        custId: mappedCustId,
        name: relatedUser?.fullName || relatedUser?.username || resolvedNames[relatedOrder?.userId] || "Khách hàng",
        date: p.createdAt ? new Date(p.createdAt).toLocaleString("vi-VN") : "—",
        dateRaw: p.createdAt || p.paidAt || relatedOrder?.createdAt || null,
        total: (p.amount || relatedOrder?.finalAmount || 0).toLocaleString("vi-VN") + " đ",
        method: p.paymentMethod || "COD",
        status: mappedStatus,
        paidAt: p.paidAt ? new Date(p.paidAt).toLocaleString("vi-VN") : null,
        failureCode: p.failureCode || p.gatewayResponse
      };
    });
  }, [payments, orders, users, resolvedNames]);

  // Với các userId không khớp được trong danh sách users đã tải (VD: quá trang phân trang),
  // tra cứu trực tiếp qua hồ sơ công khai để hiển thị đúng tên khách hàng thay vì "Khách hàng"
  useEffect(() => {
    const unresolvedIds = Array.from(new Set(
      dynamicTx
        .filter(tx => tx.name === "Khách hàng" && tx.userId)
        .map(tx => tx.userId)
    )).filter(id => !(id in resolvedNames));

    if (unresolvedIds.length === 0) return;

    let cancelled = false;
    Promise.all(unresolvedIds.map(id =>
      authApi.getPublicProfile(id).then(profile => [id, profile?.fullName || profile?.username || null]).catch(() => [id, null])
    )).then(results => {
      if (cancelled) return;
      setResolvedNames(prev => {
        const next = { ...prev };
        results.forEach(([id, name]) => { next[id] = name; });
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [dynamicTx]);

  // Phân tích phân bổ phương thức thanh toán
  const methodStats = useMemo(() => {
    const total = dynamicTx.length || 1;
    const cod = dynamicTx.filter(t => String(t.method).toUpperCase() === "COD").length;
    const vnpay = dynamicTx.filter(t => String(t.method).toUpperCase() === "VNPAY").length;
    return {
      codCount: cod,
      vnpayCount: vnpay,
      codPercent: Math.round((cod / total) * 100),
      vnpayPercent: Math.round((vnpay / total) * 100)
    };
  }, [dynamicTx]);

  // Thống kê giao dịch từ dữ liệu thực
  const txStats = useMemo(() => {
    const completed = dynamicTx.filter(t => t.status === "Complete");
    const pending = dynamicTx.filter(t => t.status === "Pending");
    const canceled = dynamicTx.filter(t => t.status === "Canceled");
    const refunded = dynamicTx.filter(t => t.status === "Refunded");
    const totalRevenue = completed.reduce((sum, t) => sum + (parseInt(t.total.replace(/[^\d]/g, "")) || 0), 0);
    const totalTx = dynamicTx.length;
    const successRate = totalTx > 0 ? Math.round((completed.length / totalTx) * 100) : 0;
    const failRate = totalTx > 0 ? Math.round((canceled.length / totalTx) * 100) : 0;
    return {
      totalRevenue: totalRevenue.toLocaleString("vi-VN") + " đ",
      completedCount: completed.length,
      pendingCount: pending.length,
      canceledCount: canceled.length,
      refundedCount: refunded.length,
      successRate,
      failRate
    };
  }, [dynamicTx]);

  // Lọc giao dịch
  const filteredTx = useMemo(() => {
    return dynamicTx.filter(tx => {
      const matchesSearch = 
        tx.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        tx.custId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(tx.orderId).includes(searchQuery);

      if (filterPill === "completed") return matchesSearch && tx.status === "Complete";
      if (filterPill === "pending") return matchesSearch && tx.status === "Pending";
      if (filterPill === "canceled") return matchesSearch && tx.status === "Canceled";
      if (filterPill === "refunded") return matchesSearch && tx.status === "Refunded";
      return matchesSearch;
    });
  }, [dynamicTx, searchQuery, filterPill]);

  const sortedTx = useMemo(() => {
    return [...filteredTx].sort((a, b) => {
      const dateA = a.dateRaw ? new Date(a.dateRaw).getTime() : 0;
      const dateB = b.dateRaw ? new Date(b.dateRaw).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
    });
  }, [filteredTx]);

  const totalPages = Math.ceil(sortedTx.length / itemsPerPage) || 1;
  const paginatedTx = useMemo(() => {
    return sortedTx.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [sortedTx, currentPage]);

  const handleRefund = async () => {
    if (!selectedTx || !selectedTx.id) return;
    if (!refundReason.trim()) {
      alert("Vui lòng nhập lý do hoàn tiền.");
      return;
    }
    if (!window.confirm("Bạn có chắc chắn muốn hoàn tiền cho giao dịch này không?")) return;

    setRefunding(true);
    try {
      const paymentId = Number(selectedTx.id);
      const numericAmount = parseInt(selectedTx.total.replace(/[^\d]/g, "")) || 0;
      await orderApi.refundPayment(paymentId, numericAmount, refundReason.trim());
      alert("Thực hiện hoàn tiền thành công!");
      setRefundReason("");
      setIsModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Lỗi hoàn tiền: " + err.message);
    } finally {
      setRefunding(false);
    }
  };

  const relatedOrderForModal = useMemo(() => {
    if (!selectedTx) return null;
    return orders.find(o => o.id === selectedTx.orderId);
  }, [selectedTx, orders]);

  const relatedUserForModal = useMemo(() => {
    if (!relatedOrderForModal) return null;
    return users.find(u => String(u.id || u.userId) === String(relatedOrderForModal.userId));
  }, [relatedOrderForModal, users]);

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      
      {/* Thống kê giao dịch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Cột trái: 4 thẻ thống kê giao dịch (8 cột) */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Doanh thu */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doanh thu thanh toán thực nhận</h4>
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{txStats.totalRevenue}</span>
                <p className="text-[9px] text-slate-400 font-medium mt-1 leading-normal">Chỉ tính tiền từ các giao dịch đã thanh toán thành công (VNPAY thành công hoặc COD đã giao)</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Icon name="payments" className="text-lg" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Thành công: {txStats.completedCount} GD</span>
              <span className="text-emerald-650 bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                ▲ {txStats.successRate}%
              </span>
            </div>
          </div>

          {/* Giao dịch chờ xử lý */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đang chờ xử lý</h4>
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{txStats.pendingCount.toLocaleString()}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Icon name="pending_actions" className="text-lg" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Đang treo</span>
              <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg font-bold">
                Chờ duyệt thanh toán
              </span>
            </div>
          </div>

          {/* Giao dịch hoàn tiền */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đã hoàn tiền (Refund)</h4>
                <span className="text-3xl font-extrabold text-blue-600 tracking-tight block mt-1">{txStats.refundedCount.toLocaleString()}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Icon name="history" className="text-lg" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Hoàn trả ví điện tử</span>
              <span className="text-blue-650 bg-blue-50 px-2 py-0.5 rounded-lg font-bold">
                VNPAY Gateway
              </span>
            </div>
          </div>

          {/* Giao dịch thất bại */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giao dịch thất bại / Hủy</h4>
                <span className="text-3xl font-extrabold text-rose-600 tracking-tight block mt-1">{txStats.canceledCount.toLocaleString()}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                <Icon name="error" className="text-lg" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Tỷ lệ thất bại</span>
              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg font-bold">
                {txStats.failRate}%
              </span>
            </div>
          </div>
        </div>

        {/* Cột phải: Phương thức thanh toán (4 cột) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-extrabold text-xs text-slate-850 uppercase tracking-widest">Tài khoản Cổng nhận</span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-lg">ONLINE</span>
          </div>

          {/* Cổng thanh toán VNPAY */}
          <div className="w-full h-32 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-700 p-4 flex flex-col justify-between text-white relative shadow-sm overflow-hidden select-none">
            <div className="absolute right-0 bottom-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none"></div>
            
            <div className="flex justify-between items-start">
              <div>
                <span className="font-bold text-xs tracking-wider opacity-90 block">VNPAY Merchant API</span>
                <span className="text-[8px] opacity-75">Hệ thống thanh toán online TechStore</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Icon name="payment" className="text-white text-base" />
              </div>
            </div>

            <div className="font-mono font-bold tracking-wider text-xs">
              MID: VNPAY-TECHSTORE-2026
            </div>

            <div className="flex justify-between items-end text-[10px] opacity-90">
              <div>
                <span className="text-[7px] block">Kết nối kết toán</span>
                <span className="font-bold">Vietcombank</span>
              </div>
              <div className="text-right">
                <span className="text-[7px] block">Trạng thái</span>
                <span className="font-bold text-emerald-300">ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Phân bổ tỷ lệ thanh toán COD vs VNPAY */}
          <div className="space-y-3 pt-2">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">Phân bổ phương thức</span>
            
            <div className="space-y-2 text-xs font-bold">
              {/* COD */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-650">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span>COD (Thanh toán khi nhận)</span>
                  <span>{methodStats.codPercent}% ({methodStats.codCount} GD)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-450 rounded-full" style={{ width: `${methodStats.codPercent}%` }}></div>
                </div>
              </div>

              {/* VNPAY */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-650">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>VNPAY QR/Cổng</span>
                  <span>{methodStats.vnpayPercent}% ({methodStats.vnpayCount} GD)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${methodStats.vnpayPercent}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bảng lịch sử giao dịch */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between">
        
        {/* Pills & Search */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
          <div className="flex flex-wrap gap-1 bg-slate-100/70 p-1 rounded-xl w-fit">
            <button
              onClick={() => { setFilterPill("all"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                filterPill === "all" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Tất cả ({dynamicTx.length})
            </button>
            <button
              onClick={() => { setFilterPill("completed"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                filterPill === "completed" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Thành công ({dynamicTx.filter(t => t.status === "Complete").length})
            </button>
            <button
              onClick={() => { setFilterPill("pending"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                filterPill === "pending" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Chờ xử lý ({dynamicTx.filter(t => t.status === "Pending").length})
            </button>
            <button
              onClick={() => { setFilterPill("refunded"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                filterPill === "refunded" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Hoàn tiền ({dynamicTx.filter(t => t.status === "Refunded").length})
            </button>
            <button
              onClick={() => { setFilterPill("canceled"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                filterPill === "canceled" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Thất bại/Hủy ({dynamicTx.filter(t => t.status === "Canceled").length})
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm giao dịch, ID đơn..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-700 placeholder-slate-400 w-48 transition-all"
              />
              <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-slate-400 border-b border-slate-100">
                <th className="p-4 font-bold text-[10px] uppercase w-28">Mã Khách Hàng</th>
                <th className="p-4 font-bold text-[10px] uppercase">Tên</th>
                <th className="p-4 font-bold text-[10px] uppercase w-32">Ngày tạo</th>
                <th className="p-4 font-bold text-[10px] uppercase w-24 text-right">Số Tiền</th>
                <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Phương thức</th>
                <th className="p-4 font-bold text-[10px] uppercase w-32">Trạng thái</th>
                <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTx.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="p-4 font-extrabold text-slate-400">{tx.custId}</td>
                  <td className="p-4 font-extrabold text-slate-750">{tx.name}</td>
                  <td className="p-4 text-slate-500 font-medium">{tx.date}</td>
                  <td className="p-4 font-extrabold text-slate-800 text-right">{tx.total}</td>
                  <td className="p-4 text-center font-bold text-slate-500">{tx.method}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tx.status === "Complete"
                        ? "bg-emerald-50 text-emerald-700"
                        : tx.status === "Refunded"
                        ? "bg-blue-50 text-blue-700"
                        : tx.status === "Canceled"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-600"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        tx.status === "Complete" ? "bg-emerald-500" : tx.status === "Refunded" ? "bg-blue-500" : tx.status === "Canceled" ? "bg-rose-500" : "bg-amber-500"
                      }`}></span>
                      {tx.status === "Complete" ? "Đã duyệt" : tx.status === "Refunded" ? "Đã hoàn tiền" : tx.status === "Canceled" ? "Thất bại" : "Chờ duyệt"}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => { setSelectedTx(tx); setIsModalOpen(true); }}
                      className="text-[10px] font-extrabold text-emerald-650 hover:text-emerald-750 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded"
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            ← Trước
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  currentPage === page
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Sau →
          </button>
        </div>

      </div>

      {/* Modal chi tiết giao dịch & Xử lý hoàn tiền */}
      {isModalOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-[460px] overflow-hidden z-10 animate-scaleUp">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">Chi Tiết Giao Dịch</h3>
                <span className="text-[10px] text-slate-450 font-extrabold tracking-wider uppercase">ID Giao dịch hệ thống: {selectedTx.id}</span>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-650 transition-all">
                <Icon name="close" className="text-lg" />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs text-slate-600">
              <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Số tiền giao dịch</span>
                  <span className="text-xl font-black text-slate-850">{selectedTx.total}</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                  selectedTx.status === "Complete"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-250/60"
                    : selectedTx.status === "Refunded"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : selectedTx.status === "Canceled"
                    ? "bg-rose-50 text-rose-600 border-rose-150"
                    : "bg-amber-50 text-amber-600 border-amber-250/60"
                }`}>
                  {selectedTx.status === "Complete" ? "Thành công" : selectedTx.status === "Refunded" ? "Đã hoàn" : selectedTx.status === "Canceled" ? "Thất bại" : "Chờ xử lý"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Mã đơn hàng</span>
                  <span className="font-bold text-slate-800 block mt-0.5">#{selectedTx.orderId || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Phương thức</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{selectedTx.method}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Mã tham chiếu (Txn Ref / Transaction No)</span>
                  <span className="font-mono font-bold text-slate-650 block mt-0.5 break-all bg-slate-50 p-2 rounded-lg border border-slate-100">{selectedTx.txnRef}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Khách hàng</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{selectedTx.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Mã định danh khách</span>
                  <span className="font-bold text-slate-500 block mt-0.5">{selectedTx.custId}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Email</span>
                  <span className="font-bold text-slate-700 block mt-0.5 truncate">{relatedUserForModal?.email || "Chưa cập nhật"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">SĐT liên hệ</span>
                  <span className="font-bold text-slate-700 block mt-0.5">{relatedOrderForModal?.phoneNumber || relatedUserForModal?.phone || "Chưa cập nhật"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Địa chỉ giao hàng</span>
                  <span className="font-bold text-slate-700 block mt-0.5 whitespace-pre-wrap">{relatedOrderForModal?.shippingAddress || "Chưa cập nhật"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Ngày khởi tạo</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{selectedTx.date}</span>
                </div>
                {selectedTx.paidAt ? (
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Thời điểm thanh toán</span>
                    <span className="font-bold text-emerald-600 block mt-0.5">{selectedTx.paidAt}</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Thời điểm thanh toán</span>
                    <span className="font-bold text-slate-400 block mt-0.5">—</span>
                  </div>
                )}
              </div>

              {/* Danh sách sản phẩm trong đơn hàng */}
              {relatedOrderForModal?.items && relatedOrderForModal.items.length > 0 && (
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider">Danh sách sản phẩm mua</span>
                  <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto pr-1">
                    {relatedOrderForModal.items.map((item, index) => (
                      <div key={index} className="py-1.5 flex justify-between items-center text-[10px] font-bold text-slate-700">
                        <span className="truncate max-w-[240px]">{item.productName}</span>
                        <span>x{item.quantity} - {Number(item.price || 0).toLocaleString("vi-VN")} đ</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTx.failureCode && (
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider">Gateway Response / Logs</span>
                  <p className="text-[11px] text-slate-650 font-semibold mt-1 break-words">{selectedTx.failureCode}</p>
                </div>
              )}

              {/* Xử lý hoàn tiền cho giao dịch VNPAY thành công */}
              {selectedTx.status === "Complete" && String(selectedTx.method).toUpperCase() === "VNPAY" && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Xử lý hoàn tiền (Refund)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Lý do hoàn tiền..."
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none"
                    />
                    <button
                      onClick={handleRefund}
                      disabled={refunding}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1 shrink-0"
                    >
                      {refunding && <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                      <span>Hoàn Tiền</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-350 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
