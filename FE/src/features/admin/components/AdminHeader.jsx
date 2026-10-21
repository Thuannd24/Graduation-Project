import React, { useEffect, useRef, useState } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { inventoryApi } from "../../../services/inventoryApi.ts";

const LOW_STOCK_THRESHOLD = 10;

export default function AdminHeader({ activeTab, darkMode, onToggleDarkMode, orders = [], setActiveTab }) {
  const [bellOpen, setBellOpen] = useState(false);
  const [lowStockCount, setLowStockCount] = useState(null); // null = không tải được
  const bellRef = useRef(null);

  // Số SKU tồn thấp lấy từ API thật (/admin/inventories/low-stock, lọc quantity <= ngưỡng).
  useEffect(() => {
    let cancelled = false;
    inventoryApi
      .getLowStock(LOW_STOCK_THRESHOLD)
      .then((items) => { if (!cancelled) setLowStockCount(items.length); })
      .catch(() => { if (!cancelled) setLowStockCount(null); });
    return () => { cancelled = true; };
  }, [activeTab]);

  useEffect(() => {
    if (!bellOpen) return undefined;
    const onClick = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [bellOpen]);

  const pendingOrders = (Array.isArray(orders) ? orders : []).filter(
    (o) => ["PENDING", "CONFIRMED", "RETURNING"].includes(o?.status)
  ).length;
  const totalAlerts = pendingOrders + (lowStockCount || 0);

  const goTo = (tab) => {
    setBellOpen(false);
    if (setActiveTab) setActiveTab(tab);
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "overview":
        return "Bảng Điều Khiển";
      case "orders":
        return "Quản Lý Đơn Hàng";
      case "customers":
        return "Quản Lý Khách Hàng";
      case "products":
        return "Danh Sách Sản Phẩm";
      case "inventory":
        return "Quản Lý Tồn Kho";
      case "add-product":
        return "Thêm Sản Phẩm Mới";
      case "categories":
        return "Quản Lý Danh Mục";
      case "brands":
        return "Quản Lý Thương Hiệu";
      case "campaigns":
        return "Quy Trình Khuyến Mãi";
      case "promotion-stats":
        return "Thống Kê Khuyến Mãi";
      case "transactions":
        return "Giao Dịch Thanh Toán";
      case "admin-role":
        return "Phân Quyền Quản Trị";
      case "reviews":
        return "Quản Lý Đánh Giá";
      case "analytics-ai":
        return "Phân Tích AI";
      case "support-chat":
        return "Hỗ Trợ Khách Hàng";
      default:
        return "Hệ thống Quản Trị";
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between px-6 py-4 sticky top-0 z-20 shrink-0 transition-colors">
      <span className="font-extrabold text-xl text-slate-800 dark:text-white tracking-tight">
        {getTabTitle()}
      </span>

      <div className="flex items-center gap-3">
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            aria-label={totalAlerts > 0 ? `${totalAlerts} việc cần xử lý` : "Thông báo"}
            title="Việc cần xử lý"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 relative rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Icon name="notifications" className="text-xl" />
            {totalAlerts > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                {totalAlerts > 99 ? "99+" : totalAlerts}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 overflow-hidden">
              <p className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700">
                Việc cần xử lý
              </p>
              <button
                type="button"
                onClick={() => goTo("orders")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <Icon name="receipt_long" className="text-amber-500 text-lg" />
                <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {pendingOrders > 0 ? `${pendingOrders} đơn cần xử lý (chờ xác nhận / chờ giao / chờ hoàn hàng)` : "Không có đơn chờ xử lý"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => goTo("inventory")}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <Icon name="inventory_2" className="text-rose-500 text-lg" />
                <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {lowStockCount == null
                    ? "Không tải được cảnh báo tồn kho"
                    : lowStockCount > 0
                    ? `${lowStockCount} SKU tồn kho ≤ ${LOW_STOCK_THRESHOLD}`
                    : "Không có SKU sắp hết hàng"}
                </span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? "Bật chế độ sáng" : "Bật chế độ tối"}
          className={`relative w-14 h-7 rounded-full transition-all duration-300 shrink-0 ${
            darkMode ? "bg-indigo-900" : "bg-slate-200"
          }`}
        >
          <Icon
            name="light_mode"
            className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${
              darkMode ? "text-slate-500" : "text-amber-500"
            }`}
          />
          <Icon
            name="dark_mode"
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${
              darkMode ? "text-indigo-300" : "text-slate-400"
            }`}
          />
          <span
            className={`absolute top-0.5 w-6 h-6 bg-white dark:bg-slate-100 border border-slate-200 rounded-full shadow-md transition-all duration-300 ${
              darkMode ? "left-[calc(100%-1.625rem)]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </header>
  );
}
