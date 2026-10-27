import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import CancelOrderDialog from "../../../components/common/CancelOrderDialog.jsx";
import { authApi } from "../../../services/authApi";
import { orderApi } from "../../../services/orderApi";
import { productApi } from "../../../services/productApi";
import { formatVnd } from "../../../utils/format.js";
import { cancelReasonLabel, isCustomerCancellable, orderStatusBadge, orderStatusLabel } from "../../../utils/orderStatus.js";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  // Có tham số này nghĩa là vừa quay về từ VNPay; KẾT QUẢ thì luôn lấy từ server (không tin URL).
  const returnedFromGateway = searchParams.has("paymentStatus") || searchParams.has("paymentResult");
  
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [payInfo, setPayInfo] = useState(null);
  const [payAction, setPayAction] = useState("");

  const loadPaymentStatus = useCallback(
    () => orderApi.getPaymentStatus(orderId).then((info) => { setPayInfo(info); return info; }).catch(() => null),
    [orderId]
  );

  // Vừa quay về từ VNPay: IPN có thể đến chậm vài giây -> hỏi lại server tối đa ~10 giây khi còn PENDING.
  useEffect(() => {
    if (!returnedFromGateway) return undefined;
    let attempts = 0;
    let timer;
    const poll = async () => {
      const info = await loadPaymentStatus();
      attempts += 1;
      if (info && info.result === "PENDING" && !info.canRetry && attempts < 5) {
        timer = setTimeout(poll, 2000);
      } else if (info) {
        orderApi.getOrder(orderId).then((o) => setOrder((prev) => (prev ? { ...o, items: prev.items } : o))).catch(() => {});
      }
    };
    poll();
    return () => clearTimeout(timer);
  }, [returnedFromGateway, loadPaymentStatus, orderId]);

  const handleConfirmCancel = async (reasonCode, reason) => {
    const updated = await orderApi.cancelOrder(orderId, reasonCode, reason);
    setCancelDialogOpen(false);
    const fresh = updated && updated.status ? updated : await orderApi.getOrder(orderId);
    setOrder((prev) => (prev ? { ...fresh, items: prev.items } : fresh));
    loadPaymentStatus();
    setNotice({ type: "success", text: "Đã hủy đơn hàng. Voucher đã dùng (nếu còn hạn) được trả lại vào ví voucher của bạn." });
  };

  const handleRetryPayment = async (method) => {
    if (payAction) return;
    setPayAction(method);
    setNotice(null);
    try {
      const res = await orderApi.retryPayment(orderId, method);
      if (method === "VNPAY" && res?.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      const [fresh] = await Promise.all([orderApi.getOrder(orderId), loadPaymentStatus()]);
      setOrder((prev) => (prev ? { ...fresh, items: prev.items } : fresh));
      setNotice({ type: "success", text: "Đã chuyển sang thanh toán khi nhận hàng (COD). Đơn hàng đã được xác nhận." });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Không thể xử lý thanh toán. Vui lòng thử lại." });
    } finally {
      setPayAction("");
    }
  };

  useEffect(() => {
    setLoading(true);
    authApi.me()
      .then((user) => setCurrentUser(user))
      .catch((err) => console.warn("Failed to load user profile in order detail page", err));

    loadPaymentStatus();
    Promise.all([
      orderApi.getOrder(orderId),
      orderApi.getPaymentByOrderId(orderId).catch(err => {
        console.warn("Failed to load payment info:", err);
        return null;
      })
    ])
      .then(async ([orderData, paymentData]) => {
        setOrder(orderData);
        if (paymentData) {
          setPayment(paymentData.data || paymentData);
        }
        if (orderData && orderData.items) {
          const updatedItems = await Promise.all(
            orderData.items.map(async (item) => {
              if (item.productImage) return item;
              try {
                const prod = await productApi.getProductDetail(item.productId);
                return { ...item, productImage: prod.imageUrl || prod.image };
              } catch (e) {
                console.warn(`Failed to fetch product detail for ${item.productId}`, e);
                return item;
              }
            })
          );
          setOrder(prev => {
            if (!prev) return prev;
            return { ...prev, items: updatedItems };
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [orderId, loadPaymentStatus]);

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
    return 1;
  };

  return (
    <div className="space-y-4 py-2 max-w-container-max mx-auto px-4">
      {/* Back Link */}
      <Link 
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-primary transition-colors py-1.5 px-3 bg-slate-150/80 dark:bg-slate-800/80 rounded-xl w-fit shadow-sm"
        to="/profile"
      >
        <Icon name="arrow_back" className="text-sm" /> Quay lại hồ sơ tài khoản
      </Link>

      {notice && (
        <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3 border ${
          notice.type === "success"
            ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            : "bg-rose-50 dark:bg-rose-955/20 border-rose-250 dark:border-rose-800 text-rose-800 dark:text-rose-300"
        }`}>
          <Icon name={notice.type === "success" ? "check_circle" : "error"} className="text-[20px] shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      {/* Kết quả / trạng thái thanh toán online: lấy từ server, không dựa vào tham số URL */}
      {payInfo && (payInfo.canRetry || (returnedFromGateway && payInfo.paymentMethod === "VNPAY")) && (
        payInfo.result === "SUCCESS" ? (["CANCELLED", "RETURNING", "RETURNED"].includes(order.status) ? null :
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3">
            <Icon name="verified" className="text-[20px] text-emerald-600 shrink-0" />
            <span>Thanh toán thành công qua VNPAY! Đơn hàng của bạn đang được chuẩn bị để giao.</span>
          </div>
        ) : payInfo.canRetry ? (
          <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-3.5 rounded-2xl text-xs font-semibold space-y-3">
            <div className="flex items-start gap-3">
              <Icon name="error" className="text-[20px] text-rose-600 shrink-0" />
              <span>
                {payInfo.message || "Đơn hàng chưa được thanh toán."} Đơn hàng vẫn được giữ; đơn chưa thanh toán sẽ tự hủy sau 30 phút kể từ lúc đặt.
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pl-8">
              <button
                type="button"
                onClick={() => handleRetryPayment("VNPAY")}
                disabled={!!payAction}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold disabled:opacity-50"
              >
                {payAction === "VNPAY" ? "Đang chuyển hướng..." : "Thanh toán lại qua VNPAY"}
              </button>
              {payInfo.canSwitchToCod && (
                <button
                  type="button"
                  onClick={() => handleRetryPayment("COD")}
                  disabled={!!payAction}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[11px] font-bold disabled:opacity-50"
                >
                  {payAction === "COD" ? "Đang xử lý..." : "Đổi sang thanh toán khi nhận hàng"}
                </button>
              )}
            </div>
          </div>
        ) : payInfo.result === "PENDING" ? (
          <div className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3">
            <Icon name="schedule" className="text-[20px] shrink-0" />
            <span>{payInfo.message || "Đang chờ VNPAY xác nhận giao dịch. Vui lòng tải lại trang sau ít phút."}</span>
          </div>
        ) : payInfo.result === "FAILED" ? (
          <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3">
            <Icon name="error" className="text-[20px] text-rose-600 shrink-0" />
            <span>{payInfo.message || "Thanh toán không thành công. Quý khách vui lòng liên hệ hotline để được hỗ trợ."}</span>
          </div>
        ) : null
      )}

      {/* Redesigned Header & Progress Combined Panel */}
      <div className="bg-gradient-to-br from-white via-slate-50/20 to-slate-50/50 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Top Info Bar */}
        <div className="p-3 sm:p-4 px-4 sm:px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Icon name="receipt_long" className="text-lg" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-extrabold text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded">Chi Tiết Đơn Hàng</span>
                <span className="text-sm font-black text-slate-850 dark:text-slate-250">#{order.id}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Đặt lúc: {dateStr}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trạng thái:</span>
              <span className={`font-extrabold text-[11px] px-3 py-0.5 rounded-full border ${orderStatusBadge(order.status)}`}>
                {orderStatusLabel(order.status)}
              </span>
            </div>
            {isCustomerCancellable(order.status) && (
              <button
                onClick={() => setCancelDialogOpen(true)}
                className="text-rose-600 hover:text-rose-700 text-xs font-bold transition-all flex items-center gap-1 bg-rose-50/50 dark:bg-rose-955/10 border border-rose-100 dark:border-rose-900/30 px-3 py-1 rounded-xl"
              >
                <Icon name="cancel" className="text-sm" /> Hủy đơn
              </button>
            )}
          </div>
        </div>

        {/* Bottom Stepper Progress Row */}
        {["CANCELLED", "RETURNING", "RETURNED"].includes(order.status) ? (
          <div className="p-3 sm:p-4 bg-rose-50/20 dark:bg-rose-955/5 flex items-start gap-3 text-xs text-rose-600">
            <Icon name="error_outline" className="text-lg shrink-0" />
            <div className="space-y-0.5 font-semibold">
              <p>
                {order.status === "RETURNING"
                  ? "Đơn hàng đã bị hủy khi đang giao. Hàng đang được đơn vị vận chuyển hoàn về kho."
                  : order.status === "RETURNED"
                  ? "Hàng đã được hoàn về kho. Nếu bạn đã thanh toán online, tiền sẽ được hoàn về tài khoản/thẻ theo thời gian xử lý của ngân hàng (thường 3–7 ngày làm việc)."
                  : "Đơn hàng này đã bị hủy."}
              </p>
              {(order.cancelReasonCode || order.cancelReason) && (
                <p className="text-rose-500/90 font-medium">
                  Lý do: {cancelReasonLabel(order.cancelReasonCode, order.cancelReason)}
                  {order.cancelledAt ? ` · ${new Date(order.cancelledAt).toLocaleString("vi-VN")}` : ""}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 pb-5 sm:pb-6 bg-slate-50/30 dark:bg-slate-900/10">
            <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto py-2">
              {/* Background Line */}
              <div className="absolute left-[20px] right-[20px] top-[18px] h-[3px] bg-slate-200 dark:bg-slate-800 -z-0 rounded-full"></div>
              
              {/* Dynamic Progress Line */}
              <div 
                className="absolute left-[20px] top-[18px] h-[3px] bg-primary transition-all duration-500 -z-0 rounded-full"
                style={{ 
                  width: `${
                    order.status === "DELIVERED" || order.status === "COMPLETED" ? "calc(100% - 2.5rem)" : 
                    order.status === "SHIPPED" ? "calc(66.6% - 1.6rem)" : 
                    order.status === "CONFIRMED" ? "calc(33.3% - 0.8rem)" : "0%"
                  }` 
                }}
              ></div>

              {/* Step 1: Đặt đơn */}
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-primary border-2 border-primary text-white shadow-[0_0_10px_rgba(239,68,68,0.25)]">
                  <Icon name="shopping_bag" className="text-xs" />
                </div>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 block">Đặt đơn</span>
              </div>

              {/* Step 2: Xác nhận */}
              <div className="flex flex-col items-center text-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  ["CONFIRMED", "SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status)
                    ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(239,68,68,0.25)]"
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400"
                }`}>
                  <Icon name="verified" className="text-xs" />
                </div>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 block">Xác nhận</span>
              </div>

              {/* Step 3: Vận chuyển */}
              <div className="flex flex-col items-center text-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  ["SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status)
                    ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(239,68,68,0.25)]"
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400"
                }`}>
                  <Icon name="local_shipping" className="text-xs" />
                </div>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 block">Đang giao</span>
              </div>

              {/* Step 4: Thành công */}
              <div className="flex flex-col items-center text-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                  ["DELIVERED", "COMPLETED"].includes(order.status)
                    ? "bg-emerald-600 border-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                    : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400"
                }`}>
                  <Icon name="check_circle" className="text-xs" />
                </div>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 block">Đã nhận</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Two Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Product lists & Delivery Info (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Products List Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.015)] space-y-3">
            <h2 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              <Icon name="receipt" className="text-primary text-[18px]" /> Sản phẩm trong đơn hàng
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {items.map((item, index) => {
                let variantLabel = "";
                if (item.variantAttr) {
                  try {
                    variantLabel = typeof item.variantAttr === 'string'
                      ? Object.values(JSON.parse(item.variantAttr)).join(" - ")
                      : Object.values(item.variantAttr).join(" - ");
                  } catch (e) {}
                }

                return (
                  <div key={item.id || index} className="py-3 flex gap-3 items-center justify-between hover:bg-slate-50/25 dark:hover:bg-slate-800/20 px-2 rounded-xl transition-colors">
                    <Link to={`/product/${item.productId}`} className="flex gap-3 items-center min-w-0 flex-1 hover:opacity-90">
                      {item.productImage ? (
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="w-14 h-14 object-contain bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-xl p-1.5 shrink-0 shadow-sm transition-transform hover:scale-105"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-750 flex flex-col items-center justify-center rounded-xl shrink-0 text-slate-400 gap-0.5">
                          <Icon name="image" className="text-xs" />
                          <span className="text-[7px] text-slate-400 font-semibold uppercase">Không ảnh</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-2 block leading-snug hover:text-primary transition-colors">
                          {item.productName || `Mã sản phẩm: ${item.productId}`}
                        </h4>
                        {variantLabel && (
                          <span className="text-[9px] text-primary/80 dark:text-primary/75 font-extrabold bg-rose-50 dark:bg-rose-955/20 px-1.5 py-0.5 rounded inline-block mt-0.5 border border-rose-100/50">
                            {variantLabel}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="text-right shrink-0 pl-3">
                      <strong className="text-xs font-black text-slate-850 dark:text-slate-200 block">
                        {formatVnd(Number(item.subtotal || (item.unitPrice || item.price || 0) * (item.quantity || item.qty)))}
                      </strong>
                      <span className="text-[10px] text-slate-450 block mt-0.5">
                        {formatVnd(Number(item.unitPrice || item.price || 0))} x {item.quantity || item.qty}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery Note & Details Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.015)] space-y-3">
            <h2 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              <Icon name="local_shipping" className="text-primary text-[18px]" /> Thông tin giao nhận hàng
            </h2>
            <div className="space-y-2 text-xs font-semibold text-slate-650 dark:text-slate-400">
              <div className="flex gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 w-24">Người nhận hàng:</span>
                <span className="text-slate-800 dark:text-slate-205 font-bold">{order.recipientName || currentUser?.fullName || currentUser?.name || "Khách hàng"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 w-24">Số điện thoại:</span>
                <span className="text-slate-800 dark:text-slate-205 font-bold">{order.recipientPhone || order.phoneNumber || "-"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 w-24">Địa chỉ nhận hàng:</span>
                <span className="text-slate-800 dark:text-slate-205 leading-relaxed font-bold">{order.shippingAddress || "-"}</span>
              </div>
              {order.note && (
                <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500 shrink-0 w-24">Ghi chú giao hàng:</span>
                  <span className="text-slate-700 dark:text-slate-350 italic">"{order.note}"</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Billing details & Payment Methods (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Order Summary Billing Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.015)] space-y-3">
            <h2 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              Chi tiết thanh toán
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Tổng tiền hàng (Tạm tính):</span>
                <span className="font-bold text-slate-850 dark:text-slate-200">
                  {formatVnd(Number(order.totalAmount || order.total || 0))}
                </span>
              </div>

              {order.discountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>Giảm giá sản phẩm:</span>
                  <span className="font-bold">
                    -{formatVnd(order.discountAmount)}
                  </span>
                </div>
              )}

              {order.pointDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>Giảm bằng điểm:</span>
                  <span className="font-bold">
                    -{formatVnd(order.pointDiscountAmount)}
                  </span>
                </div>
              )}

              {order.couponCode && (
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>Mã giảm giá áp dụng:</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-100/40">
                    {order.couponCode}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-500 font-medium">
                <span>Phí vận chuyển:</span>
                {order.shippingFee > 0 ? (
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {formatVnd(Number(order.shippingFee))}
                  </span>
                ) : (
                  <span className="font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">Miễn phí</span>
                )}
              </div>

              {order.shippingDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>Giảm phí vận chuyển:</span>
                  <span className="font-bold">
                    -{formatVnd(order.shippingDiscountAmount)}
                  </span>
                </div>
              )}

              {order.vatAmount > 0 && (
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Trong đó VAT (10%):</span>
                  <span className="font-semibold">{formatVnd(Number(order.vatAmount))}</span>
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-slate-800 my-1.5 pt-2.5 flex justify-between items-center text-sm">
                <span className="font-black text-slate-850 dark:text-slate-200">Tổng cộng:</span>
                <span className="text-lg font-black text-primary">
                  {formatVnd(Number(order.finalAmount || order.totalAmount || order.total || 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method Details Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.015)] space-y-3">
            <h2 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              Phương thức thanh toán
            </h2>
            
            {(() => {
              const payMethod = (payInfo?.paymentMethod || payment?.paymentMethod || "").toUpperCase();
              const payStatus = (payInfo?.paymentStatus || payment?.status || "").toUpperCase();
              // COD chỉ "đã thanh toán" khi đã giao; VNPay theo trạng thái giao dịch thật.
              const isPaid = payMethod === "COD" ? order.status === "DELIVERED" : payStatus === "SUCCESS";
              const isRefunded = ["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"].includes(payStatus);
              const isFailed = (payStatus === "FAILED" || payStatus === "EXPIRED") && !["CANCELLED", "RETURNING", "RETURNED"].includes(order.status);
              const statusText = isRefunded
                ? (payStatus === "REFUND_PENDING" ? "Đang hoàn tiền" : payStatus === "PARTIALLY_REFUNDED" ? "Đã hoàn một phần" : "Đã hoàn tiền")
                : isPaid ? "Đã thanh toán"
                : ["CANCELLED", "RETURNING", "RETURNED"].includes(order.status) ? "Không thu tiền (đơn đã hủy)"
                : payStatus === "FAILED" || payStatus === "EXPIRED" ? "Thanh toán không thành công"
                : payMethod === "COD" ? "Thu tiền khi giao hàng"
                : !payMethod ? "Chưa thanh toán" : "Chờ thanh toán";

              return (
                <div className="space-y-4">
                  {/* Method */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      payMethod === "COD" 
                        ? "bg-amber-50 dark:bg-amber-955/20 text-amber-600 border border-amber-200/20" 
                        : "bg-blue-50 dark:bg-blue-955/20 text-blue-600 border border-blue-200/20"
                    }`}>
                      <Icon className="text-[18px]" name={payMethod === "COD" ? "local_shipping" : "credit_card"} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-850 dark:text-slate-200 leading-tight">
                        {payMethod === "COD" ? "Thanh toán khi nhận hàng (COD)" : payMethod === "VNPAY" ? "Thanh toán online qua VNPAY" : "Chưa chọn phương thức"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Hình thức thanh toán</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isPaid 
                        ? "bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 border border-emerald-250/20" 
                        : isFailed
                        ? "bg-rose-50 dark:bg-rose-955/20 text-rose-600 border border-rose-200/20" 
                        : "bg-amber-50 dark:bg-amber-955/20 text-amber-600 border border-amber-200/20"
                    }`}>
                      <Icon className="text-[18px]" name={isPaid ? "check_circle" : isFailed ? "error" : isRefunded ? "currency_exchange" : "schedule"} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold leading-tight ${
                        isPaid ? "text-emerald-700" : isFailed ? "text-rose-600" : "text-amber-600"
                      }`}>
                        {statusText}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Trạng thái giao dịch</p>
                    </div>
                  </div>

                  {payMethod === "VNPAY" && payment && payment.transactionNo && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[10px] font-semibold text-slate-500 space-y-2">
                      <div className="flex justify-between">
                        <span>Mã giao dịch:</span>
                        <span className="text-slate-800 dark:text-slate-350 select-all font-mono font-bold">{payment.transactionNo}</span>
                      </div>
                      {payment.paidAt && (
                        <div className="flex justify-between">
                          <span>Thời gian giao dịch:</span>
                          <span className="text-slate-700 dark:text-slate-350 font-mono">
                            {new Date(payment.paidAt).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <CancelOrderDialog
            open={cancelDialogOpen}
            orderId={order.id}
            note={payInfo?.paymentStatus === "SUCCESS"
              ? "Đơn đã thanh toán online sẽ được hoàn tiền về tài khoản/thẻ sau khi hủy."
              : "Bạn có thể hủy đơn khi đơn chưa được bàn giao cho đơn vị vận chuyển."}
            onConfirm={handleConfirmCancel}
            onClose={() => setCancelDialogOpen(false)}
          />

          {/* Customer Support Panel */}
          <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 space-y-2.5 text-xs text-slate-500 dark:text-slate-400">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Icon name="help_outline" className="text-primary text-sm" /> Cần trợ giúp?
            </h3>
            <p className="text-[11px] leading-relaxed">
              Nếu quý khách cần hỗ trợ đổi trả, bảo hành hoặc thắc mắc về quá trình giao nhận hàng, vui lòng liên hệ:
            </p>
            <div className="flex items-center gap-1.5 font-bold text-primary pt-1 border-t border-slate-150 dark:border-slate-800/60">
              <Icon name="phone_in_talk" className="text-sm animate-pulse" />
              <span>Hotline hỗ trợ: 0389.468.847</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
