import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import OrderSummary from "../components/OrderSummary.jsx";
import ProductCard from "../../catalog/components/ProductCard.jsx";
import { useCart } from "../../../context/CartContext.jsx";
import { productApi } from "../../../services/productApi";
import { formatVnd } from "../../../utils/format.js";
import { aiApi } from "../../../services/aiApi.ts";
import { orderApi } from "../../../services/orderApi";
import { hasAuthToken } from "../../../services/apiClient";

/* ===================== Cart Item Component ===================== */

function CartItemCard({ item, onUpdateQty, onRemove }) {
  const [imgError, setImgError] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleRemove = () => {
    setRemoving(true);
    setTimeout(() => onRemove(item.id, item.variant), 300);
  };

  const unitPrice = Number(item.price || 0);
  const lineTotal = unitPrice * item.qty;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 80, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`group relative flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-300 ${
        removing
          ? "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20"
          : "border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm"
      }`}
    >
      {/* Product Image */}
      <Link
        to={`/product/${item.id}`}
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 flex items-center justify-center p-2 shrink-0 transition-transform duration-300"
      >
        {!imgError ? (
          <img
            alt={item.name}
            src={item.image}
            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <Icon name="image" className="text-slate-300 text-2xl" />
        )}
      </Link>

      {/* Product Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-1">
            <Link
              to={`/product/${item.id}`}
              className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:text-primary transition-colors line-clamp-2 leading-tight"
            >
              {item.name}
            </Link>
            
            {/* Specs Tag */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded">
                <Icon name="tune" className="text-[9px]" />
                {item.variant || "Tiêu chuẩn"}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded">
                <Icon name="verified" className="text-[9px]" />
                Chính hãng
              </span>
              {item.qty >= 3 && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                  Mua sỉ
                </span>
              )}
            </div>
          </div>

          {/* Remove Button */}
          <button
            onClick={handleRemove}
            className="text-slate-305 hover:text-primary p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 border-none bg-transparent cursor-pointer"
            type="button"
            title="Xóa sản phẩm"
          >
            <Icon name="delete_outline" className="text-lg" />
          </button>
        </div>

        {/* Pricing & Controls Row */}
        <div className="flex flex-wrap items-end justify-between gap-2 mt-3">
          {/* Quantity Controls */}
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 h-8">
            <button
              onClick={() => onUpdateQty(item.id, item.variant, item.qty - 1)}
              disabled={item.qty <= 1}
              className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer transition-colors"
              type="button"
            >
              <Icon name="remove" className="text-xs" />
            </button>
            <div className="w-8 text-center text-xs font-black text-slate-800 dark:text-slate-200">
              {item.qty}
            </div>
            <button
              onClick={() => onUpdateQty(item.id, item.variant, item.qty + 1)}
              disabled={item.qty >= 99}
              className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer transition-colors"
              type="button"
            >
              <Icon name="add" className="text-xs" />
            </button>
          </div>

          {/* Price Breakdown */}
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block mb-0.5">
              {formatVnd(unitPrice)} / cái
            </span>
            <strong className="text-sm font-extrabold text-primary block">
              {formatVnd(lineTotal)}
            </strong>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/* ===================== Empty Cart ===================== */

