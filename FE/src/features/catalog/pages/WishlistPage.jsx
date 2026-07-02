import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useWishlist } from "../../../context/WishlistContext.jsx";
import ProductCard from "../components/ProductCard.jsx";
import Icon from "../../../components/common/Icon.jsx";

export default function WishlistPage() {
  const { wishlist, clearWishlist } = useWishlist();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => {
    if (confirmClear) {
      clearWishlist();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div className="space-y-6 py-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Link className="hover:text-primary transition-colors flex items-center gap-0.5" to="/">
          <Icon name="home" className="text-sm" /> Trang chủ
        </Link>
        <Icon name="chevron_right" className="text-sm text-slate-300" />
        <span className="text-primary font-bold">Yêu thích</span>
      </nav>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-red-50 dark:from-primary/20 dark:to-red-950/20 flex items-center justify-center">
              <Icon name="favorite" className="text-primary text-2xl" filled />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-200 tracking-tight">
                Sản phẩm yêu thích
              </h1>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                {wishlist.length > 0
                  ? `Bạn đang theo dõi ${wishlist.length} sản phẩm`
                  : "Chưa có sản phẩm nào được thả tim"}
              </p>
            </div>
          </div>
          {wishlist.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleClear}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs uppercase rounded-xl border-none cursor-pointer transition-all whitespace-nowrap ${
                confirmClear
                  ? "bg-primary text-white shadow-md shadow-red-500/20"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
              }`}
              type="button"
            >
              <Icon name={confirmClear ? "warning" : "delete_sweep"} className="text-sm" />
              {confirmClear ? "Xác nhận xoá?" : "Xoá tất cả"}
            </motion.button>
          )}
        </div>
      </div>

      {/* Content */}
      {wishlist.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 sm:p-12 shadow-sm"
        >
          <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <div className="relative mb-6">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20 flex items-center justify-center border-2 border-dashed border-red-200 dark:border-red-800/40">
                <Icon name="favorite" className="text-5xl text-red-300 dark:text-red-600/50" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-1 -right-1"
              >
                <Icon name="heart_broken" className="text-xl text-slate-300 dark:text-slate-600" />
              </motion.div>
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-2">
              Chưa có sản phẩm yêu thích
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Hãy khám phá cửa hàng và thả tim ❤️ những sản phẩm công nghệ bạn ưng ý nhất nhé!
            </p>
            <Link
              to="/category"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-red-600 text-white font-extrabold text-sm uppercase rounded-xl hover:from-red-700 hover:to-red-800 transition-all shadow-lg shadow-red-500/25 hover:shadow-xl"
            >
              <Icon name="arrow_back" className="text-sm" />
              Khám phá ngay
            </Link>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            <AnimatePresence mode="popLayout">
              {wishlist.map((product, idx) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
}
