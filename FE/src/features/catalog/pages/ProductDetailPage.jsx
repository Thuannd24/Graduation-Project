import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { useCart } from "../../../context/CartContext.jsx";
import { useWishlist } from "../../../context/WishlistContext.jsx";
import { productApi } from "../../../services/productApi";
import { authApi } from "../../../services/authApi";
import { calculateDiscountPercent, formatVnd } from "../../../utils/format.js";
import keycloak from "../../../services/keycloak.js";

/* ======================== Helper Functions ======================== */

function parseVariantAttr(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function humanizeLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(.)/, (char) => char.toUpperCase());
}

function normalizeVariantOptions(variants, variantAxes) {
  return (variantAxes || []).map((axis) => {
    const axisCode = axis.attributeCode || axis.code || axis.name;
    const axisLabel = axis.attributeName || axis.name || humanizeLabel(axisCode);
    const options = Array.from(
      new Set(
        (variants || [])
          .map((variant) => parseVariantAttr(variant.variantAttr)?.[axisCode])
          .filter(Boolean)
          .map(String)
      )
    );
    return { axisCode, axisLabel, options };
  }).filter((group) => group.options.length > 0);
}

function findMatchingVariant(variants, selectedOptions) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const entries = Object.entries(selectedOptions || {}).filter(([, value]) => value);
  if (entries.length === 0) {
    return variants.find((variant) => variant.active !== false) || variants[0];
  }
  return (
    variants.find((variant) => {
      const attr = parseVariantAttr(variant.variantAttr);
      return entries.every(([key, value]) => String(attr[key] ?? "") === String(value));
    }) || variants.find((variant) => variant.active !== false) || variants[0]
  );
}

