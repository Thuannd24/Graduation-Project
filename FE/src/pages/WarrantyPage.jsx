import { useState } from "react";
import Icon from "../components/common/Icon.jsx";
import { shopApi } from "../services/shopApi";

export default function WarrantyPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!phoneNumber.trim()) return;

    setLoading(true);
    setError("");
    setResults(null);
    setSearched(true);

    try {
      const data = await shopApi.checkWarranty(phoneNumber.trim());
      setResults(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tra cứu bảo hành. Vui lòng kiểm tra lại kết nối.");
    } finally {
      setLoading(false);
    }
  };

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* Elegant Header with Gradient Background */}
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-8 sm:p-12 shadow-xl shadow-emerald-900/10">
          <div className="absolute right-0 top-0 -mt-6 -mr-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute left-0 bottom-0 -mb-6 -ml-6 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center md:justify-between gap-6">
            <div className="space-y-3 text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-semibold uppercase tracking-wider">
                <Icon name="security" className="text-sm" /> Dịch vụ chính hãng
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Tra cứu thời hạn bảo hành</h1>
              <p className="text-emerald-100 max-w-xl text-sm sm:text-base font-light">
                Kiểm tra thông tin chi tiết và thời gian bảo hành còn lại cho tất cả các thiết bị đã mua tại hệ thống AuraTech.
              </p>
            </div>
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
              <Icon className="text-6xl text-emerald-100" name="verified_user" />
            </div>
          </div>
        </div>

        {/* Premium Search Form */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-md border border-slate-100 dark:border-slate-700/50 transition-colors">
          <form className="space-y-4" onSubmit={handleSearch}>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Nhập số điện thoại mua hàng
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Icon name="phone" className="text-xl" />
                </div>
                <input
                  type="tel"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Ví dụ: 0909123456"
                  required
                  className="block w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-500/10 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-semibold outline-none transition-all"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Lưu ý: Hệ thống chỉ hiển thị lịch sử bảo hành cho các đơn hàng đã được giao thành công (Delivered).
              </p>
            </div>
            
            {error && (
              <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-950/30 text-sm">
                <Icon name="error_outline" className="text-xl shrink-0 mt-0.5" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang kiểm tra dữ liệu...</span>
                </>
              ) : (
                <>
                  <Icon name="search" className="text-xl" />
                  <span>Kiểm tra bảo hành</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results Presentation */}
        {loading && (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 animate-pulse flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-32 h-32 bg-slate-200 dark:bg-slate-700 rounded-xl shrink-0"></div>
                <div className="flex-1 space-y-4 py-2">
                  <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="h-8 bg-slate-100 dark:bg-slate-700/50 rounded-lg"></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {searched && !loading && results && (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                Tìm thấy {results.length} sản phẩm tương ứng
              </h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Số điện thoại: <span className="font-semibold text-slate-700 dark:text-slate-300">{phoneNumber}</span>
              </span>
            </div>

            {results.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center border border-slate-100 dark:border-slate-700/50 space-y-4">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center mx-auto">
                  <Icon name="search_off" className="text-3xl" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Không tìm thấy dữ liệu bảo hành</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Số điện thoại này chưa có sản phẩm nào được giao thành công trên hệ thống. Xin vui lòng kiểm tra lại số điện thoại hoặc trạng thái đơn hàng của bạn.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {results.map((item, idx) => {
                  const attrs = parseVariantAttr(item.variantAttr);
                  return (
                    <div 
                      key={idx} 
                      className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col md:flex-row gap-6 relative overflow-hidden"
                    >
                      {/* Left Side: Image with Badge overlay */}
                      <div className="w-full md:w-32 h-32 bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-700">
                        {item.productImage ? (
                          <img 
                            src={item.productImage} 
                            alt={item.productName} 
                            className="object-contain w-full h-full p-2"
                            onError={(e) => {
                              e.target.src = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300";
                            }}
                          />
                        ) : (
                          <Icon name="image" className="text-3xl text-slate-300" />
                        )}
                      </div>

                      {/* Right Side: Product Details */}
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                              {item.productName}
                            </h3>
                            {/* Variant attributes tags */}
                            {attrs && Object.keys(attrs).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {Object.entries(attrs).map(([key, val]) => (
                                  <span key={key} className="inline-flex px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-md font-medium capitalize">
                                    {key}: {val}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Warranty Status Badge */}
                          <div className="shrink-0">
                            {item.active ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30 text-xs font-bold rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Còn bảo hành
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-950/30 text-xs font-bold rounded-full">
                                Hết bảo hành
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Info details grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl text-sm border border-slate-100/50 dark:border-slate-800/50">
                          <div>
                            <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ngày mua hàng</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 mt-1 block">{formatDate(item.purchaseDate)}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Thời hạn bảo hành</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 mt-1 block">{item.warrantyMonths} tháng</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hạn bảo hành đến</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 mt-1 block">{formatDate(item.warrantyExpiry)}</span>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Trạng thái hạn</span>
                            <span className={`font-bold mt-1 block ${item.active ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                              {item.active ? `Còn ${item.daysRemaining} ngày` : `Hết hạn ${Math.abs(item.daysRemaining)} ngày`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 px-1 pt-1">
                          <span>Mã đơn hàng: <span className="font-mono font-semibold text-slate-600 dark:text-slate-400">#OD-{item.orderId}</span></span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <Icon name="check_circle" className="text-sm" /> Sản phẩm chính hãng
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
    </div>
  );
}
