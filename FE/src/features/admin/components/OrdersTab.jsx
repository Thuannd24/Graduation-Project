import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { orderApi } from "../../../services/orderApi.ts";

export default function OrdersTab({
  orders,
  payments = [],
  loading,
  selectedOrder,
  setSelectedOrder,
  isDrawerOpen,
  setIsDrawerOpen,
  orderFilter,
  setOrderFilter,
  orderSearchQuery,
  setOrderSearchQuery,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  getOrderItemImage,
  formatOrderDate,
  handleShipOrder,
  handleCancelOrder,
  handleSimulateWebhook
}) {
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");

  useEffect(() => {
    if (selectedOrder && selectedOrder.id) {
      setLoadingPayment(true);
      setPaymentInfo(null);
      orderApi.getPaymentByOrderId(selectedOrder.id)
        .then(res => {
          if (res && res.data) {
            setPaymentInfo(res.data);
          } else {
            setPaymentInfo(res);
          }
        })
        .catch(err => {
          console.error("Failed to load payment info:", err);
          setPaymentInfo(null);
        })
        .finally(() => {
          setLoadingPayment(false);
        });
    } else {
      setPaymentInfo(null);
    }
  }, [selectedOrder]);

  // Lọc danh sách đơn hàng cho bảng
  const filteredOrders = orders.filter(o => {
    if (!o) return false;
    const orderIdStr = String(o.id || "").toLowerCase();
    const searchQueryLower = (orderSearchQuery || "").toLowerCase();
    const matchesSearch = orderIdStr.includes(searchQueryLower) ||
                          String(o.phoneNumber || "").includes(orderSearchQuery);
    
    let matchesStatus = true;
    if (orderFilter === "completed") matchesStatus = o.status === "DELIVERED";
    else if (orderFilter === "pending") matchesStatus = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "SHIPPED"].includes(o.status);
    else if (orderFilter === "cancelled") matchesStatus = o.status === "CANCELLED";

    let matchesPaymentMethod = true;
    const payment = payments?.find(p => p.orderId === o.id);
    const method = payment ? payment.paymentMethod?.toUpperCase() : "COD"; // default COD
    if (paymentMethodFilter === "cod") {
      matchesPaymentMethod = method === "COD";
    } else if (paymentMethodFilter === "vnpay") {
      matchesPaymentMethod = method === "VNPAY";
    }

    return matchesSearch && matchesStatus && matchesPaymentMethod;
  });

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [filteredOrders]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    return sortedOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [sortedOrders, currentPage]);

  // Số lượng đơn hàng
  const totalOrdersCount = orders.length;
  const pendingOrdersCount = orders.filter(o => o && ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "SHIPPED"].includes(o.status)).length;
  const completedOrdersCount = orders.filter(o => o && o.status === "DELIVERED").length;
  const canceledOrdersCount = orders.filter(o => o && o.status === "CANCELLED").length;

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      {/* Tiêu đề & Nút thao tác của danh sách đơn hàng */}
      <div className="flex justify-between items-center">
        <span className="font-extrabold text-xl text-slate-800">Danh Sách Đơn Hàng</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              alert("Tính năng thêm đơn hàng thủ công dành cho Admin đang được phát triển.");
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Icon name="add_circle" className="text-sm" />
            <span>Thêm Đơn Hàng</span>
          </button>
          <button className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 transition-colors">
            <span>Thao Tác Khác</span>
            <Icon name="more_vert" className="text-sm" />
          </button>
        </div>
      </div>

      {/* Hàng 4 thẻ thống kê của tab Đơn Hàng (Theo ảnh thứ 2) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* 1. Tổng số đơn hàng */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng số đơn hàng</h4>
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight block mt-1">{totalOrdersCount.toLocaleString()}</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>7 ngày qua</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
              ▲ 14.4%
            </span>
          </div>
        </div>

        {/* 2. Đơn hàng mới */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chờ xử lý</h4>
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight block mt-1">{pendingOrdersCount.toLocaleString()}</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>7 ngày qua</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
              ▲ 20%
            </span>
          </div>
        </div>

        {/* 3. Đơn hoàn thành */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đơn hoàn thành</h4>
              <span className="text-2xl font-extrabold text-emerald-600 tracking-tight block mt-1">{completedOrdersCount.toLocaleString()}</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Tỷ lệ thành công</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg">
              85%
            </span>
          </div>
        </div>

        {/* 4. Đơn đã hủy */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đơn đã hủy</h4>
              <span className="text-2xl font-extrabold text-rose-600 tracking-tight block mt-1">{canceledOrdersCount.toLocaleString()}</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer">
              <Icon name="more_vert" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Tỷ lệ hủy</span>
            <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
              ▼ 5%
            </span>
          </div>
        </div>

      </div>

      {/* Bảng đơn hàng + bộ lọc + tìm kiếm */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between">
        
        {/* Bộ lọc dạng Pill và Search Input */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
          <div className="flex flex-wrap gap-1.5 bg-slate-100/70 p-1 rounded-xl w-fit">
            <button
              onClick={() => { setOrderFilter("all"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                orderFilter === "all" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Tất cả đơn ({totalOrdersCount})
            </button>
            <button
              onClick={() => { setOrderFilter("completed"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                orderFilter === "completed" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Đã hoàn thành ({completedOrdersCount})
            </button>
            <button
              onClick={() => { setOrderFilter("pending"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                orderFilter === "pending" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Chờ xử lý ({pendingOrdersCount})
            </button>
            <button
              onClick={() => { setOrderFilter("cancelled"); setCurrentPage(1); }}
              className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                orderFilter === "cancelled" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Đã hủy ({canceledOrdersCount})
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={paymentMethodFilter}
              onChange={(e) => { setPaymentMethodFilter(e.target.value); setCurrentPage(1); }}
              className="bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 w-36 transition-all shadow-sm outline-none"
            >
              <option value="all">Tất cả PTTT</option>
              <option value="cod">Thanh toán COD</option>
              <option value="vnpay">Online (VNPAY)</option>
            </select>

            <div className="relative">
              <input
                type="text"
                placeholder="Tìm mã đơn, SĐT..."
                value={orderSearchQuery}
                onChange={(e) => { setOrderSearchQuery(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-700 placeholder-slate-400 w-52 transition-all"
              />
              <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
            </div>

            <button className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold transition-colors">
              <Icon name="tune" className="text-sm" />
            </button>
            <button className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-lg text-xs font-bold transition-colors">
              <Icon name="swap_vert" className="text-sm" />
            </button>
          </div>
        </div>

        {/* Danh sách Table */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-medium">Đang tải danh sách đơn hàng...</div>
        ) : paginatedOrders.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 font-medium">Không tìm thấy đơn hàng nào phù hợp.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 border-b border-slate-150">
                  <th className="p-4 w-10">
                    <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500" />
                  </th>
                  <th className="p-4 font-bold text-[10px] uppercase w-12">STT</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28">Mã Đơn</th>
                  <th className="p-4 font-bold text-[10px] uppercase">Sản Phẩm</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28">Ngày Đặt</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28 text-right">Tổng Tiền</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-36">Thanh Toán</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-32">Vận Chuyển</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((o, idx) => {
                  const firstItem = o.items?.[0];
                  const imageSrc = getOrderItemImage(firstItem);
                  const productNameStr = firstItem ? firstItem.productName || "Sản phẩm" : "Sản phẩm AuraTech";
                  const otherItemsCount = o.items && o.items.length > 1 ? o.items.length - 1 : 0;

                  const payment = payments?.find(p => p.orderId === o.id);
                  const paymentMethod = payment ? payment.paymentMethod?.toUpperCase() : (o.status === "PENDING" || o.status === "AWAITING_PAYMENT" ? "COD" : "N/A");
                  const paymentStatus = payment ? payment.status?.toUpperCase() : (["DELIVERED", "CONFIRMED", "SHIPPED"].includes(o.status) ? "SUCCESS" : "PENDING");
                  const isPaid = paymentStatus === "SUCCESS" || o.status === "DELIVERED";

                  return (
                    <tr
                      key={o.id}
                      onClick={() => { setSelectedOrder(o); setIsDrawerOpen(true); }}
                      className={`hover:bg-slate-50/40 cursor-pointer transition-all ${
                        selectedOrder && selectedOrder.id === o.id ? "bg-slate-50/70" : ""
                      }`}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500" />
                      </td>
                      <td className="p-4 font-semibold text-slate-400">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="p-4 font-extrabold text-slate-700">#ORD{o.id}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0">
                            <img src={imageSrc} alt={productNameStr} className="w-full h-full object-contain rounded" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-700 block max-w-[180px] truncate">{productNameStr}</span>
                            {otherItemsCount > 0 && (
                              <span className="text-[9px] text-emerald-600 font-bold block mt-0.5">
                                + {otherItemsCount} sản phẩm khác
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-medium">{formatOrderDate(o.createdAt)}</td>
                      <td className="p-4 font-extrabold text-slate-800 text-right">
                        {o.finalAmount?.toLocaleString("vi-VN")}đ
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            paymentMethod === "COD" ? "bg-slate-100 text-slate-700" : "bg-indigo-50 text-indigo-750 font-extrabold"
                          }`}>
                            {paymentMethod === "COD" ? "Ship COD" : "Online (VNPAY)"}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isPaid ? "bg-emerald-500" : paymentStatus === "FAILED" ? "bg-rose-500" : "bg-amber-500"
                            }`}></span>
                            <span className={`text-[10px] font-bold ${
                              isPaid ? "text-emerald-700" : paymentStatus === "FAILED" ? "text-rose-600" : "text-amber-600"
                            }`}>
                              {isPaid ? "Đã thanh toán" : paymentStatus === "FAILED" ? "Lỗi GD" : "Chờ thanh toán"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === "DELIVERED"
                            ? "bg-emerald-50 text-emerald-700"
                            : o.status === "CANCELLED"
                            ? "bg-rose-50 text-rose-600"
                            : o.status === "SHIPPED"
                            ? "bg-blue-50 text-blue-755"
                            : o.status === "CONFIRMED"
                            ? "bg-teal-50 text-teal-700"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            o.status === "DELIVERED"
                              ? "bg-emerald-500"
                              : o.status === "CANCELLED"
                              ? "bg-rose-500"
                              : o.status === "SHIPPED"
                              ? "bg-blue-500"
                              : o.status === "CONFIRMED"
                              ? "bg-teal-500"
                              : "bg-amber-500"
                          }`}></span>
                          {o.status === "DELIVERED" 
                            ? "Đã giao" 
                            : o.status === "CANCELLED" 
                            ? "Đã hủy" 
                            : o.status === "SHIPPED" 
                            ? "Đang vận chuyển" 
                            : o.status === "CONFIRMED" 
                            ? "Đã xác nhận" 
                            : "Chờ xử lý"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            ← Trước
          </button>
          
          <div className="flex gap-1.5">
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

      {/* Side Drawer kiểm tra đơn hàng Saga */}
      {isDrawerOpen && selectedOrder && (
        <>
          {/* Overlay che mờ */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px] z-40 transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          ></div>

          {/* Khung trượt ra bên phải */}
          <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto animate-slideLeft flex flex-col justify-between">
            <div>
              {/* Header Drawer */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">Chi Tiết Quy Trình Đơn Hàng</h3>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider">MÃ ĐƠN: #ORD{selectedOrder.id}</span>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Icon name="close" className="text-xl" />
                </button>
              </div>

              {/* Content Drawer */}
              <div className="p-6 space-y-6">
                
                {/* Thông tin khách hàng */}
                <div className="space-y-2">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider">Thông Tin Khách Hàng</span>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Điện thoại:</span>
                      <span className="font-extrabold">{selectedOrder.phoneNumber}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 font-semibold block">Địa chỉ giao hàng:</span>
                      <span className="font-medium text-slate-600 block bg-white p-2 rounded-lg border border-slate-100">{selectedOrder.shippingAddress}</span>
                    </div>
                    {selectedOrder.note && (
                      <div className="space-y-1">
                        <span className="text-slate-400 font-semibold block">Ghi chú:</span>
                        <span className="italic text-slate-500 block">"{selectedOrder.note}"</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Thông tin đơn hàng & Thanh toán */}
                <div className="space-y-2">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider">Chi Tiết Thanh Toán & Vận Chuyển</span>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Tổng tiền hàng:</span>
                      <span className="font-extrabold text-slate-800">{(selectedOrder.totalAmount || 0).toLocaleString("vi-VN")}đ</span>
                    </div>
                    {selectedOrder.discountAmount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span className="font-semibold">Giảm giá voucher:</span>
                        <span className="font-extrabold">-{selectedOrder.discountAmount.toLocaleString("vi-VN")}đ</span>
                      </div>
                    )}
                    {selectedOrder.couponCode && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-semibold">Mã giảm giá:</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{selectedOrder.couponCode}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200/60 pt-2">
                      <span className="text-slate-700 font-extrabold">Thành tiền:</span>
                      <span className="font-black text-emerald-600">{(selectedOrder.finalAmount || 0).toLocaleString("vi-VN")}đ</span>
                    </div>
                    
                    <div className="border-t border-slate-200/60 my-2"></div>
                    
                    {loadingPayment ? (
                      <div className="text-slate-400 text-[10px] text-center py-2 font-medium">Đang tải thông tin thanh toán...</div>
                    ) : paymentInfo ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Phương thức:</span>
                          <span className="font-extrabold text-slate-800 uppercase">{paymentInfo.paymentMethod || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Trạng thái GD:</span>
                          <span className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] ${
                            paymentInfo.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>{paymentInfo.status || "N/A"}</span>
                        </div>
                        {paymentInfo.transactionNo && (
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-semibold">Mã giao dịch:</span>
                            <span className="font-semibold text-slate-600 select-all">{paymentInfo.transactionNo}</span>
                          </div>
                        )}
                        {paymentInfo.paidAt && (
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-semibold">Ngày thanh toán:</span>
                            <span className="font-medium text-slate-600">{new Date(paymentInfo.paidAt).toLocaleString("vi-VN")}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-slate-400 text-[10px] text-center py-2 font-medium">Chưa khởi tạo giao dịch thanh toán.</div>
                    )}

                    {selectedOrder.trackingCode && (
                      <>
                        <div className="border-t border-slate-200/60 my-2"></div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold">Mã vận đơn:</span>
                          <span className="font-extrabold text-blue-600 select-all">{selectedOrder.trackingCode}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Danh sách sản phẩm mua */}
                <div className="space-y-2">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider">Sản Phẩm Đã Đặt</span>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedOrder.items?.map((item) => (
                      <div key={item.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div>
                          <span className="font-extrabold text-slate-700 block">{item.productName}</span>
                          {item.variantAttr && (
                            <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
                              {Object.entries(JSON.parse(item.variantAttr || "{}"))
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(", ")}
                            </span>
                          )}
                        </div>
                        <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">x{item.quantity || 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dòng thời gian luồng Saga Kafka */}
                <div className="space-y-3">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider">Trạng Thái Quy Trình Xử Lý Đơn Hàng (Saga Workflow)</span>
                  <div className="flex flex-col gap-5 pl-4 border-l-2 border-slate-100 relative ml-2">
                    
                    {/* Step 1 */}
                    <div className="relative text-emerald-700">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white bg-emerald-500 shadow-sm"></span>
                      <span className="text-xs font-bold block">1. Khởi tạo đơn hàng</span>
                      <span className="text-[9px] font-semibold text-slate-500">Mã đơn #ORD{selectedOrder.id} - Đã tạo lúc {formatOrderDate(selectedOrder.createdAt)}</span>
                    </div>

                    {/* Step 2 */}
                    {(() => {
                      const isCancelled = selectedOrder.status === "CANCELLED";
                      const isPending = selectedOrder.status === "PENDING";
                      const dotColor = isCancelled ? "bg-rose-500" : isPending ? "bg-blue-500 animate-pulse" : "bg-emerald-500";
                      const textColor = isCancelled ? "text-rose-600" : isPending ? "text-blue-600" : "text-emerald-700";
                      const subText = isCancelled ? "Giữ hàng thất bại hoặc đơn bị hủy sớm" : isPending ? "Đang chuẩn bị kiểm tra tồn kho..." : "Đã giữ chỗ tồn kho sản phẩm thành công";
                      return (
                        <div className={`relative ${textColor}`}>
                          <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white ${dotColor} shadow-sm`}></span>
                          <span className="text-xs font-bold block">2. Khấu trừ tồn kho</span>
                          <span className="text-[9px] font-semibold text-slate-400">{subText}</span>
                        </div>
                      );
                    })()}

                    {/* Step 3 */}
                    {(() => {
                      const isCancelled = selectedOrder.status === "CANCELLED";
                      const payMethod = paymentInfo ? paymentInfo.paymentMethod?.toUpperCase() : (selectedOrder.status === "PENDING" || selectedOrder.status === "AWAITING_PAYMENT" ? "COD" : "N/A");
                      const payStatus = paymentInfo ? paymentInfo.status?.toUpperCase() : (["DELIVERED", "CONFIRMED", "SHIPPED"].includes(selectedOrder.status) ? "SUCCESS" : "PENDING");
                      
                      let dotColor = "bg-slate-300";
                      let textColor = "text-slate-400";
                      let subText = "Chờ kiểm tra thông tin thanh toán...";

                      if (isCancelled) {
                        dotColor = "bg-rose-500";
                        textColor = "text-rose-600";
                        subText = "Giao dịch thanh toán bị hủy";
                      } else if (payMethod === "COD") {
                        const isConfirmed = ["CONFIRMED", "SHIPPED", "DELIVERED"].includes(selectedOrder.status);
                        dotColor = isConfirmed ? "bg-emerald-500" : "bg-amber-500";
                        textColor = isConfirmed ? "text-emerald-700" : "text-amber-600";
                        subText = isConfirmed ? "Ship COD - Đã xác nhận đơn hàng" : "Ship COD - Chờ gọi điện xác nhận đơn hàng";
                      } else {
                        // Online VNPAY
                        if (payStatus === "SUCCESS") {
                          dotColor = "bg-emerald-500";
                          textColor = "text-emerald-700";
                          subText = "Online (VNPAY) - Đã thanh toán thành công";
                        } else if (payStatus === "FAILED" || payStatus === "EXPIRED") {
                          dotColor = "bg-rose-500";
                          textColor = "text-rose-600";
                          subText = "Online (VNPAY) - Thanh toán thất bại hoặc hết hạn";
                        } else {
                          dotColor = "bg-amber-500";
                          textColor = "text-amber-600";
                          subText = "Online (VNPAY) - Đang chờ khách hàng quét mã thanh toán";
                        }
                      }

                      return (
                        <div className={`relative ${textColor}`}>
                          <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white ${dotColor} shadow-sm`}></span>
                          <span className="text-xs font-bold block">3. Xác thực thanh toán</span>
                          <span className="text-[9px] font-semibold text-slate-400">{subText}</span>
                        </div>
                      );
                    })()}

                    {/* Step 4 */}
                    {(() => {
                      const isCancelled = selectedOrder.status === "CANCELLED";
                      const isShipped = ["SHIPPED", "DELIVERED"].includes(selectedOrder.status);
                      const isReady = selectedOrder.status === "CONFIRMED";

                      let dotColor = "bg-slate-300";
                      let textColor = "text-slate-400";
                      let subText = "Chờ hoàn tất thanh toán & đóng gói";

                      if (isCancelled) {
                        dotColor = "bg-rose-500";
                        textColor = "text-rose-600";
                        subText = "Đã hủy bàn giao giao vận";
                      } else if (isShipped) {
                        dotColor = "bg-emerald-500";
                        textColor = "text-emerald-700";
                        subText = `Đơn vị vận chuyển đã nhận hàng - Vận đơn: ${selectedOrder.trackingCode || "MOCK-GHTK-123"}`;
                      } else if (isReady) {
                        dotColor = "bg-blue-500 animate-pulse";
                        textColor = "text-blue-600";
                        subText = "Đơn hàng đã đóng gói, chờ Admin ấn Ship để bàn giao shipper";
                      }

                      return (
                        <div className={`relative ${textColor}`}>
                          <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white ${dotColor} shadow-sm`}></span>
                          <span className="text-xs font-bold block">4. Bàn giao vận chuyển</span>
                          <span className="text-[9px] font-semibold text-slate-400">{subText}</span>
                        </div>
                      );
                    })()}

                    {/* Step 5 */}
                    {(() => {
                      const isCancelled = selectedOrder.status === "CANCELLED";
                      const isDelivered = selectedOrder.status === "DELIVERED";
                      const isShipped = selectedOrder.status === "SHIPPED";

                      let dotColor = "bg-slate-300";
                      let textColor = "text-slate-400";
                      let subText = "Chờ shipper tiếp nhận và giao hàng";

                      if (isCancelled) {
                        dotColor = "bg-rose-500";
                        textColor = "text-rose-600";
                        subText = "Đơn hàng đã bị hủy";
                      } else if (isDelivered) {
                        dotColor = "bg-emerald-500";
                        textColor = "text-emerald-700";
                        subText = "Giao hàng thành công - Khách đã nhận & hoàn tất thanh toán";
                      } else if (isShipped) {
                        dotColor = "bg-blue-500 animate-pulse";
                        textColor = "text-blue-600";
                        subText = "Shipper đang trên đường đi giao tới khách hàng...";
                      }

                      return (
                        <div className={`relative ${textColor}`}>
                          <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-white ${dotColor} shadow-sm`}></span>
                          <span className="text-xs font-bold block">5. Giao hàng thành công</span>
                          <span className="text-[9px] font-semibold text-slate-400">{subText}</span>
                        </div>
                      );
                    })()}

                  </div>
                </div>

              </div>
            </div>

            {/* Footer Drawer / Webhook Simulator */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-4 sticky bottom-0">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                <span className="font-extrabold text-[10px] text-slate-500 uppercase block tracking-wider">Cập Nhật Trạng Thái Giao Vận (Admin/Shipper)</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSimulateWebhook(selectedOrder.id, "SHIPPED")}
                    disabled={selectedOrder.status === "CANCELLED" || selectedOrder.status === "DELIVERED" || selectedOrder.status === "PENDING" || selectedOrder.status === "AWAITING_PAYMENT"}
                    className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[9px] font-extrabold disabled:opacity-50 transition-colors"
                  >
                    Đang Giao Hàng
                  </button>
                  <button
                    onClick={() => handleSimulateWebhook(selectedOrder.id, "DELIVERED")}
                    disabled={selectedOrder.status === "CANCELLED" || selectedOrder.status === "DELIVERED" || selectedOrder.status !== "SHIPPED"}
                    className="py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-extrabold disabled:opacity-50 transition-colors"
                  >
                    Đã Giao Thành Công
                  </button>
                  <button
                    onClick={() => handleSimulateWebhook(selectedOrder.id, "CANCELLED")}
                    disabled={selectedOrder.status === "CANCELLED" || selectedOrder.status === "DELIVERED" || selectedOrder.status === "PENDING" || selectedOrder.status === "AWAITING_PAYMENT"}
                    className="py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[9px] font-extrabold disabled:opacity-50 transition-colors"
                  >
                    Hủy Giao Hàng
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                {selectedOrder.status === "CONFIRMED" && (
                  <button
                    onClick={() => handleShipOrder(selectedOrder.id)}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Xác Nhận Giao Hàng
                  </button>
                )}
                {["PENDING", "AWAITING_PAYMENT", "CONFIRMED"].includes(selectedOrder.status) && (
                  <button
                    onClick={() => handleCancelOrder(selectedOrder.id)}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Hủy Đơn Hàng
                  </button>
                )}
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
