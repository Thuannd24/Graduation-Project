import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { orderApi } from "../../../services/orderApi";
import { productApi } from "../../../services/productApi";
import ProductReviewForm from "./ProductReviewForm.jsx";

const REVIEWABLE_STATUSES = ["SHIPPED", "DELIVERED", "COMPLETED"];

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "short",
      day: "numeric"
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

export default function ProductReviewsTab() {
  const [orders, setOrders] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  const [subTab, setSubTab] = useState("pending");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [orderList, reviewList] = await Promise.all([
        orderApi.listOrders(),
        productApi.getMyReviews().catch(() => [])
      ]);
      const ordersData = Array.isArray(orderList) ? orderList : [];
      const reviewsData = Array.isArray(reviewList) ? reviewList : [];

      const productIds = new Set();
      ordersData.forEach(order => {
        (order.items || []).forEach(item => {
          if (item.productId && !item.productImage) {
            productIds.add(item.productId);
          }
        });
      });
      reviewsData.forEach(review => {
        if (review.productId) {
          productIds.add(review.productId);
        }
      });

      const productMap = {};
      if (productIds.size > 0) {
        await Promise.all(
          Array.from(productIds).map(async (prodId) => {
            try {
              const prod = await productApi.getProductDetail(prodId);
              productMap[prodId] = {
                name: prod.name,
                image: prod.imageUrl || prod.image || prod.thumbnailUrl
              };
            } catch (e) {
              console.warn(`Failed to fetch product details for ${prodId}`, e);
            }
          })
        );
      }

      const updatedOrders = ordersData.map(order => {
        if (!order.items) return order;
        const updatedItems = order.items.map(item => {
          if (item.productImage) return item;
          return {
            ...item,
            productImage: productMap[item.productId]?.image || null
          };
        });
        return { ...order, items: updatedItems };
      });

      const updatedReviews = reviewsData.map(review => {
        const prodInfo = productMap[review.productId];
        return {
          ...review,
          productName: prodInfo?.name || `Sản phẩm #${review.productId}`,
          productImage: prodInfo?.image || null
        };
      });

      setOrders(updatedOrders);
      setMyReviews(updatedReviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu đánh giá.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const reviewedKeys = useMemo(
    () => new Set(myReviews.map((r) => `${r.orderId}-${r.productId}`)),
    [myReviews]
  );

  const pendingItems = useMemo(() => {
    const items = [];
    for (const order of orders) {
      const status = String(order.status || "").toUpperCase();
      if (!REVIEWABLE_STATUSES.includes(status)) continue;

      for (const orderItem of order.items || []) {
        const productId = orderItem.productId;
        if (!productId) continue;
        const key = `${order.id}-${productId}`;
        if (reviewedKeys.has(key)) continue;

        items.push({
          key,
          orderId: order.id,
          productId,
          productName: orderItem.productName || `Sản phẩm #${productId}`,
          productImage: orderItem.productImage || orderItem.imageUrl || orderItem.thumbnailUrl,
          orderDate: order.createdAt,
          orderStatus: order.status
        });
      }
    }
    return items.sort((a, b) => new Date(b.orderDate || 0) - new Date(a.orderDate || 0));
  }, [orders, reviewedKeys]);

  const handleReviewSubmitted = async () => {
    setActiveItem(null);
    await loadData();
    setSubTab("reviewed");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center py-16">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-secondary text-xs mt-3 font-semibold">Đang tải sản phẩm cần đánh giá...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-primary font-semibold text-sm">{error}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-3 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg border-none cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-md">
      <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md border border-surface-container-highest">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container-highest pb-md mb-md">
          <div>
            <h3 className="font-bold text-headline-md text-on-surface flex items-center gap-2">
              <Icon name="rate_review" className="text-primary text-[24px]" />
              Đánh giá sản phẩm đã mua
            </h3>
            <p className="text-xs text-secondary mt-1">
              Chỉ đánh giá được sau khi đơn hàng đang giao hoặc đã giao thành công.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSubTab("pending"); setActiveItem(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                subTab === "pending"
                  ? "bg-primary text-white border-primary"
                  : "bg-transparent text-on-surface border-surface-container-highest hover:border-primary/40"
              }`}
            >
              Chờ đánh giá ({pendingItems.length})
            </button>
            <button
              type="button"
              onClick={() => { setSubTab("reviewed"); setActiveItem(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                subTab === "reviewed"
                  ? "bg-primary text-white border-primary"
                  : "bg-transparent text-on-surface border-surface-container-highest hover:border-primary/40"
              }`}
            >
              Đã đánh giá ({myReviews.length})
            </button>
          </div>
        </div>

        {activeItem ? (
          <ProductReviewForm
            item={activeItem}
            onSubmitted={handleReviewSubmitted}
            onCancel={() => setActiveItem(null)}
          />
        ) : subTab === "pending" ? (
          pendingItems.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-surface-container-low flex items-center justify-center">
                <Icon name="check_circle" className="text-emerald-500 text-4xl" />
              </div>
              <h4 className="font-bold text-on-surface">Bạn đã đánh giá hết sản phẩm!</h4>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                Khi có đơn hàng mới được giao, sản phẩm sẽ xuất hiện tại đây để bạn chia sẻ trải nghiệm.
              </p>
              <Link
                to="/"
                className="inline-block bg-primary text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm"
              >
                TIẾP TỤC MUA SẮM
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingItems.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 p-3 rounded-xl border border-surface-container-highest bg-surface-container-low hover:border-primary/30 transition-colors"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-container-high shrink-0 border border-surface-container-highest">
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="inventory_2" className="text-secondary text-2xl" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm text-on-surface truncate">{item.productName}</h4>
                    <p className="text-[11px] text-secondary mt-0.5">Đơn #{item.orderId} · {formatDate(item.orderDate)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(item)}
                    className="shrink-0 px-3 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg border-none cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    Đánh giá
                  </button>
                </div>
              ))}
            </div>
          )
        ) : myReviews.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Icon name="rate_review" className="text-[48px] text-secondary opacity-40" />
            <h4 className="font-bold text-on-surface">Chưa có đánh giá nào</h4>
            <p className="text-xs text-secondary">Đánh giá sản phẩm sau khi nhận hàng để giúp người mua khác.</p>
            {pendingItems.length > 0 && (
              <button
                type="button"
                onClick={() => setSubTab("pending")}
                className="inline-block bg-primary text-on-primary font-bold px-lg py-2 rounded-lg text-xs border-none cursor-pointer"
              >
                ĐÁNH GIÁ NGAY ({pendingItems.length})
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {myReviews.map((review) => (
              <div
                key={review.id}
                className="p-4 rounded-xl border border-surface-container-highest bg-surface-container-low"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-high shrink-0 border border-surface-container-highest">
                      {review.productImage ? (
                        <img src={review.productImage} alt={review.productName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="inventory_2" className="text-secondary text-xl" />
                        </div>
                      )}
                    </div>
                    <div>
                      <Link
                        to={`/product/${review.productId}`}
                        className="font-bold text-sm text-primary hover:underline block max-w-[280px] sm:max-w-md truncate"
                      >
                        {review.productName}
                      </Link>
                      <p className="text-[11px] text-secondary mt-0.5">
                        Đơn #{review.orderId} · {formatDate(review.createdAt)}
                      </p>
                    </div>
                  </div>
                  <StarDisplay rating={review.rating || 5} />
                </div>
                <p className="text-sm text-on-surface mt-3 leading-relaxed">{review.comment}</p>
                {Array.isArray(review.imageUrls) && review.imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {review.imageUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Ảnh đánh giá"
                        className="w-14 h-14 rounded-lg object-cover border border-surface-container-highest"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
