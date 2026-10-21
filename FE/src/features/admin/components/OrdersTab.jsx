import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/common/Icon.jsx";
import Pagination from "../../../components/common/Pagination.jsx";
import { orderApi } from "../../../services/orderApi.ts";
import CancelOrderDialog from "../../../components/common/CancelOrderDialog.jsx";
import { formatVnd } from "../../../utils/format.js";
import { cancelReasonLabel, orderStatusLabel } from "../../../utils/orderStatus.js";

const PENDING_STATUSES = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "SHIPPED", "RETURNING"];
const CLOSED_STATUSES = ["CANCELLED", "RETURNED"];
const TERMINATED_STATUSES = ["CANCELLED", "RETURNING", "RETURNED"];

const STATUS_PILL = {
  DELIVERED: ["bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  CANCELLED: ["bg-rose-50 text-rose-600", "bg-rose-500"],
  RETURNED: ["bg-slate-100 text-slate-600", "bg-slate-400"],
  RETURNING: ["bg-orange-50 text-orange-600", "bg-orange-500"],
  SHIPPED: ["bg-blue-50 text-blue-755", "bg-blue-500"],
  CONFIRMED: ["bg-teal-50 text-teal-700", "bg-teal-500"]
};

function paymentDisplay(payment) {
  if (!payment) return { method: null, label: "Chưa thanh toán", tone: "amber" };
  const method = payment.paymentMethod?.toUpperCase();
  const status = payment.status?.toUpperCase();
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return { method, label: "Đã hoàn tiền", tone: "slate" };
  if (status === "REFUND_PENDING") return { method, label: "Đang hoàn tiền", tone: "amber" };
  if (status === "SUCCESS") return { method, label: "Đã thanh toán", tone: "emerald" };
  if (status === "FAILED" || status === "EXPIRED") return { method, label: "GD không thành công", tone: "rose" };
  if (method === "COD") return { method, label: "Thu khi giao", tone: "amber" };
  return { method, label: "Chờ thanh toán", tone: "amber" };
}

const TONE = {
  emerald: ["bg-emerald-500", "text-emerald-700"],
  rose: ["bg-rose-500", "text-rose-600"],
  amber: ["bg-amber-500", "text-amber-600"],
  slate: ["bg-slate-400", "text-slate-600"]
};

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
  currentPage,
  setCurrentPage,
  itemsPerPage,
  getOrderItemImage,
  formatOrderDate,
  handleShipOrder,
  handleCancelOrder,
  handleSimulateWebhook,
  handleReturnReceived
}) {
  // { orderId, mode: "cancel" | "cancel-shipping" }
  const [cancelDialog, setCancelDialog] = useState(null);
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

    let matchesStatus = true;
    if (orderFilter === "completed") matchesStatus = o.status === "DELIVERED";
    else if (orderFilter === "pending") matchesStatus = PENDING_STATUSES.includes(o.status);
    else if (orderFilter === "cancelled") matchesStatus = CLOSED_STATUSES.includes(o.status);

    let matchesPaymentMethod = true;
    const payment = payments?.find(p => p.orderId === o.id);
    const method = payment ? payment.paymentMethod?.toUpperCase() : null;
    if (paymentMethodFilter === "cod") {
      matchesPaymentMethod = method === "COD";
    } else if (paymentMethodFilter === "vnpay") {
      matchesPaymentMethod = method === "VNPAY";
    }

    return matchesStatus && matchesPaymentMethod;
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
  const pendingOrdersCount = orders.filter(o => o && PENDING_STATUSES.includes(o.status)).length;
  const completedOrdersCount = orders.filter(o => o && o.status === "DELIVERED").length;
  const canceledOrdersCount = orders.filter(o => o && CLOSED_STATUSES.includes(o.status)).length;

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      {/* Tiêu đề danh sách đơn hàng */}
      <div className="flex justify-between items-center">
        <span className="font-extrabold text-xl text-slate-800">Danh Sách Đơn Hàng</span>
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
                  const pay = paymentDisplay(payment);
                  const [payDot, payText] = TONE[pay.tone];
                  const [pillClass, pillDot] = STATUS_PILL[o.status] || ["bg-amber-50 text-amber-600", "bg-amber-500"];

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
                        {formatVnd(Number(o.finalAmount || 0))}
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          {pay.method && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              pay.method === "COD" ? "bg-slate-100 text-slate-700" : "bg-indigo-50 text-indigo-750 font-extrabold"
                            }`}>
                              {pay.method === "COD" ? "Ship COD" : "Online (VNPAY)"}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${payDot}`}></span>
                            <span className={`text-[10px] font-bold ${payText}`}>{pay.label}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${pillClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pillDot}`}></span>
                          {orderStatusLabel(o.status)}
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
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
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
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Người nhận:</span>
                      <span className="font-extrabold">{selectedOrder.recipientName || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Điện thoại:</span>
                      <span className="font-extrabold">{selectedOrder.recipientPhone || selectedOrder.phoneNumber}</span>
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
                    {(selectedOrder.cancelReasonCode || selectedOrder.cancelReason) && (
                      <div className="space-y-1 border-t border-slate-200/60 pt-2">
                        <span className="text-slate-400 font-semibold block">Lý do hủy ({selectedOrder.cancelledBy === "CUSTOMER" ? "khách hàng" : selectedOrder.cancelledBy === "SYSTEM" ? "hệ thống" : selectedOrder.cancelledBy === "CARRIER" ? "vận chuyển" : "quản trị"}):</span>
                        <span className="text-rose-600 font-semibold block">{cancelReasonLabel(selectedOrder.cancelReasonCode, selectedOrder.cancelReason)}</span>
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
                      <span className="font-extrabold text-slate-800">{formatVnd(Number(selectedOrder.totalAmount || 0))}</span>
                    </div>
                    {selectedOrder.discountAmount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span className="font-semibold">Giảm giá voucher:</span>
                        <span className="font-extrabold">-{formatVnd(Number(selectedOrder.discountAmount))}</span>
                      </div>
                    )}
                    {selectedOrder.pointDiscountAmount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span className="font-semibold">Giảm bằng điểm:</span>
                        <span className="font-extrabold">-{formatVnd(Number(selectedOrder.pointDiscountAmount))}</span>
                      </div>
                    )}
                    {selectedOrder.couponCode && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-semibold">Mã giảm giá:</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{selectedOrder.couponCode}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">Phí vận chuyển:</span>
                      <span className="font-bold text-slate-700">{Number(selectedOrder.shippingFee || 0) > 0 ? formatVnd(Number(selectedOrder.shippingFee)) : "Miễn phí"}</span>
                    </div>
                    {selectedOrder.shippingDiscountAmount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span className="font-semibold">Giảm phí vận chuyển:</span>
                        <span className="font-extrabold">-{formatVnd(Number(selectedOrder.shippingDiscountAmount))}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200/60 pt-2">
                      <span className="text-slate-700 font-extrabold">Thành tiền:</span>
                      <span className="font-black text-emerald-600">{formatVnd(Number(selectedOrder.finalAmount || 0))}</span>
                    </div>
                    {selectedOrder.vatAmount > 0 && (
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Trong đó VAT (10%):</span>
                        <span>{formatVnd(Number(selectedOrder.vatAmount))}</span>
                      </div>
                    )}

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
                          }`}>{paymentDisplay(paymentInfo).label}</span>
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
                      const isCancelled = TERMINATED_STATUSES.includes(selectedOrder.status);
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
                      const isCancelled = TERMINATED_STATUSES.includes(selectedOrder.status);
                      const payMethod = paymentInfo?.paymentMethod?.toUpperCase() || null;
                      const payStatus = paymentInfo?.status?.toUpperCase() || null;
                      
                      let dotColor = "bg-slate-300";
                      let textColor = "text-slate-400";
                      let subText = "Chờ kiểm tra thông tin thanh toán...";

                      if (isCancelled) {
                        dotColor = "bg-rose-500";
                        textColor = "text-rose-600";
                        subText = ["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"].includes(payStatus)
                          ? "Đơn đã hủy - đã/đang hoàn tiền cho khách"
                          : "Đơn đã hủy";
                      } else if (!payMethod) {
                        subText = "Khách chưa chọn/khởi tạo thanh toán";
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
                      const isCancelled = TERMINATED_STATUSES.includes(selectedOrder.status);
                      const isShipped = ["SHIPPED", "DELIVERED"].includes(selectedOrder.status);
                      const isReady = selectedOrder.status === "CONFIRMED";

                      let dotColor = "bg-slate-300";
                      let textColor = "text-slate-400";
                      let subText = "Chờ hoàn tất thanh toán & đóng gói";

                      if (isCancelled) {
                        dotColor = "bg-rose-500";
                        textColor = "text-rose-600";
                        subText = selectedOrder.status === "RETURNING"
                          ? "Đơn bị hủy khi đang giao - chờ hàng hoàn về kho"
                          : selectedOrder.status === "RETURNED"
                          ? "Kho đã nhận lại hàng hoàn, tồn kho đã được cộng lại"
                          : "Không bàn giao vận chuyển";
                      } else if (isShipped) {
                        dotColor = "bg-emerald-500";
                        textColor = "text-emerald-700";
                        subText = `Đơn vị vận chuyển đã nhận hàng - Vận đơn: ${selectedOrder.trackingCode || "—"}`;
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
                      const isCancelled = TERMINATED_STATUSES.includes(selectedOrder.status);
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

            {/* Footer: thao tác theo đúng trình tự trạng thái (backend kiểm tra lại) */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-3 sticky bottom-0">
              {selectedOrder.status === "CONFIRMED" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSimulateWebhook(selectedOrder.id, "SHIPPED")}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Bàn giao vận chuyển
                  </button>
                  <button
                    onClick={() => setCancelDialog({ orderId: selectedOrder.id, mode: "cancel" })}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Hủy đơn hàng
                  </button>
                </div>
              )}
              {["PENDING", "AWAITING_PAYMENT"].includes(selectedOrder.status) && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 font-semibold">Đơn đang chờ khách thanh toán; chưa thể bàn giao vận chuyển. Đơn chưa thanh toán sẽ tự hủy khi hết hạn.</p>
                  <button
                    onClick={() => setCancelDialog({ orderId: selectedOrder.id, mode: "cancel" })}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Hủy đơn hàng
                  </button>
                </div>
              )}
              {selectedOrder.status === "SHIPPED" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSimulateWebhook(selectedOrder.id, "DELIVERED")}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Đã giao thành công
                  </button>
                  <button
                    onClick={() => setCancelDialog({ orderId: selectedOrder.id, mode: "cancel-shipping" })}
                    className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[10px] font-bold transition-all"
                  >
                    Hủy giao hàng (hoàn hàng)
                  </button>
                </div>
              )}
              {selectedOrder.status === "RETURNING" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-orange-600 font-semibold">Hàng đang được hoàn về. Chỉ xác nhận khi kho đã nhận và kiểm tra hàng; khi đó tồn kho được cộng lại và đơn đã thanh toán online sẽ được hoàn tiền.</p>
                  <button
                    onClick={() => handleReturnReceived(selectedOrder.id)}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                  >
                    Xác nhận đã nhận hàng hoàn
                  </button>
                </div>
              )}
              {["DELIVERED", "CANCELLED", "RETURNED"].includes(selectedOrder.status) && (
                <p className="text-[10px] text-slate-400 font-semibold text-center">Đơn hàng đã kết thúc, không còn thao tác nào.</p>
              )}
            </div>

            <CancelOrderDialog
              open={!!cancelDialog}
              orderId={cancelDialog?.orderId}
              title={cancelDialog?.mode === "cancel-shipping" ? `Hủy giao hàng đơn #${cancelDialog?.orderId}` : undefined}
              note={cancelDialog?.mode === "cancel-shipping"
                ? "Đơn sẽ chuyển sang \"Chờ hoàn hàng\". Tồn kho chỉ được cộng lại khi kho xác nhận đã nhận hàng hoàn."
                : "Voucher của khách (nếu còn hạn) sẽ được trả lại; đơn đã thanh toán online sẽ được hoàn tiền."}
              confirmLabel={cancelDialog?.mode === "cancel-shipping" ? "Xác nhận hủy giao" : "Xác nhận hủy đơn"}
              onConfirm={async (reasonCode, reason) => {
                await handleCancelOrder(cancelDialog.orderId, reasonCode, reason);
                setCancelDialog(null);
              }}
              onClose={() => setCancelDialog(null)}
            />

          </div>
        </>
      )}

    </div>
  );
}
