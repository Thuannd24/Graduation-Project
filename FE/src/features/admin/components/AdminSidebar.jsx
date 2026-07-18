import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { authApi } from "../../../services/authApi.ts";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=60";

const NAV_MAIN = [
  { tab: "overview", icon: "dashboard", label: "Dashboard" },
  { tab: "orders", icon: "shopping_bag", label: "Order Management", showOrdersCount: true },
  { tab: "customers", icon: "group", label: "Customers" },
  { tab: "campaigns", icon: "local_offer", label: "Coupon Code" },
  { tab: "promotion-stats", icon: "insights", label: "Thống kê Promotion" },
  { tab: "analytics-ai", icon: "psychology", label: "AI Analytics", activeClass: "bg-rose-600" },
  { tab: "support-chat", icon: "chat", label: "Customer Chat" },
  { tab: "categories", icon: "category", label: "Categories" },
  { tab: "transactions", icon: "account_balance_wallet", label: "Transaction" },
  { tab: "brands", icon: "star", label: "Brand" },
  { tab: "reviews", icon: "rate_review", label: "Reviews" }
];

const NAV_PRODUCT = [
  { tab: "add-product", icon: "add_circle", label: "Add Products" },
  { tab: "products", icon: "list_alt", label: "Product List" },
  { tab: "inventory", icon: "warehouse", label: "Quản Lý Tồn Kho" }
];

const NAV_ADMIN = [
  { tab: "admin-role", icon: "admin_panel_settings", label: "Admin role" }
];

export default function AdminSidebar({ activeTab, setActiveTab, ordersCount, handleLogout }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("admin_sidebar_collapsed") === "true");
  const [currentUser, setCurrentUser] = useState({ fullName: "Đang tải...", email: "", avatarUrl: DEFAULT_AVATAR });

  useEffect(() => {
    authApi.me()
      .then((user) => {
        setCurrentUser({
          fullName: user.fullName || user.username || "Quản trị viên",
          email: user.email || "",
          avatarUrl: user.avatarUrl || DEFAULT_AVATAR
        });
      })
      .catch((err) => {
        console.warn("Không tải được thông tin người dùng cho sidebar:", err);
        setCurrentUser({ fullName: "Quản trị viên", email: "", avatarUrl: DEFAULT_AVATAR });
      });
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", next ? "true" : "false");
      return next;
    });
  };

  const renderNavButton = ({ tab, icon, label, activeClass, showOrdersCount }) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-bold transition-all ${
        collapsed ? "justify-center" : "justify-between"
      } ${
        activeTab === tab
          ? `${activeClass || "bg-emerald-600"} text-white shadow-sm`
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "" : "gap-3"}`}>
        <Icon name={icon} className="text-base" filled={activeTab === tab} />
        {!collapsed && <span>{label}</span>}
      </div>
      {!collapsed && showOrdersCount && ordersCount > 0 && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === tab ? "bg-white text-emerald-700" : "bg-emerald-50 text-emerald-700"}`}>
          {ordersCount}
        </span>
      )}
    </button>
  );

  return (
    <aside className={`${collapsed ? "w-20" : "w-64"} bg-white flex flex-col justify-between border-r border-slate-200 shrink-0 h-screen sticky top-0 transition-all duration-200`}>
      <div>
        {/* Logo Brand */}
        <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-white">
          {!collapsed && (
            <div className="flex items-center select-none font-orbitron text-xl tracking-wider uppercase">
              <span className="font-black text-slate-800">Aura</span>
              <span className="font-light text-rose-600 text-base border-l border-slate-300 pl-1.5 ml-1.5 tracking-widest">Tech</span>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            className={`text-slate-400 hover:text-slate-600 transition-colors ${collapsed ? "mx-auto" : ""}`}
          >
            <Icon name={collapsed ? "menu" : "menu_open"} className="text-lg" />
          </button>
        </div>

        {/* Danh mục menu điều hướng */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">

          {/* 1. Main menu */}
          <div>
            {!collapsed && (
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Main menu</div>
            )}
            <nav className="space-y-0.5">
              {NAV_MAIN.map(renderNavButton)}
            </nav>
          </div>

          {/* 2. Product */}
          <div>
            {!collapsed && (
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Product</div>
            )}
            <nav className="space-y-0.5">
              {NAV_PRODUCT.map(renderNavButton)}
            </nav>
          </div>

          {/* 3. Admin */}
          <div>
            {!collapsed && (
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Admin</div>
            )}
            <nav className="space-y-0.5">
              {NAV_ADMIN.map(renderNavButton)}
            </nav>
          </div>

        </div>
      </div>

      {/* Thông tin User & Logout ở chân Sidebar */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2">
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          <div className={`flex items-center ${collapsed ? "" : "gap-2"}`}>
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 overflow-hidden shrink-0">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            {!collapsed && (
              <div className="max-w-[130px] truncate">
                <div className="font-extrabold text-xs text-slate-800 truncate">{currentUser.fullName}</div>
                <div className="text-[10px] text-slate-400 truncate">{currentUser.email}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Đăng xuất"
            >
              <Icon name="logout" className="text-lg" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            className="flex items-center justify-center py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Đăng xuất"
          >
            <Icon name="logout" className="text-lg" />
          </button>
        )}
        <Link
          to="/"
          title="Xem Cửa Hàng"
          className="flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 transition-colors shadow-sm mt-1"
        >
          <Icon name="open_in_new" className="text-[13px]" />
          {!collapsed && <span>Xem Cửa Hàng</span>}
        </Link>
      </div>
    </aside>
  );
}
