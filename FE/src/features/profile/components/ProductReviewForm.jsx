import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";

function StarRating({ rating, size = "md", interactive = false, onChange }) {
  const [hovered, setHovered] = useState(0);
  const sizeClasses = { sm: "text-lg", md: "text-2xl", lg: "text-3xl" };

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
            className={`${sizeClasses[size] || sizeClasses.md} ${
              star <= (hovered || rating) ? "text-amber-400" : "text-slate-200 dark:text-slate-700"
            } transition-colors duration-150`}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewImageUpload({ images, onImagesChange }) {
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages = [...images];
    for (const file of files) {
      if (newImages.length >= 5) break;
      try {
        const url = await productApi.uploadReviewImage(file);
        newImages.push(url);
      } catch (err) {
        console.error("Upload image failed:", err);
      }
    }
    onImagesChange(newImages);
    e.target.value = "";
  };

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url, idx) => (
        <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <img src={url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onImagesChange(images.filter((_, i) => i !== idx))}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center border-none cursor-pointer"
          >
            <Icon name="close" className="text-xs" />
          </button>
        </div>
      ))}
      {images.length < 5 && (
        <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
          <Icon name="add_photo_alternate" className="text-slate-400 text-xl" />
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        </label>
      )}
    </div>
  );
}

export default function ProductReviewForm({ item, onSubmitted, onCancel }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError("Vui lòng nhập nội dung đánh giá.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await productApi.createReview({
        productId: Number(item.productId),
        orderId: Number(item.orderId),
        rating,
        comment: comment.trim(),
        imageUrls: images.length > 0 ? images : undefined
      });
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi đánh giá thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 rounded-xl border border-primary/20 shadow-sm overflow-hidden"
    >
      <div className="px-4 sm:px-5 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700">
          {item.productImage ? (
            <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon name="inventory_2" className="text-slate-300 text-2xl" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{item.productName}</h4>
          <p className="text-xs text-slate-500 mt-0.5">Đơn hàng #{item.orderId}</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center border-none cursor-pointer bg-transparent"
          >
            <Icon name="close" className="text-slate-400" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-4 sm:px-5 py-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
            Chất lượng sản phẩm
          </label>
          <StarRating rating={rating} size="md" interactive onChange={setRating} />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
            Nội dung đánh giá <span className="text-primary">*</span>
          </label>
          <textarea
            placeholder="Sản phẩm này thế nào? Chất lượng có tốt không? Bạn có hài lòng không?"
            value={comment}
            onChange={(e) => { setComment(e.target.value); setError(""); }}
            rows={4}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none placeholder:text-slate-400"
            maxLength={1000}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-red-500 font-medium">{error}</span>
            <span className="text-[11px] text-slate-400">{comment.length}/1000</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
            Thêm hình ảnh (tùy chọn)
          </label>
          <ReviewImageUpload images={images} onImagesChange={setImages} />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-primary text-white font-extrabold text-sm rounded-lg hover:bg-red-700 transition-all shadow-md shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <Icon name="send" className="text-sm" />
                Gửi đánh giá
              </>
            )}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-transparent border-none cursor-pointer transition-colors"
            >
              Hủy
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
}
