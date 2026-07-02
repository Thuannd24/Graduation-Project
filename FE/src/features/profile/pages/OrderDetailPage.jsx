import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { orderApi } from "../../../services/orderApi";
import { formatVnd } from "../../../utils/format.js";

function getStatusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "PENDING":
      return "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40";
    case "AWAITING_PAYMENT":
      return "bg-blue-50 text-blue-600 dark:bg-blue-955/20 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/40";
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-750 dark:bg-emerald-955/20 dark:text-emerald-400 border-emerald-250/60 dark:border-emerald-900/40";
    case "SHIPPED":
      return "bg-indigo-50 text-indigo-755 dark:bg-indigo-955/20 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-900/40";
    case "DELIVERED":
    case "COMPLETED":
      return "bg-teal-50 text-teal-700 dark:bg-teal-955/20 dark:text-teal-400 border-teal-200/60 dark:border-teal-900/40";
    case "CANCELLED":
      return "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40";
    default:
      return "bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200/60 dark:border-slate-850/40";
  }
}

function getStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "PENDING":
      return "Chờ xác nhận";
    case "AWAITING_PAYMENT":
      return "Chờ thanh toán";
    case "CONFIRMED":
      return "Đã xác nhận";
    case "SHIPPED":
      return "Đang giao hàng";
    case "DELIVERED":
    case "COMPLETED":
      return "Đã giao hàng";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return s || "Đang xử lý";
  }
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get("paymentStatus");
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const getCancelTimeLeft = (createdAt) => {
    if (!createdAt) return 0;
    const limitMs = 2 * 60 * 60 * 1000;
    const elapsedMs = new Date().getTime() - new Date(createdAt).getTime();
    return Math.max(0, limitMs - elapsedMs);
  };

  const isOrderCancelable = (ord) => {
    if (!ord) return false;
    const status = String(ord.status || "").toUpperCase();
    if (!["PENDING", "AWAITING_PAYMENT", "CONFIRMED"].includes(status)) {
      return false;
    }
    const timeLeft = getCancelTimeLeft(ord.createdAt);
    return timeLeft > 0;
  };

  const handleCancelClick = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy đơn hàng này không?")) return;
    setCancelling(true);
    try {
      await orderApi.cancelOrder(orderId);
      alert("Hủy đơn hàng thành công!");
      const updated = await orderApi.getOrder(orderId);
      setOrder(updated);
    } catch (err) {
      alert("Lỗi khi hủy đơn hàng: " + err.message);
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    orderApi
      .getOrder(orderId)
      .then((data) => {
        setOrder(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-xs mt-3 font-semibold">Đang tải chi tiết đơn hàng...</p>
      </div>
    );
  }
  if (error) return <p className="text-red-500 font-semibold text-center py-10">{error}</p>;
  if (!order) return <p className="text-slate-500 font-semibold text-center py-10">Không tìm thấy đơn hàng.</p>;

  const items = order.items || [];
  const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Đang xử lý";

  // Simple progress step mapper
  const getStatusStep = (status) => {
    const s = String(status || "").toUpperCase();
    if (s.includes("DELIVERED") || s.includes("HOÀN THÀNH")) return 3;
    if (s.includes("SHIPPED") || s.includes("ĐANG GIAO")) return 2;
    return 1; // PROCESSING
  };

  const currentStep = getStatusStep(order.status);

  return (
    <div className="space-y-6 py-4">
      {/* Back link */}
      <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline" to="/profile">
        <Icon name="arrow_back" className="text-sm" /> Quay lại hồ sơ tài khoản
      </Link>

      {/* Payment Status Notification Banner */}
      {paymentStatus && (
        paymentStatus === "00" && order.status !== "CANCELLED" ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <Icon name="verified" className="text-emerald-600 text-lg shrink-0" />
            <span>Thanh toán thành công qua cổng VNPAY! Đơn hàng của bạn đang được chuẩn bị để giao nhận.</span>
          </div>
        ) : (
          <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-4 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <Icon name="error" className="text-rose-600 text-lg shrink-0" />
            <span>
              {order.status === "CANCELLED"
                ? "Giao dịch thanh toán VNPAY được ghi nhận thành công, nhưng đơn hàng này đã bị hủy trước đó. Vui lòng liên hệ chăm sóc khách hàng để tiến hành hoàn tiền."
                : `Thanh toán qua cổng VNPAY không thành công hoặc giao dịch đã bị hủy (Mã lỗi: ${paymentStatus}). Quý khách có thể thử lại hoặc liên hệ hotline để được hỗ trợ.`}
            </span>
          </div>
        )
      )}

      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Chi tiết đơn hàng #{order.id}</h1>
          <p className="text-xs text-slate-450 font-semibold mt-1">Đặt ngày: {dateStr}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Trạng thái:</span>
            <span className={`font-bold text-xs px-3 py-1 rounded-full border ${getStatusBadgeClass(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
          </div>
          {isOrderCancelable(order) ? (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleCancelClick}
                disabled={cancelling}
                className="px-3.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 rounded-full text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
              >
                <Icon name="cancel" className="text-sm" /> Hủy Đơn Hàng
              </button>
              <span className="text-[9px] text-slate-400 font-semibold">
                Hạn hủy: Còn {Math.round(getCancelTimeLeft(order.createdAt) / 60000)} phút (trong vòng 2h)
              </span>
            </div>
          ) : (
            ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"].includes(String(order.status).toUpperCase()) && (
              <span className="text-[10px] text-rose-500 font-bold bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">
                Đã quá hạn hủy (2 giờ)
              </span>
            )
          )}
        </div>
      </div>

      {/* Shipping details */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50 dark:border-slate-800">
          <Icon name="local_shipping" className="text-primary" /> Thông tin giao nhận hàng
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600 dark:text-slate-350">
          <div>Địa chỉ nhận hàng: <strong className="text-slate-800 dark:text-slate-200 block mt-0.5">{order.shippingAddress || "-"}</strong></div>
          <div>Số điện thoại liên hệ: <strong className="text-slate-800 dark:text-slate-200 block mt-0.5">{order.phoneNumber || "-"}</strong></div>
          {order.note && (
            <div className="md:col-span-2">Ghi chú: <strong className="text-slate-800 dark:text-slate-200 block mt-0.5">{order.note}</strong></div>
          )}
        </div>
      </div>

      {/* Items list */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50 dark:border-slate-800">
          <Icon name="receipt" className="text-primary" /> Danh sách sản phẩm mua
        </h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, index) => {
            let variantLabel = "";
            if (item.variantAttr) {
              try {
                variantLabel = typeof item.variantAttr === 'string'
                  ? Object.values(JSON.parse(item.variantAttr)).join(" - ")
                  : Object.values(item.variantAttr).join(" - ");
              } catch (e) {
                // ignore
              }
            }

            return (
              <div key={item.id || index} className="py-4 flex gap-4 items-center justify-between">
                <div className="flex gap-4 items-center min-w-0">
                  {item.productImage && (
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-12 h-12 object-contain border border-slate-100 dark:border-slate-800 rounded p-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-slate-850 dark:text-slate-250 line-clamp-2 block leading-snug">{item.productName || `Mã sản phẩm: ${item.productId}`}</h4>
                    {variantLabel && (
                      <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-1 block">
                        Phiên bản: {variantLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <strong className="text-xs font-black text-slate-850 dark:text-slate-250 block">
                    {formatVnd(Number(item.subtotal || (item.unitPrice || item.price || 0) * (item.quantity || item.qty)))}
                  </strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {formatVnd(Number(item.unitPrice || item.price || 0))} x {item.quantity || item.qty}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing Summary info panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm flex justify-between items-center">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Tổng cộng thanh toán</h2>
        <strong className="text-xl font-black text-primary">
          {formatVnd(Number(order.finalAmount || order.totalAmount || order.total || 0))}
        </strong>
      </div>
    </div>
  );
}
