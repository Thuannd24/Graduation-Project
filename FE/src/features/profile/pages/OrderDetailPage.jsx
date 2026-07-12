import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { authApi } from "../../../services/authApi";
import { orderApi } from "../../../services/orderApi";
import { productApi } from "../../../services/productApi";
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
  const [payment, setPayment] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
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
    setLoading(true);
    authApi.me()
      .then((user) => setCurrentUser(user))
      .catch((err) => console.warn("Failed to load user profile in order detail page", err));

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

      {/* Payment Status Notification Banner */}
      {paymentStatus && (
        paymentStatus === "00" && order.status !== "CANCELLED" ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3 shadow-[0_2px_15px_rgba(16,185,129,0.06)] animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0">
              <Icon name="verified" className="text-[20px]" />
            </div>
            <span>Thanh toán thành công qua cổng VNPAY! Đơn hàng của bạn đang được chuẩn bị để giao nhận.</span>
          </div>
        ) : (
          <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-3 shadow-[0_2px_15px_rgba(239,68,68,0.06)] animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 shrink-0">
              <Icon name="error" className="text-[20px]" />
            </div>
            <span>
              {order.status === "CANCELLED"
                ? "Giao dịch thanh toán VNPAY được ghi nhận thành công, nhưng đơn hàng này đã bị hủy trước đó. Vui lòng liên hệ chăm sóc khách hàng để tiến hành hoàn tiền."
                : `Thanh toán qua cổng VNPAY không thành công hoặc giao dịch đã bị hủy (Mã lỗi: ${paymentStatus}). Quý khách có thể thử lại hoặc liên hệ hotline để được hỗ trợ.`}
            </span>
          </div>
        )
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
              <span className={`font-extrabold text-[11px] px-3 py-0.5 rounded-full border ${getStatusBadgeClass(order.status)}`}>
                {getStatusLabel(order.status)}
              </span>
            </div>
            {isOrderCancelable(order) ? (
              <div className="flex items-center gap-2 bg-rose-50/50 dark:bg-rose-955/10 border border-rose-100 dark:border-rose-900/30 px-3 py-1 rounded-xl">
                <button
                  onClick={handleCancelClick}
                  disabled={cancelling}
                  className="text-rose-600 hover:text-rose-700 disabled:opacity-50 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Icon name="cancel" className="text-sm" /> Hủy đơn
                </button>
                <span className="text-[9px] text-rose-500 font-bold border-l border-rose-200/50 pl-2">
                  Còn {Math.round(getCancelTimeLeft(order.createdAt) / 60000)} phút
                </span>
              </div>
            ) : (
              ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"].includes(String(order.status).toUpperCase()) && (
                <span className="text-[10px] text-rose-500 font-bold bg-rose-50/30 px-2.5 py-1 rounded-full border border-rose-100/50">
                  Hết hạn hủy
                </span>
              )
            )}
          </div>
        </div>

        {/* Bottom Stepper Progress Row */}
        {order.status === "CANCELLED" ? (
          <div className="p-3 sm:p-4 bg-rose-50/20 dark:bg-rose-955/5 flex items-center gap-3 text-xs text-rose-600">
            <Icon name="error_outline" className="text-lg animate-pulse" />
            <span className="font-semibold">Đơn hàng này đã bị hủy. Cảm ơn quý khách đã tin tưởng AuraTech.</span>
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
                <span className="text-slate-800 dark:text-slate-205 font-bold">{order.recipientName || order.name || currentUser?.fullName || currentUser?.name || "Khách hàng"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 w-24">Số điện thoại:</span>
                <span className="text-slate-800 dark:text-slate-205 font-bold">{order.phoneNumber || "-"}</span>
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
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>Thuế VAT (10%):</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    +{formatVnd(Number(order.vatAmount))}
                  </span>
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
              const payMethod = payment ? payment.paymentMethod?.toUpperCase() : (order.status === "PENDING" || order.status === "AWAITING_PAYMENT" ? "COD" : "N/A");
              const payStatus = payment ? payment.status?.toUpperCase() : (["DELIVERED", "CONFIRMED", "SHIPPED"].includes(order.status) ? "SUCCESS" : "PENDING");
              const isPaid = payStatus === "SUCCESS" || order.status === "DELIVERED";

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
                        {payMethod === "COD" ? "Thanh toán khi nhận hàng" : "Thanh toán Online VNPAY"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Hình thức thanh toán</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isPaid 
                        ? "bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 border border-emerald-250/20" 
                        : payStatus === "FAILED" 
                        ? "bg-rose-50 dark:bg-rose-955/20 text-rose-600 border border-rose-200/20" 
                        : "bg-amber-50 dark:bg-amber-955/20 text-amber-600 border border-amber-200/20"
                    }`}>
                      <Icon className="text-[18px]" name={isPaid ? "check_circle" : payStatus === "FAILED" ? "error" : "schedule"} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold leading-tight ${
                        isPaid ? "text-emerald-700" : payStatus === "FAILED" ? "text-rose-600" : "text-amber-600"
                      }`}>
                        {isPaid ? "Đã nhận thanh toán" : payStatus === "FAILED" ? "Thanh toán bị lỗi" : "Chờ thanh toán"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Trạng thái giao dịch</p>
                    </div>
                  </div>

                  {payment && payment.transactionNo && (
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
              <span>Hotline miễn phí: 1800.2097</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
