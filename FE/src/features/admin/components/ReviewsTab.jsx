import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi.ts";
import { authApi } from "../../../services/authApi.ts";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

function StarDisplay({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          filled={star <= rating}
          className={`text-sm ${star <= rating ? "text-amber-400" : "text-slate-200"}`}
        />
      ))}
    </div>
  );
}

function ReviewImages({ imageUrls, onSelect }) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {imageUrls.map((url, idx) => (
        <button
          key={url || idx}
          type="button"
          onClick={() => onSelect(url)}
          className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-emerald-500/40 transition-all shrink-0 p-0"
        >
          <img src={url} alt="Ảnh đánh giá" className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [replyingReview, setReplyingReview] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Xem nhanh chi tiết sản phẩm + toàn bộ đánh giá của sản phẩm đó, ngay trong trang quản trị
  // (không điều hướng ra trang cửa hàng, vì admin/staff bị chặn xem storefront ở main.jsx)
  const [viewingProduct, setViewingProduct] = useState(null);
  const [productReviews, setProductReviews] = useState([]);
  const [loadingProductView, setLoadingProductView] = useState(false);

  const [lightboxImage, setLightboxImage] = useState(null);

  const fetchReviews = async (page = 0) => {
    try {
      setLoading(true);
      setLoadError("");
      const data = await productApi.getAdminReviews(page, pageSize);
      setReviews(Array.isArray(data?.content) ? data.content : []);
      setTotalPages(data?.totalPages || 1);
      setCurrentPage(data?.number ?? page);
    } catch (err) {
      console.error("Failed to load reviews:", err);
      setReviews([]);
      setLoadError(err.message || "Không thể tải danh sách đánh giá.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews(0);
    productApi.listAllProducts().then(setProducts).catch(() => setProducts([]));
    authApi.adminSearchUsers({ page: 0, size: 1000 })
      .then(res => setCustomers(res?.content || []))
      .catch(() => setCustomers([]));
  }, []);

  const productById = useMemo(() => {
    const map = new Map();
    products.forEach(p => { if (p && p.id != null) map.set(String(p.id), p); });
    return map;
  }, [products]);

  const customerByKeycloakId = useMemo(() => {
    const map = new Map();
    customers.forEach(c => { if (c && c.keycloakUserId) map.set(c.keycloakUserId, c); });
    return map;
  }, [customers]);

  const openReplyModal = (review) => {
    setReplyingReview(review);
    setReplyContent("");
  };

  const handleSubmitReply = async (e) => {
    e.preventDefault();
    if (!replyingReview || !replyContent.trim()) return;
    try {
      setSubmittingReply(true);
      const savedContent = replyContent.trim();
      await productApi.replyToReview(replyingReview.id, savedContent);
      alert("Đã gửi phản hồi thành công!");
      setReplyingReview(null);
      setReplyContent("");
      fetchReviews(currentPage);
      setProductReviews(prev => prev.map(r =>
        r.id === replyingReview.id ? { ...r, staffReplyContent: savedContent, staffReplyAt: new Date().toISOString() } : r
      ));
    } catch (err) {
      alert("Lỗi khi gửi phản hồi: " + err.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  const openProductView = async (product, productId) => {
    setViewingProduct(product || { id: productId, name: `Sản phẩm #${productId}` });
    setLoadingProductView(true);
    try {
      const list = await productApi.getReviews(productId);
      setProductReviews(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Failed to load product reviews:", err);
      setProductReviews([]);
    } finally {
      setLoadingProductView(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-400">Đang tải danh sách đánh giá...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800">Quản Lý Đánh Giá Sản Phẩm</h4>
          <span className="text-[10px] text-slate-400 font-medium">Xem và phản hồi đánh giá của khách hàng (mỗi đánh giá chỉ phản hồi được 1 lần)</span>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
          Lỗi tải danh sách đánh giá: {loadError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50/70 text-slate-400 border-b border-slate-100">
                <th className="p-4 font-bold text-[10px] uppercase w-[18%]">Sản phẩm</th>
                <th className="p-4 font-bold text-[10px] uppercase w-[14%]">Khách hàng</th>
                <th className="p-4 font-bold text-[10px] uppercase w-[9%]">Đánh giá</th>
                <th className="p-4 font-bold text-[10px] uppercase w-[38%]">Nội dung</th>
                <th className="p-4 font-bold text-[10px] uppercase w-[13%]">Thời gian</th>
                <th className="p-4 font-bold text-[10px] uppercase w-[8%] text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviews.map((review) => {
                const product = productById.get(String(review.productId));
                const customer = customerByKeycloakId.get(review.userId);
                return (
                <tr key={review.id} className="hover:bg-slate-50/30 transition-colors align-top">
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => openProductView(product, review.productId)}
                      title="Xem chi tiết sản phẩm & tất cả đánh giá của sản phẩm này"
                      className="flex items-center gap-2.5 group/product text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        {product?.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-contain rounded" />
                        ) : (
                          <Icon name="inventory_2" className="text-slate-300 text-base" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-slate-700 group-hover/product:text-emerald-700 group-hover/product:underline block max-w-[160px] truncate">
                          {product?.name || `Sản phẩm #${review.productId}`}
                        </span>
                        <span className="text-[9px] text-slate-400 font-semibold">#{review.productId}</span>
                      </div>
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {customer?.avatarUrl ? (
                          <img src={customer.avatarUrl} alt={customer.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <Icon name="person" className="text-slate-400 text-sm" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-700 block max-w-[130px] truncate">{customer?.fullName || customer?.username || "Khách hàng"}</span>
                        {customer?.email && (
                          <span className="text-[9px] text-slate-400 font-semibold block max-w-[130px] truncate">{customer.email}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4"><StarDisplay rating={review.rating || 0} /></td>
                  <td className="p-4 text-slate-600">
                    <p className="line-clamp-2">{review.comment}</p>
                    <ReviewImages imageUrls={review.imageUrls} onSelect={setLightboxImage} />
                    {review.staffReplyContent && (
                      <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                        <span className="text-[10px] font-bold text-emerald-700 block mb-0.5">Đã phản hồi:</span>
                        <span className="text-slate-600">{review.staffReplyContent}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-slate-500 font-semibold">{formatDate(review.createdAt)}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => openReplyModal(review)}
                      disabled={!!review.staffReplyContent}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold transition-all"
                    >
                      {review.staffReplyContent ? "Đã trả lời" : "Trả lời"}
                    </button>
                  </td>
                </tr>
                );
              })}
              {reviews.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">
                    Chưa có đánh giá nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <button
            onClick={() => fetchReviews(Math.max(currentPage - 1, 0))}
            disabled={currentPage === 0}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            ← Trước
          </button>
          <span className="text-xs font-bold text-slate-500">
            Trang {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => fetchReviews(Math.min(currentPage + 1, totalPages - 1))}
            disabled={currentPage >= totalPages - 1}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Sau →
          </button>
        </div>
      </div>

      {replyingReview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <span className="font-extrabold text-sm text-slate-800">Phản Hồi Đánh Giá</span>
              <button
                onClick={() => setReplyingReview(null)}
                className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmitReply} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-slate-700">
                    {productById.get(String(replyingReview.productId))?.name || `Sản phẩm #${replyingReview.productId}`}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {customerByKeycloakId.get(replyingReview.userId)?.fullName || "Khách hàng"}
                  </span>
                </div>
                <StarDisplay rating={replyingReview.rating || 0} />
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">{replyingReview.comment}</p>
                <ReviewImages imageUrls={replyingReview.imageUrls} onSelect={setLightboxImage} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Nội dung phản hồi *</label>
                <textarea
                  required
                  rows={4}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Cảm ơn quý khách đã đánh giá..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-800 transition-all outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReplyingReview(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-extrabold text-slate-500 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingReply}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                >
                  {submittingReply ? "Đang gửi..." : "Gửi phản hồi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                  {viewingProduct.image ? (
                    <img src={viewingProduct.image} alt={viewingProduct.name} className="w-full h-full object-contain rounded" />
                  ) : (
                    <Icon name="inventory_2" className="text-slate-300 text-xl" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-extrabold text-sm text-slate-800 block truncate">{viewingProduct.name}</span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    #{viewingProduct.id}{viewingProduct.price ? ` · ${viewingProduct.price.toLocaleString("vi-VN")}đ` : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setViewingProduct(null); setProductReviews([]); }}
                className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 shrink-0"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                Tất cả đánh giá của sản phẩm này ({productReviews.length})
              </span>

              {loadingProductView ? (
                <div className="py-8 text-center text-xs text-slate-400">Đang tải đánh giá...</div>
              ) : productReviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Sản phẩm này chưa có đánh giá nào.</div>
              ) : (
                productReviews.map((review) => {
                  const customer = customerByKeycloakId.get(review.userId);
                  return (
                    <div key={review.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">{customer?.fullName || customer?.username || "Khách hàng"}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{formatDate(review.createdAt)}</span>
                      </div>
                      <StarDisplay rating={review.rating || 0} />
                      <p className="text-xs text-slate-600 leading-relaxed">{review.comment}</p>
                      <ReviewImages imageUrls={review.imageUrls} onSelect={setLightboxImage} />
                      {review.staffReplyContent ? (
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                          <span className="text-[10px] font-bold text-emerald-700 block mb-0.5">Đã phản hồi:</span>
                          <span className="text-xs text-slate-600">{review.staffReplyContent}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => openReplyModal(review)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all"
                        >
                          Trả lời
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <div
          className="fixed inset-0 bg-slate-900/80 z-[70] flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            <Icon name="close" className="text-2xl" />
          </button>
          <img
            src={lightboxImage}
            alt="Ảnh đánh giá"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
