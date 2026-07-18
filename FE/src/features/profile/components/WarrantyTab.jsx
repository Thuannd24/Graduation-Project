import { useState, useEffect } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { shopApi } from "../../../services/shopApi";

export default function WarrantyTab() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWarranty = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await shopApi.getMyWarranty();
      setResults(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tra cứu bảo hành. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarranty();
  }, []);

  const parseVariantAttr = (attr) => {
    if (!attr) return null;
    if (typeof attr === "object") return attr;
    try {
      return JSON.parse(attr);
    } catch (e) {
      return null;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const date = new Date(dateStr);
      return date.toLocaleDateString("vi-VN");
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md border border-surface-container-highest space-y-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container-highest pb-md">
        <div>
          <h3 className="font-bold text-headline-md text-on-surface flex items-center gap-2">
            <Icon name="verified_user" className="text-primary text-[24px]" />
            Tra cứu thời hạn bảo hành
          </h3>
          <p className="text-xs text-secondary mt-1">
            Kiểm tra thông tin chi tiết và thời gian bảo hành còn lại cho các thiết bị đã mua tại AuraTech.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/20 text-primary rounded-md border border-red-100 dark:border-red-950/30 text-xs">
          <Icon name="error_outline" className="text-lg shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
          <button
            type="button"
            onClick={loadWarranty}
            className="ml-auto shrink-0 font-bold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-surface-container-lowest rounded-xl p-md border border-surface-container-highest animate-pulse flex flex-col md:flex-row gap-4">
              <div className="w-full md:w-24 h-24 bg-surface-container-high rounded-lg shrink-0"></div>
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-surface-container-high rounded w-2/3"></div>
                <div className="h-3 bg-surface-container-high rounded w-1/3"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-8 bg-surface-container-high/60 rounded"></div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results presentation */}
      {!loading && results && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
            <h4 className="text-sm font-bold text-on-surface">
              Tìm thấy {results.length} sản phẩm tương ứng
            </h4>
          </div>

          {results.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl p-8 text-center border border-surface-container-highest space-y-3">
              <div className="w-12 h-12 bg-surface-container-low text-secondary rounded-full flex items-center justify-center mx-auto">
                <Icon name="search_off" className="text-2xl" />
              </div>
              <div className="space-y-1">
                <h5 className="text-sm font-bold text-on-surface">Không tìm thấy dữ liệu bảo hành</h5>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  Bạn chưa có sản phẩm nào được giao thành công trên hệ thống.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((item, idx) => {
                const attrs = parseVariantAttr(item.variantAttr);
                return (
                  <div 
                    key={idx} 
                    className="bg-surface-container-lowest rounded-xl p-md border border-surface-container-highest shadow-sm hover:shadow transition-all duration-350 flex flex-col md:flex-row gap-4 relative overflow-hidden"
                  >
                    {/* Image */}
                    <div className="w-full md:w-24 h-24 bg-surface-container-low rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-surface-container-highest">
                      {item.productImage ? (
                        <img 
                          src={item.productImage} 
                          alt={item.productName} 
                          className="object-contain w-full h-full p-1"
                          onError={(e) => {
                            e.target.src = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300";
                          }}
                        />
                      ) : (
                        <Icon name="image" className="text-2xl text-secondary" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <h5 className="text-sm sm:text-base font-bold text-on-surface leading-snug">
                            {item.productName}
                          </h5>
                          {/* Variant attributes tags */}
                          {attrs && Object.keys(attrs).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(attrs).map(([key, val]) => (
                                <span key={key} className="inline-flex px-2 py-0.5 bg-surface-container-low text-secondary text-[10px] rounded font-semibold capitalize">
                                  {key}: {val}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {item.active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-250/30 text-[10px] font-bold rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Còn bảo hành
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 dark:bg-red-950/20 text-primary border border-red-200/30 text-[10px] font-bold rounded-full">
                              Hết bảo hành
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-2.5 bg-surface-container-low rounded-lg text-xs border border-surface-container-highest">
                        <div>
                          <span className="block text-[10px] font-bold text-secondary uppercase tracking-wider">Ngày mua hàng</span>
                          <span className="font-bold text-on-surface mt-0.5 block">{formatDate(item.purchaseDate)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-secondary uppercase tracking-wider">Thời hạn</span>
                          <span className="font-bold text-on-surface mt-0.5 block">{item.warrantyMonths} tháng</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-secondary uppercase tracking-wider">Hạn bảo hành</span>
                          <span className="font-bold text-on-surface mt-0.5 block">{formatDate(item.warrantyExpiry)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-secondary uppercase tracking-wider">Trạng thái hạn</span>
                          <span className={`font-bold mt-0.5 block ${item.active ? "text-emerald-600" : "text-primary"}`}>
                            {item.active ? `Còn ${item.daysRemaining} ngày` : `Hết hạn ${Math.abs(item.daysRemaining)} ngày`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-secondary pt-0.5">
                        <span>Mã đơn hàng: <span className="font-mono font-semibold text-on-surface">#OD-{item.orderId}</span></span>
                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <Icon name="check_circle" className="text-xs" /> Sản phẩm chính hãng
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