function buildSelectedOptions(variantAxes, variant) {
  const attr = parseVariantAttr(variant?.variantAttr);
  return (variantAxes || []).reduce((acc, axis) => {
    const axisCode = axis.attributeCode || axis.code || axis.name;
    if (attr[axisCode] != null) {
      acc[axisCode] = String(attr[axisCode]);
    }
    return acc;
  }, {});
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      year: "numeric", month: "long", day: "numeric"
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} giờ trước`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return formatDate(dateStr);
}

/* ======================== Zoom Modal Component ======================== */

function ImageZoomModal({ src, alt, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center text-white border-none cursor-pointer z-10 transition-colors"
        type="button"
      >
        <Icon name="close" className="text-2xl" />
      </motion.button>
      <motion.img
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
}

/* ======================== Star Rating Component ======================== */

function StarRating({ rating, size = "sm", interactive = false, onChange }) {
  const [hovered, setHovered] = useState(0);
  const sizeClasses = { xs: "text-sm", sm: "text-lg", md: "text-2xl", lg: "text-3xl" };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type={interactive ? "button" : undefined}
          disabled={!interactive}
          onClick={() => interactive && onChange?.(star)}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          className={`${interactive ? "cursor-pointer" : "cursor-default"} bg-transparent border-none p-0 flex items-center transition-transform ${
            interactive ? "hover:scale-110 active:scale-95" : ""
          }`}
        >
          <Icon
            name="star"
            filled={star <= (hovered || rating)}
            className={`${sizeClasses[size] || sizeClasses.sm} ${
              star <= (hovered || rating) ? "text-amber-400" : "text-slate-200 dark:text-slate-700"
            } transition-colors duration-150`}
          />
        </button>
      ))}
    </div>
  );
}

/* ======================== Review Stats Summary ======================== */

function ReviewStatsSummary({ reviews }) {
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews)
    : 0;

  const distribution = [0, 0, 0, 0, 0];
  reviews.forEach((r) => {
    const idx = Math.min(Math.max(Math.round(r.rating), 1), 5) - 1;
    distribution[idx]++;
  });

  const maxCount = Math.max(...distribution, 1);

  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-6 p-5 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
      {/* Average Score */}
      <div className="flex flex-col items-center justify-center min-w-[140px] text-center">
        <div className="text-5xl font-black text-slate-800 dark:text-slate-100 leading-none">
          {avgRating.toFixed(1)}
        </div>
        <StarRating rating={Math.round(avgRating)} size="md" />
        <div className="text-xs text-slate-500 font-semibold mt-1.5">
          {totalReviews} đánh giá
        </div>
      </div>

      {/* Distribution Bars */}
      <div className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star - 1] || 0;
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-5 text-right font-bold text-slate-600 dark:text-slate-400">{star}</span>
              <Icon name="star" filled className="text-amber-400 text-sm" />
              <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                />
              </div>
              <span className="w-8 text-right font-semibold text-slate-500 dark:text-slate-400">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================== Review Card ======================== */

function ReviewCard({ review }) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount || 0);
  const [voted, setVoted] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const handleHelpful = () => {
    if (!voted) {
      setHelpfulCount((c) => c + 1);
      setVoted(true);
    }
  };

  const initial = (review.username || review.author || "K")?.charAt(0).toUpperCase();
  const avatarColors = [
    "bg-primary", "bg-blue-600", "bg-emerald-600", "bg-violet-600",
    "bg-amber-600", "bg-cyan-600", "bg-rose-600", "bg-teal-600"
  ];
  const avatarColor = avatarColors[(review.id || 0) % avatarColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {review.avatarUrl ? (
            <img
              src={review.avatarUrl}
              alt={review.username}
              className="w-10 h-10 rounded-full object-cover shadow-sm flex-shrink-0 border border-slate-100 dark:border-slate-800"
            />
          ) : (
            <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0`}>
              {initial}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h5 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                {review.username || review.author || "Khách hàng"}
              </h5>
              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-0.5">
                <Icon name="verified" className="text-[10px]" />
                Đã mua
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating rating={review.rating} size="xs" />
              <span className="text-[10px] text-slate-400 font-medium">{timeAgo(review.createdAt || review.date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
        {review.content || review.comment}
      </p>

      {/* Review Images */}
      {review.imageUrls && review.imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {review.imageUrls.map((url, idx) => (
            <button
              key={idx}
              onClick={() => setLightboxImage(url)}
              className="w-20 h-20 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-700 cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all bg-slate-50 dark:bg-slate-800 flex-shrink-0 p-0"
              type="button"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-slate-50 dark:border-slate-800/60">
        <button
          onClick={handleHelpful}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-all bg-transparent border-none cursor-pointer ${
            voted
              ? "text-primary"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          }`}
          type="button"
        >
          <Icon name="thumb_up" filled={voted} className="text-sm" />
          <span>Hữu ích ({helpfulCount})</span>
        </button>
      </div>

      {/* Image Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <ImageZoomModal
            src={lightboxImage}
            alt="Review image"
            onClose={() => setLightboxImage(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ======================== Main Page Component ======================== */

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [activeImage, setActiveImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [reviews, setReviews] = useState([]);
  const [categoryAttributes, setCategoryAttributes] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [zoomModal, setZoomModal] = useState(false);
  const [reviewFilter, setReviewFilter] = useState(0); // 0 = all
  const [reviewSort, setReviewSort] = useState("newest");
  const [quantity, setQuantity] = useState(1);

  const variantAxes = useMemo(
    () => (Array.isArray(categoryAttributes) ? categoryAttributes.filter((attr) => attr?.isVariant) : []),
    [categoryAttributes]
  );

  const variants = useMemo(() => (Array.isArray(product?.variants) ? product.variants : []), [product]);
  const variantGroups = useMemo(() => normalizeVariantOptions(variants, variantAxes), [variants, variantAxes]);
  const selectedVariant = useMemo(() => findMatchingVariant(variants, selectedOptions), [variants, selectedOptions]);
  const basePrice = Number(selectedVariant?.price ?? product?.price ?? 0);
  const oldPrice = Number(product?.oldPrice ?? 0);
  const discount = calculateDiscountPercent(basePrice, oldPrice);
  const gallery = useMemo(() => {
    const images = [selectedVariant?.imageUrl, product?.image, ...(product?.gallery || [])].filter(Boolean);
    return Array.from(new Set(images));
  }, [product, selectedVariant]);
  const isLiked = product ? isInWishlist(product.id) : false;

  // Filtered & sorted reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    if (reviewFilter > 0) {
      result = result.filter((r) => Math.round(r.rating) === reviewFilter);
    }
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.date || 0).getTime();
      const dateB = new Date(b.createdAt || b.date || 0).getTime();
      return reviewSort === "newest" ? dateB - dateA : dateA - dateB;
    });
    return result;
  }, [reviews, reviewFilter, reviewSort]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      productApi.getProduct(productId),
      productApi.listProducts(),
      productApi.getReviews(productId)
    ])
      .then(async ([detail, products, reviewList]) => {
        setProduct(detail);
        setRelated((Array.isArray(products) ? products : []).filter((item) => item.id !== detail.id).slice(0, 8));

        const userIds = new Set();
        (reviewList || []).forEach(r => {
          if (r.userId) userIds.add(r.userId);
        });

        const userMap = {};
        if (userIds.size > 0) {
          await Promise.all(
            Array.from(userIds).map(async (uid) => {
              try {
                const profile = await authApi.getPublicProfile(uid);
                userMap[uid] = {
                  username: profile.fullName || profile.username || "Khách hàng",
                  avatarUrl: profile.avatarUrl || null
                };
              } catch (e) {
                console.warn(`Failed to fetch public profile for user ${uid}`, e);
              }
            })
          );
        }

        const normalizedReviews = (reviewList || []).map((review) => {
          const uInfo = userMap[review.userId];
          return {
            id: review.id,
            username: uInfo?.username || "Khách hàng",
            author: uInfo?.username || "Khách hàng",
            avatarUrl: uInfo?.avatarUrl || null,
            createdAt: review.createdAt,
            date: review.createdAt,
            rating: review.rating || 5,
            content: review.comment || "",
            comment: review.comment || "",
            imageUrls: review.imageUrls || [],
            helpfulCount: 0
          };
        });
        setReviews(normalizedReviews);

        if (detail?.categoryId) {
          try {
            const attrs = await productApi.getCategoryAttributes(detail.categoryId);
            setCategoryAttributes(Array.isArray(attrs) ? attrs : []);
          } catch (attrError) {
            console.warn("Failed to load category attributes", attrError);
            setCategoryAttributes([]);
          }
        } else {
          setCategoryAttributes([]);
        }

        const firstImage = detail?.gallery?.[0] || detail?.image || detail?.imageUrl || selectedVariant?.imageUrl || "";
        setActiveImage(firstImage);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không thể tải sản phẩm."))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    if (!variants.length || variantAxes.length === 0) return;
    const firstVariant = variants.find((v) => v.active !== false) || variants[0];
    setSelectedOptions((current) => {
      if (Object.keys(current).length > 0) return current;
      return buildSelectedOptions(variantAxes, firstVariant);
    });
  }, [variants, variantAxes]);

  useEffect(() => {
    if (selectedVariant?.imageUrl) {
      setActiveImage(selectedVariant.imageUrl);
      return;
    }
    if (!activeImage && gallery.length > 0) {
      setActiveImage(gallery[0]);
    }
  }, [selectedVariant?.id, selectedVariant?.imageUrl, gallery]);

  const handleVariantChange = (axisCode, optionValue) => {
    setSelectedOptions((current) => ({ ...current, [axisCode]: optionValue }));
  };

  const handleBuyNow = async (e) => {
    e.preventDefault();
    if (!product) return;
    const checkoutProduct = { ...product, selectedVariant: selectedVariant || null };
    if (!keycloak.authenticated) {
      sessionStorage.setItem("pending_buy_now", JSON.stringify(checkoutProduct));
      keycloak.login({ redirectUri: window.location.origin + "/checkout" });
      return;
    }
    const success = await addToCart(checkoutProduct, selectedVariant || null);
    if (success) {
      navigate("/checkout");
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    for (let i = 0; i < quantity; i++) {
      await addToCart({ ...product, selectedVariant: selectedVariant || null }, selectedVariant || null);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-500 text-sm mt-4 font-semibold tracking-wide">Đang tải chi tiết sản phẩm...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
          <Icon name="error_outline" className="text-red-500 text-3xl" />
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-5 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors border-none cursor-pointer"
          type="button"
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <Icon name="inventory_2" className="text-slate-400 text-3xl" />
        </div>
        <p className="text-slate-500 text-sm font-semibold">Không tìm thấy sản phẩm.</p>
        <Link to="/" className="mt-4 px-5 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors inline-block">
          Quay về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      {/* ======================== Breadcrumb ======================== */}
      <nav className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
        <Link className="hover:text-primary transition-colors flex items-center gap-0.5" to="/">
          <Icon name="home" className="text-sm" /> Trang chủ
        </Link>
        <Icon name="chevron_right" className="text-sm text-slate-300" />
        <Link className="hover:text-primary transition-colors" to="/category">Sản phẩm</Link>
        <Icon name="chevron_right" className="text-sm text-slate-300" />
        <span className="text-primary font-bold truncate max-w-[200px]">{product.name}</span>
      </nav>

      {/* ======================== Product Hero Section ======================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          {/* ---------- Image Gallery ---------- */}
          <div className="lg:col-span-6 space-y-3">
            {/* Main Image */}
            <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center group">
              <div className="w-full aspect-square md:aspect-[4/3] flex items-center justify-center p-6">
                <img
                  alt={product.name}
                  src={activeImage || gallery[0] || product.image}
                  className="max-h-full max-w-full object-contain cursor-zoom-in transition-transform duration-500 group-hover:scale-110"
                  onClick={() => setZoomModal(true)}
                />
              </div>

              {/* Badges */}
              {product.status && (
                <span className="absolute top-3 left-3 bg-gradient-to-r from-primary to-red-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md">
                  {product.status}
                </span>
              )}
              {discount > 0 && (
                <span className="absolute top-3 right-3 bg-amber-400 text-white font-extrabold text-xs px-2 py-1 rounded-lg shadow-md">
                  -{discount}%
                </span>
              )}
              <button
                onClick={() => toggleWishlist(product)}
                className={`absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700 flex items-center justify-center cursor-pointer transition-all shadow-sm hover:scale-110 ${
                  isLiked ? "text-primary shadow-red-500/20" : "text-slate-400 hover:text-slate-600"
                }`}
                type="button"
              >
                <Icon name="favorite" filled={isLiked} />
              </button>

              {/* Zoom hint */}
              <div className="absolute top-3 right-12 bg-black/40 text-white text-[9px] px-2 py-1 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Icon name="zoom_in" className="text-[11px]" />
                Phóng to
              </div>
            </div>

            {/* Thumbnails */}
            <div className="flex gap-2.5 overflow-x-auto py-1 hide-scrollbar">
              {gallery.map((image, idx) => (
                <button
                  key={`${image}-${idx}`}
                  onClick={() => setActiveImage(image)}
                  className={`w-[68px] h-[68px] shrink-0 rounded-xl border-2 overflow-hidden bg-slate-50 dark:bg-slate-950 flex items-center justify-center cursor-pointer transition-all ${
                    image === activeImage
                      ? "border-primary shadow-md shadow-primary/20"
                      : "border-transparent hover:border-slate-200 dark:hover:border-slate-700 opacity-70 hover:opacity-100"
                  }`}
                  type="button"
                >
                  <img alt="" src={image} className="max-h-full max-w-full object-contain p-1" />
                </button>
              ))}
            </div>
          </div>

          {/* ---------- Product Info ---------- */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              {/* Title & Rating */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {product.brand && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {product.brand}
                    </span>
                  )}
                  {product.active !== false && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded flex items-center gap-0.5">
                      <Icon name="check_circle" className="text-[10px]" />
                      Còn hàng
                    </span>
                  )}
                </div>
                <h1 className="text-xl md:text-2xl font-black text-slate-850 dark:text-slate-100 tracking-tight leading-snug">
                  {product.name}
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <StarRating rating={Math.round(product.rating || 0)} size="xs" />
                    <span className="text-sm font-bold text-amber-500 ml-1">{product.rating || "0"}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    ({reviews.length} đánh giá)
                  </span>
                  {typeof product.salesCount === "number" && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="text-[11px] text-slate-500 font-medium">Đã bán {product.salesCount}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4 rounded-xl border border-red-100 dark:border-red-900/30">
                <div className="flex items-end gap-3">
                  <div>
                    <span className="text-3xl md:text-4xl font-black text-primary leading-none">
                      {formatVnd(basePrice)}
                    </span>
                    {oldPrice > basePrice && (
                      <span className="text-sm text-slate-400 line-through ml-3 font-medium">
                        {formatVnd(oldPrice)}
                      </span>
                    )}
                  </div>
                  {discount > 0 && (
                    <span className="bg-primary/10 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded mb-1">
                      Tiết kiệm {discount}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 font-medium">
                  <span className="flex items-center gap-0.5">
                    <Icon name="check_circle" className="text-success-green text-xs" />
                    Giá đã bao gồm VAT
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="local_shipping" className="text-primary text-xs" />
                    Miễn phí vận chuyển
                  </span>
                </div>
              </div>

              {/* Variants */}
              {variantGroups.length > 0 && (
                <div className="space-y-3.5">
                  {variantGroups.map((group) => (
                    <div key={group.axisCode} className="space-y-2">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        {group.axisLabel}: <span className="text-slate-800 dark:text-slate-200">{selectedOptions[group.axisCode] || "Chọn"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map((option) => {
                          const active = String(selectedOptions[group.axisCode] || "") === String(option);
                          return (
                            <button
                              key={`${group.axisCode}-${option}`}
                              onClick={() => handleVariantChange(group.axisCode, option)}
                              className={`min-w-[80px] rounded-lg border-2 px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                                active
                                  ? "border-primary bg-primary text-white shadow-md shadow-primary/30 -translate-y-0.5"
                                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-primary/50 hover:bg-primary/5"
                              }`}
                              type="button"
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity Selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Số lượng:</span>
                <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-none cursor-pointer text-slate-600 dark:text-slate-300 font-bold"
                    type="button"
                    disabled={quantity <= 1}
                  >
                    <Icon name="remove" className="text-sm" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 h-9 text-center text-sm font-bold border-x border-slate-200 dark:border-slate-700 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-none cursor-pointer text-slate-600 dark:text-slate-300 font-bold"
                    type="button"
                    disabled={quantity >= 99}
                  >
                    <Icon name="add" className="text-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleBuyNow}
                className="py-3.5 bg-gradient-to-r from-primary to-red-600 text-white font-black text-sm uppercase rounded-xl hover:from-red-700 hover:to-red-800 transition-all shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:-translate-y-0.5 flex flex-col items-center justify-center leading-none cursor-pointer border-none"
                type="button"
              >
                <span className="flex items-center gap-1.5">
                  <Icon name="flash_on" className="text-lg" />
                  MUA NGAY
                </span>
                <span className="text-[9px] font-normal tracking-wide text-white/80 mt-0.5">Giao hàng nhanh trong 2h</span>
              </button>
              <button
                onClick={handleAddToCart}
                className="py-3.5 border-2 border-primary text-primary hover:bg-primary hover:text-white dark:hover:bg-primary font-black text-sm uppercase rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer group"
                type="button"
              >
                <Icon name="add_shopping_cart" className="text-lg group-hover:scale-110 transition-transform" />
                Thêm vào giỏ
              </button>
            </div>

            {/* Extra info chips */}
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
              <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <Icon name="verified" className="text-success-green text-xs" />
                Chính hãng 100%
              </span>
              <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <Icon name="swap_horiz" className="text-primary text-xs" />
                Đổi trả 30 ngày
              </span>
              <span className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <Icon name="shield" className="text-primary text-xs" />
                Bảo hành 12 tháng
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ======================== Tabs Section ======================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 pb-px gap-1 overflow-x-auto hide-scrollbar">
          {[
            { id: "details", label: "Mô tả sản phẩm", icon: "description" },
            { id: "specs", label: "Thông số kỹ thuật", icon: "settings" },
            { id: "comments", label: `Đánh giá (${reviews.length})`, icon: "chat" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 font-bold text-xs uppercase tracking-wider relative cursor-pointer border-none bg-transparent transition-all whitespace-nowrap rounded-t-lg ${
                activeTab === tab.id
                  ? "text-primary bg-red-50/50 dark:bg-red-950/20"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
              type="button"
            >
              <Icon name={tab.icon} className="text-sm" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* ---------- Tab: Details ---------- */}
        {activeTab === "details" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="pt-5"
          >
            <article className="prose prose-sm max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-4">
                Chi tiết sản phẩm {product.name}
              </h2>
              <div className="whitespace-pre-wrap text-sm">
                {product.description || "Chưa có mô tả từ hệ thống."}
              </div>
            </article>
          </motion.div>
        )}

        {/* ---------- Tab: Specifications ---------- */}
        {activeTab === "specs" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="pt-5"
          >
            <div className="max-w-2xl">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-4">
                Thông số kỹ thuật
              </h2>
              {Object.entries(product.attributes || {}).length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  {Object.entries(product.attributes).map(([key, value], idx) => (
                    <div
                      key={key}
                      className={`flex items-center justify-between px-4 py-3 text-sm ${
                        idx % 2 === 0 ? "bg-slate-50/50 dark:bg-slate-950/30" : "bg-white dark:bg-slate-900"
                      }`}
                    >
                      <span className="text-slate-500 font-medium">{humanizeLabel(key)}</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold text-right ml-4">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-10 text-center">
                  <Icon name="settings" className="text-slate-300 text-3xl mb-3" />
                  <p className="text-slate-500 text-sm font-medium">Chưa có thông số kỹ thuật từ hệ thống.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ---------- Tab: Reviews ---------- */}
        {activeTab === "comments" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="pt-5 space-y-6"
          >
            {/* Review Summary */}
            {reviews.length > 0 && <ReviewStatsSummary reviews={reviews} />}

            {keycloak.authenticated && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon name="info" className="text-primary text-lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Muốn đánh giá sản phẩm này?
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sau khi nhận hàng, vào Tài khoản → Đánh giá sản phẩm để chia sẻ trải nghiệm.
                  </p>
                </div>
                <Link
                  to="/profile?tab=reviews"
                  className="shrink-0 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Đánh giá
                </Link>
              </div>
            )}

            {/* Filter & Sort */}
            {reviews.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                  {[
                    { label: "Tất cả", value: 0 },
                    { label: "5 Sao", value: 5 },
                    { label: "4 Sao", value: 4 },
                    { label: "3 Sao", value: 3 },
                    { label: "2 Sao", value: 2 },
                    { label: "1 Sao", value: 1 },
                  ].map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setReviewFilter(f.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                        reviewFilter === f.value
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-primary dark:hover:text-slate-300"
                      }`}
                      type="button"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <select
                  value={reviewSort}
                  onChange={(e) => setReviewSort(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-transparent text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                </select>
              </div>
            )}

            {/* Review Cards */}
            {filteredReviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredReviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-14 text-center">
                <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-800">
                  <Icon name="rate_review" className="text-slate-300 text-3xl" />
                </div>
                <h3 className="text-base font-black text-slate-700 dark:text-slate-300 mb-1">
                  {reviewFilter > 0 ? "Không có đánh giá phù hợp" : "Chưa có đánh giá nào"}
                </h3>
                <p className="text-sm text-slate-400 font-medium mb-4">
                  {reviewFilter > 0
                    ? `Chưa có đánh giá ${reviewFilter} sao cho sản phẩm này.`
                    : "Sản phẩm chưa có đánh giá từ khách hàng."}
                </p>
                {reviewFilter > 0 && (
                  <button
                    onClick={() => setReviewFilter(0)}
                    className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors border-none cursor-pointer"
                    type="button"
                  >
                    Xem tất cả đánh giá
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </section>

      {/* ======================== Related Products ======================== */}
      {related.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight flex items-center gap-2">
              <Icon name="view_carousel" className="text-primary" />
              Sản phẩm liên quan
            </h2>
            <Link to="/category" className="text-xs text-primary font-bold hover:underline flex items-center gap-0.5">
              Xem tất cả
              <Icon name="chevron_right" className="text-sm" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {related.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <ProductCard product={item} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ======================== Image Zoom Modal ======================== */}
      <AnimatePresence>
        {zoomModal && (
          <ImageZoomModal
            src={activeImage || gallery[0] || product.image}
            alt={product.name}
            onClose={() => setZoomModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
