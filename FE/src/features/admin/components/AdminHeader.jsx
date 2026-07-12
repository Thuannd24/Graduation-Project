import React from "react";
import Icon from "../../../components/common/Icon.jsx";

export default function AdminHeader({ activeTab, darkMode, onToggleDarkMode }) {
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
        return "Thống Kê Promotion";
      default:
        return "Hệ thống Quản Trị";
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between px-6 py-4 sticky top-0 z-20 shrink-0 transition-colors">
      <span className="font-extrabold text-xl text-slate-800 dark:text-white tracking-tight">
        {getTabTitle()}
      </span>

      <div className="flex-1 max-w-md mx-8 hidden md:block">
        <div className="relative">
          <input
            type="text"
            placeholder="Tìm kiếm dữ liệu, người dùng hoặc báo cáo..."
            className="w-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700/70 border-0 focus:ring-2 focus:ring-emerald-500 rounded-full px-5 py-2 pr-10 text-xs font-semibold text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-all focus:bg-white dark:focus:bg-slate-800"
          />
          <Icon name="search" className="absolute right-4 top-2 text-slate-400 text-lg pointer-events-none" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 relative rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Icon name="notifications" className="text-xl" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500" />
        </button>

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
