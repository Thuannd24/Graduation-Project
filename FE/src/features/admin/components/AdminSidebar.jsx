import React from "react";
import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";

export default function AdminSidebar({ activeTab, setActiveTab, ordersCount, handleLogout }) {
  return (
    <aside className="w-64 bg-white flex flex-col justify-between border-r border-slate-200 shrink-0 h-screen sticky top-0">
      <div>
        {/* Logo Brand */}
        <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-white">
          <div className="flex items-center select-none font-orbitron text-xl tracking-wider uppercase">
            <span className="font-black text-slate-800">Aura</span>
            <span className="font-light text-rose-600 text-base border-l border-slate-300 pl-1.5 ml-1.5 tracking-widest">Tech</span>
          </div>
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <Icon name="menu_open" className="text-lg" />
          </button>
        </div>

        {/* Danh mục menu điều hướng */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          
          {/* 1. Main menu */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Main menu</div>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveTab("overview")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "overview"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="dashboard" className="text-base" filled={activeTab === "overview"} />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab("orders")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "orders"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon name="shopping_bag" className="text-base" filled={activeTab === "orders"} />
                  <span>Order Management</span>
                </div>
                {ordersCount > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === "orders" ? "bg-white text-emerald-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {ordersCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("customers")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "customers"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="group" className="text-base" filled={activeTab === "customers"} />
                <span>Customers</span>
              </button>

              <button
                onClick={() => setActiveTab("campaigns")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "campaigns"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="local_offer" className="text-base" filled={activeTab === "campaigns"} />
                <span>Coupon Code</span>
              </button>

              <button
                onClick={() => setActiveTab("promotion-stats")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "promotion-stats"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="insights" className="text-base" filled={activeTab === "promotion-stats"} />
                <span>Thống kê Promotion</span>
              </button>

              <button
                onClick={() => setActiveTab("analytics-ai")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "analytics-ai"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="psychology" className="text-base" filled={activeTab === "analytics-ai"} />
                <span>AI Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab("support-chat")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "support-chat"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="chat" className="text-base" filled={activeTab === "support-chat"} />
                <span>Customer Chat</span>
              </button>

              <button
                onClick={() => setActiveTab("categories")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "categories"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="category" className="text-base" filled={activeTab === "categories"} />
                <span>Categories</span>
              </button>

              <button
                onClick={() => setActiveTab("transactions")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "transactions"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="account_balance_wallet" className="text-base" filled={activeTab === "transactions"} />
                <span>Transaction</span>
              </button>

              <button
                onClick={() => setActiveTab("brands")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "brands"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="star" className="text-base" filled={activeTab === "brands"} />
                <span>Brand</span>
              </button>
            </nav>
          </div>

          {/* 2. Product */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Product</div>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveTab("add-product")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "add-product"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="add_circle" className="text-base" filled={activeTab === "add-product"} />
                <span>Add Products</span>
              </button>

              <button
                onClick={() => setActiveTab("products")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "products"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="list_alt" className="text-base" filled={activeTab === "products"} />
                <span>Product List</span>
              </button>

              <button
                onClick={() => setActiveTab("inventory")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "inventory"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="warehouse" className="text-base" filled={activeTab === "inventory"} />
                <span>Quản Lý Tồn Kho</span>
              </button>
            </nav>
          </div>

          {/* 3. Admin */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1.5">Admin</div>
            <nav className="space-y-0.5">
              <button
                onClick={() => setActiveTab("admin-role")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "admin-role"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon name="admin_panel_settings" className="text-base" filled={activeTab === "admin-role"} />
                <span>Admin role</span>
              </button>
            </nav>
          </div>

        </div>
      </div>

      {/* Thông tin User & Logout ở chân Sidebar */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=60"
                alt="Admin User"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="max-w-[130px] truncate">
              <div className="font-extrabold text-xs text-slate-800 truncate">Quản Trị Viên</div>
              <div className="text-[10px] text-slate-400">admin@auratech.com</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Đăng xuất"
          >
            <Icon name="logout" className="text-lg" />
          </button>
        </div>
        <Link
          to="/"
          className="flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 transition-colors shadow-sm mt-1"
        >
          <Icon name="open_in_new" className="text-[13px]" />
          <span>Xem Cửa Hàng</span>
        </Link>
      </div>
    </aside>
  );
}