function EmptyCart() {
  return (
    <div className="relative w-full max-w-md mx-auto my-4 sm:my-8">
      {/* Background Glowing Ambient Orbs */}
      <div className="absolute -top-10 -left-10 w-44 h-44 bg-primary/20 dark:bg-primary/30 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute -bottom-10 -right-10 w-44 h-44 bg-indigo-500/20 dark:bg-indigo-500/30 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDelay: "2s" }} />

      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/80 rounded-[28px] p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.02)] flex flex-col items-center justify-center text-center"
      >
        {/* Floating Abstract Bubbles for 3D depth */}
        <motion.div 
          animate={{ y: [0, -8, 0], x: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="absolute top-8 left-8 w-2.5 h-2.5 rounded-full bg-rose-400/40 blur-[0.5px]" 
        />
        <motion.div 
          animate={{ y: [0, 8, 0], x: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-12 right-10 w-3 h-3 rounded-full bg-blue-400/40 blur-[0.5px]" 
        />

        {/* Floating Animated Cart Illustration */}
        <div className="relative mb-5">
          {/* Glowing Aura Ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary via-rose-500 to-indigo-500 blur-xl opacity-30 animate-pulse" />
          
          <motion.div 
            animate={{ y: [0, -6, 0], rotate: [0, 1, -1, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-primary via-rose-500 to-indigo-500 flex items-center justify-center p-0.5 shadow-[0_8px_24px_rgba(239,68,68,0.15)]"
          >
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
              <Icon name="shopping_cart" className="text-2xl text-transparent bg-clip-text bg-gradient-to-r from-primary via-rose-500 to-indigo-500" />
            </div>
          </motion.div>
          
          {/* Pulsing Zero Badge */}
          <span className="absolute top-0 right-0 w-5.5 h-5.5 rounded-full bg-amber-400 text-amber-955 flex items-center justify-center text-[9px] font-black shadow-lg border border-white dark:border-slate-900 animate-bounce">
            0
          </span>
        </div>

        {/* Dynamic Title with Color Gradient */}
        <h3 className="text-sm font-black mb-1.5 uppercase tracking-wider bg-gradient-to-r from-slate-900 via-primary to-indigo-600 dark:from-white dark:via-primary dark:to-indigo-400 bg-clip-text text-transparent">
          Giỏ hàng của bạn đang trống
        </h3>
        
        <p className="text-[11px] text-slate-505 dark:text-slate-400 max-w-xs mx-auto mb-5 leading-relaxed font-semibold">
          Có vẻ như bạn chưa chọn được sản phẩm công nghệ nào. Hãy lấp đầy giỏ hàng bằng những ưu đãi cực hấp dẫn dưới đây!
        </p>

        <Link
          to="/category"
          className="inline-flex items-center gap-1.5 px-6 py-2 bg-gradient-to-r from-primary via-rose-500 to-indigo-600 text-white font-extrabold text-[10px] uppercase rounded-xl transition-all shadow-[0_6px_20px_rgba(239,68,68,0.2)] hover:shadow-[0_8px_25px_rgba(239,68,68,0.3)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <Icon name="arrow_back" className="text-xs animate-pulse" />
          Tiếp tục mua sắm
        </Link>
      </motion.div>
    </div>
  );
}


/* ===================== Main CartPage ===================== */

export default function CartPage() {
  const { items, updateQty, removeItem, summary, addToCart, showToast } = useCart();
  const [recommended, setRecommended] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [backendSummary, setBackendSummary] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function getPreview() {
      if (!hasAuthToken() || items.length === 0) {
        setBackendSummary(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const res = await orderApi.previewCheckout({});
        if (!cancelled) setBackendSummary(res);
      } catch (err) {
        console.error("Preview failed:", err);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    getPreview();
    return () => { cancelled = true; };
  }, [items]);

  // Load dynamic cross-sell recommendations
  useEffect(() => {
    if (items.length > 0) {
      const itemIds = items.map((item) => String(item.id));
      aiApi
        .getCrossSellCombo(itemIds)
        .then(setRecommended)
        .catch(() => setRecommended([]));
    } else {
      productApi
        .listProducts()
        .then((data) => setRecommended(data.slice(0, 4)))
        .catch(() => setRecommended([]));
    }
  }, [items]);

  const localSummary = useMemo(() => {
    if (backendSummary) {
      return {
        subtotal: backendSummary.subtotal || 0,
        discount: backendSummary.totalDiscount || 0,
        shipping: backendSummary.shippingFee || 0,
        shippingDiscount: backendSummary.shippingDiscount || 0,
        pointDiscount: backendSummary.pointDiscount || 0,
        vat: backendSummary.vatAmount || 0,
        total: backendSummary.finalAmount || 0,
      };
    }
    const subtotal = summary.subtotal;
    const discount = 0;
    const shipping = subtotal >= 500000 ? 0 : 30000;
    const vat = Math.round(subtotal * 0.1);
    const total = subtotal - discount + shipping + vat;
    return { subtotal, discount, shipping, vat, total };
  }, [summary, backendSummary]);

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((item) => `${item.id}-${item.variant}`));
    }
  };

  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const steps = [
    { num: 1, label: "Giỏ hàng", active: true },
    { num: 2, label: "Thông tin giao nhận", active: false },
    { num: 3, label: "Thanh toán", active: false },
  ];

  return (
    <div className="space-y-6 py-4">
      {/* ===================== Checkout Steps ===================== */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute left-[40px] right-[40px] top-[18px] h-[3.5px] bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-red-500 rounded-full transition-all duration-500" 
              style={{ width: `${(steps.findIndex(s => s.active) / (steps.length - 1)) * 100}%` }} 
            />
          </div>

          {steps.map((step, idx) => (
            <div key={step.num} className="flex flex-col items-center gap-1.5 z-10">
              <motion.div
                initial={false}
                animate={step.active ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.4 }}
                className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-xs shadow-sm transition-all ${
                  step.active
                    ? "bg-gradient-to-br from-primary to-red-600 text-white ring-4 ring-red-500/20"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}
              >
                {step.active ? <Icon name="shopping_cart" className="text-sm" /> : step.num}
              </motion.div>
              <span className={`text-[10px] font-bold whitespace-nowrap ${step.active ? "text-primary" : "text-slate-400 dark:text-slate-500"}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ===================== Left: Cart Items ===================== */}
        <section className="flex-1 w-full space-y-4">
          {/* Header */}
          {items.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon name="shopping_cart" className="text-primary text-lg" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight">
                      Giỏ hàng
                    </h1>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {items.length} sản phẩm đang chọn
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500">
                    Tạm tính: <strong className="text-primary font-extrabold text-sm ml-1">{formatVnd(localSummary.subtotal)}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}


          {/* Cart Items List */}
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <CartItemCard
                    key={`${item.id}-${item.variant}`}
                    item={item}
                    onUpdateQty={updateQty}
                    onRemove={removeItem}
                  />
                ))}
              </AnimatePresence>

              {/* Bottom actions */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between pt-2"
              >
                <Link
                  to="/category"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-primary transition-colors"
                >
                  <Icon name="arrow_back" className="text-sm" />
                  Tiếp tục mua sắm
                </Link>
              </motion.div>
            </div>
          )}
        </section>

        {/* ===================== Right: Order Summary ===================== */}
        {items.length > 0 && (
          <OrderSummary
            summary={localSummary}
            actionLabel="Tiến hành thanh toán"
            actionTo="/checkout"
          />
        )}
      </div>

      {/* ===================== Suggested Products (AI Cross-sell) ===================== */}
      {recommended.length > 0 && (
        <section className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-md">
                <Icon name="bolt" className="text-white text-sm" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-2">
                  {items.length > 0 ? (
                    <>
                      Ưu đãi mua kèm <span className="text-[10px] bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">AI Combo Recommended</span>
                    </>
                  ) : (
                    "Gợi ý sản phẩm nổi bật"
                  )}
                </h2>
                <p className="text-[10.5px] text-slate-400 font-medium">
                  {items.length > 0 
                    ? "Sản phẩm thường được mua cùng các thiết bị trong giỏ hàng của bạn (FP-Growth Association)" 
                    : "Khám phá các thiết bị công nghệ đỉnh cao đang được yêu thích nhất"
                  }
                </p>
              </div>
            </div>
            <Link
              to="/category"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5"
            >
              Xem tất cả
              <Icon name="chevron_right" className="text-sm" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommended.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex-1">
                  <ProductCard product={product} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    addToCart({
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      image: product.image,
                      qty: 1,
                      variant: "Tiêu chuẩn"
                    });
                    showToast(`Đã thêm ${product.name} vào giỏ hàng!`);
                  }}
                  className="w-full mt-3 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                >
                  <Icon name="add_shopping_cart" className="text-xs" />
                  Thêm nhanh vào giỏ
                </button>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
