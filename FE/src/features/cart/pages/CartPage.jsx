import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import OrderSummary from "../components/OrderSummary.jsx";
import ProductCard from "../../catalog/components/ProductCard.jsx";
import { useCart } from "../../../context/CartContext.jsx";
import { productApi } from "../../../services/productApi";
import { formatVnd } from "../../../utils/format.js";

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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`group relative flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 bg-white dark:bg-slate-900 rounded-xl border transition-all duration-300 ${
        removing
          ? "border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20"
          : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md"
      }`}
    >
      {/* Image */}
      <Link
        to={`/product/${item.id}`}
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center p-2 shrink-0 group/image"
      >
        {!imgError ? (
          <img
            alt={item.name}
            src={item.image}
            className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover/image:scale-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <Icon name="image" className="text-slate-300 text-2xl" />
        )}
      </Link>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
        <div>
          <Link
            to={`/product/${item.id}`}
            className="font-bold text-sm text-slate-800 dark:text-slate-200 hover:text-primary transition-colors line-clamp-2 leading-snug"
          >
            {item.name}
          </Link>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              <Icon name="tune" className="text-[10px]" />
              {item.variant || "Tiêu chuẩn"}
            </span>
            {item.qty >= 3 && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                Mua sỉ
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 flex-wrap">
          {/* Qty Controls */}
          <div className="flex items-center border-2 border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950 h-9">
            <button
              onClick={() => onUpdateQty(item.id, item.variant, item.qty - 1)}
              disabled={item.qty <= 1}
              className="w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer transition-colors text-base font-bold"
              type="button"
            >
              <Icon name="remove" className="text-sm" />
            </button>
            <div className="w-10 text-center text-sm font-extrabold text-slate-800 dark:text-slate-200 bg-transparent select-none">
              {item.qty}
            </div>
            <button
              onClick={() => onUpdateQty(item.id, item.variant, item.qty + 1)}
              disabled={item.qty >= 99}
              className="w-9 h-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed border-none cursor-pointer transition-colors text-base font-bold"
              type="button"
            >
              <Icon name="add" className="text-sm" />
            </button>
          </div>

          {/* Price & Remove */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <strong className="text-sm font-extrabold text-primary block">
                {formatVnd(lineTotal)}
              </strong>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {formatVnd(unitPrice)} / cái
              </span>
            </div>
            <button
              onClick={handleRemove}
              className="w-9 h-9 rounded-xl bg-transparent hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-300 hover:text-primary flex items-center justify-center border-none cursor-pointer transition-all hover:scale-110"
              type="button"
              title="Xóa sản phẩm"
            >
              <Icon name="delete" className="text-lg" />
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/* ===================== Empty Cart ===================== */

function EmptyCart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-center py-16 sm:py-20 flex flex-col items-center justify-center"
    >
      <div className="relative mb-6">
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-slate-50 to-red-50 dark:from-slate-900 dark:to-red-950/20 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Icon name="shopping_cart" className="text-5xl text-slate-300 dark:text-slate-600" />
        </div>
        <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center text-xs font-bold shadow-lg">
          0
        </div>
      </div>
      <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-1">
        Giỏ hàng trống
      </h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
        Bạn chưa có sản phẩm nào trong giỏ hàng. Khám phá ngay các sản phẩm công nghệ đỉnh cao!
      </p>
      <Link
        to="/category"
        className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-red-600 text-white font-extrabold text-sm uppercase rounded-xl hover:from-red-700 hover:to-red-800 transition-all shadow-lg shadow-red-500/25 hover:shadow-xl"
      >
        <Icon name="arrow_back" className="text-sm" />
        Tiếp tục mua sắm
      </Link>
    </motion.div>
  );
}

/* ===================== Free Shipping Progress Bar ===================== */

function ShippingProgress({ subtotal }) {
  const FREE_SHIPPING_THRESHOLD = 500000; // 500k
  const progress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return (
      <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <Icon name="check_circle" className="text-emerald-600 dark:text-emerald-400 text-lg" />
        </div>
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
          🎉 Bạn đã được miễn phí vận chuyển!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <Icon name="local_shipping" className="text-amber-600 dark:text-amber-400 text-lg" />
        </div>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-snug">
          Mua thêm <strong className="text-primary">{formatVnd(remaining)}</strong> để được <strong>miễn phí vận chuyển</strong>
        </p>
      </div>
      <div className="w-full h-2 bg-amber-100 dark:bg-amber-900/40 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
        />
      </div>
    </div>
  );
}

/* ===================== Main CartPage ===================== */

export default function CartPage() {
  const { items, updateQty, removeItem, summary } = useCart();
  const [recommended, setRecommended] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [selectedItems, setSelectedItems] = useState([]);

  // Load recommended products
  useEffect(() => {
    productApi
      .listProducts()
      .then((data) => setRecommended(data.slice(0, 4)))
      .catch(() => setRecommended([]));
  }, []);

  // Handle voucher application
  const handleApplyVoucher = (code) => {
    if (code === "AURATECH2026" || code === "TECHSTORE2026" || code === "KM10") {
      setDiscountPercent(0.1);
      sessionStorage.setItem("techstore_coupon_code", code);
      sessionStorage.setItem("techstore_coupon_discount_percent", "0.1");
    }
  };

  // Calculate local summary taking voucher into account
  const localSummary = useMemo(() => {
    const subtotal = summary.subtotal;
    const discount = discountPercent > 0 ? Math.round(subtotal * discountPercent) : 0;
    const vat = Math.round((subtotal - discount) * 0.1);
    const total = subtotal - discount + vat;
    return { subtotal, discount, shipping: 0, vat, total };
  }, [summary, discountPercent]);

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
          <div className="absolute left-[40px] right-[40px] top-[18px] h-[3px] bg-slate-200 dark:bg-slate-800 rounded-full">
            <div className="h-full bg-gradient-to-r from-primary to-red-500 rounded-full transition-all duration-500" style={{ width: `${(1 / (steps.length - 1)) * 100}%` }} />
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
                  <span className="text-xs font-semibold text-slate-500">
                    Tổng: <strong className="text-primary font-black">{formatVnd(localSummary.total)}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Free Shipping Progress */}
          {items.length > 0 && <ShippingProgress subtotal={summary.subtotal} />}

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
            onApplyVoucher={handleApplyVoucher}
            actionLabel="Tiến hành thanh toán"
            actionTo="/checkout"
          />
        )}
      </div>

      {/* ===================== Suggested Products ===================== */}
      {recommended.length > 0 && (
        <section className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm">
                <Icon name="bolt" className="text-white text-sm" />
              </div>
              <h2 className="text-base font-black text-slate-800 dark:text-slate-200 tracking-tight">
                Có thể bạn sẽ thích
              </h2>
            </div>
            <Link
              to="/category"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5"
            >
              Xem tất cả
              <Icon name="chevron_right" className="text-sm" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {recommended.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
