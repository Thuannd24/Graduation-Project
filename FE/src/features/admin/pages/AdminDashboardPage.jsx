import React, { useState, useEffect, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { orderApi } from "../../../services/orderApi.ts";
import { productApi } from "../../../services/productApi.ts";
import { authApi } from "../../../services/authApi.ts";
import keycloak from "../../../services/keycloak.js";

// Import modular subcomponents
import AdminSidebar from "../components/AdminSidebar.jsx";
import AdminHeader from "../components/AdminHeader.jsx";
import { PRODUCT_PLACEHOLDER } from "../../../utils/imageFallback.js";

// Tabs are code-split: only the active tab's chunk (and its heavy deps like
// recharts / @xyflow/react) is downloaded, instead of bundling all of them upfront.
const OverviewTab = lazy(() => import("../components/OverviewTab.jsx"));
const OrdersTab = lazy(() => import("../components/OrdersTab.jsx"));
const CustomersTab = lazy(() => import("../components/CustomersTab.jsx"));
const ProductsTab = lazy(() => import("../components/ProductsTab.jsx"));
const InventoryTab = lazy(() => import("../components/InventoryTab.jsx"));
const CampaignsTab = lazy(() => import("../components/CampaignsTab.jsx"));
const PromotionStatsTab = lazy(() => import("../components/PromotionStatsTab.jsx"));
const CategoriesTab = lazy(() => import("../components/CategoriesTab.jsx"));
const TransactionsTab = lazy(() => import("../components/TransactionsTab.jsx"));
const AddProductTab = lazy(() => import("../components/AddProductTab.jsx"));
const AdminRoleTab = lazy(() => import("../components/AdminRoleTab.jsx"));
const BrandsTab = lazy(() => import("../components/BrandsTab.jsx"));
const ReviewsTab = lazy(() => import("../components/ReviewsTab.jsx"));
const AnalyticsAITab = lazy(() => import("../components/AnalyticsAITab.jsx"));
const SupportChatTab = lazy(() => import("../components/SupportChatTab.jsx"));

function TabFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>
        progress_activity
      </span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTabState] = useState(
    () => localStorage.getItem("admin_active_tab") || "overview"
  );
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("admin_dark_mode") === "true");
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [editingProductId, setEditingProductId] = useState(null);
  const [quickAddTemplate, setQuickAddTemplate] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  // Danh sách sản phẩm/danh mục đầy đủ (dùng cho biểu đồ Overview và ảnh minh họa
  // trong Orders) chỉ thực sự cần khi mở 2 tab này — tải 1 lần rồi cache, tránh
  // gọi listAllProducts() (vòng lặp phân trang) mỗi khi vào Dashboard bất kể đang ở tab nào.
  const needsCatalog = activeTab === "overview" || activeTab === "orders";
  useEffect(() => {
    if (needsCatalog && products.length === 0) {
      fetchProducts();
      fetchCategories();
    }
  }, [needsCatalog]);

  // Danh sách user (size=1000) chỉ cần cho tab Giao dịch.
  useEffect(() => {
    if (activeTab === "transactions" && users.length === 0) {
      fetchUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("admin_dark_mode", darkMode ? "true" : "false");
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  // Wrapper để đồng thời lưu tab vào localStorage
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem("admin_active_tab", tab);
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const [orderData, paymentData] = await Promise.all([
        orderApi.listOrders(),
        orderApi.listAllPayments(0, 1000).catch(err => {
          console.error("Failed to fetch payments:", err);
          return { content: [] };
        })
      ]);
      setOrders(orderData || []);
      setPayments(paymentData?.content || paymentData || []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await productApi.adminListAllProducts();
      setProducts(data || []);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await productApi.listCategories();
      setCategories(data || []);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };  const fetchUsers = async () => {
    try {
      const data = await authApi.adminSearchUsers({ page: 0, size: 1000 }).catch(err => {
        console.error("Failed to fetch users:", err);
        return { content: [] };
      });
      setUsers(data?.content || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const handleShipOrder = async (orderId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xác nhận giao hàng cho đơn hàng này?")) return;
    try {
      await orderApi.shipOrder(orderId);
      alert("Xác nhận giao hàng thành công!");
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await orderApi.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (err) {
      alert("Lỗi khi xác nhận giao hàng: " + err.message);
    }
  };

  const refreshSelectedOrder = async (orderId) => {
    fetchOrders();
    if (selectedOrder && selectedOrder.id === orderId) {
      const updated = await orderApi.getOrder(orderId);
      setSelectedOrder(updated);
    }
  };

  // Hủy đơn (bắt buộc lý do). Đơn đang giao sẽ chuyển sang "Chờ hoàn hàng", kho chỉ cộng lại khi nhận hàng hoàn.
  // Lỗi được ném lại để hộp thoại hiển thị.
  const handleCancelOrder = async (orderId, reasonCode, reason) => {
    const updated = await orderApi.cancelOrder(orderId, reasonCode, reason);
    await refreshSelectedOrder(orderId);
    return updated;
  };

  const handleTriggerWebhook = async (orderId, status, reason) => {
    try {
      await orderApi.updateDeliveryStatus(orderId, status, reason);
      await refreshSelectedOrder(orderId);
    } catch (err) {
      alert("Không thể cập nhật trạng thái: " + err.message);
    }
  };

  const handleReturnReceived = async (orderId) => {
    if (!window.confirm("Xác nhận kho đã nhận lại hàng hoàn của đơn này? Tồn kho sẽ được cộng lại và đơn đã thanh toán online sẽ được hoàn tiền.")) return;
    try {
      await orderApi.confirmReturnReceived(orderId);
      await refreshSelectedOrder(orderId);
    } catch (err) {
      alert("Không thể xác nhận nhận hàng hoàn: " + err.message);
    }
  };

  const handleQuickAddTemplate = (templateName, categoryHint, price) => {
    setEditingProductId(null);
    setQuickAddTemplate({ name: templateName, categoryHint, price });
    setActiveTab("add-product");
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin + "/login" });
  };

  const getOrderItemImage = (item) => {
    // Không đoán ảnh minh họa theo tên (ảnh stock không liên quan) -> dùng ảnh thật nếu có, không thì placeholder.
    if (item?.imageUrl) return item.imageUrl;
    if (!item || !item.productName) return PRODUCT_PLACEHOLDER;
    const itemNameLower = String(item.productName).toLowerCase();
    const matched = products.find(p => p && p.name && String(p.name).toLowerCase().includes(itemNameLower));
    if (matched && matched.image) return matched.image;
    return PRODUCT_PLACEHOLDER;
  };

  const formatOrderDate = (dateStr) => {
    if (!dateStr) return "21-06-2026";
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const totalSales = orders
    .filter(o => o && ["DELIVERED", "CONFIRMED", "SHIPPED"].includes(o.status))
    .reduce((sum, o) => sum + (o.finalAmount || 0), 0);
  const salesStr = totalSales > 0 
    ? (totalSales / 1000000).toFixed(1) + "M đ" 
    : "0 đ";

  const ordersCountStr = orders.length > 0
    ? orders.length >= 1000 ? (orders.length / 1000).toFixed(1) + "K" : String(orders.length)
    : "0";

  const totalOrdersCount = orders.length || 0;
  const newOrdersCount = orders.filter(o => o && (o.status === "PENDING" || o.status === "AWAITING_PAYMENT")).length || 0;
  const completedOrdersCount = orders.filter(o => o && o.status === "DELIVERED").length || 0;
  const canceledOrdersCount = orders.filter(o => o && ["CANCELLED", "RETURNED"].includes(o.status)).length || 0;
  const pendingOrdersCount = orders.filter(o => o && ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "SHIPPED", "RETURNING"].includes(o.status)).length || 0;

  const handleSaveCampaignFlow = () => {
    alert("Quy trình chiến dịch khuyến mãi đã được lưu thành công vào hệ thống!");
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors ${darkMode ? "dark bg-slate-950" : "bg-slate-50"}`}>
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        ordersCount={orders.length}
        handleLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors">
        <AdminHeader
          activeTab={activeTab}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          orders={orders}
          setActiveTab={setActiveTab}
        />

        <Suspense fallback={<TabFallback />}>
        {activeTab === "overview" && (
          <OverviewTab
            orders={orders}
            products={products}
            categories={categories}
            loading={loading}
            setActiveTab={setActiveTab}
            handleQuickAddTemplate={handleQuickAddTemplate}
            salesStr={salesStr}
            ordersCountStr={ordersCountStr}
            totalOrdersCount={totalOrdersCount}
            newOrdersCount={newOrdersCount}
            completedOrdersCount={completedOrdersCount}
            canceledOrdersCount={canceledOrdersCount}
            pendingOrdersCount={pendingOrdersCount}
          />
        )}

        {activeTab === "orders" && (
          <OrdersTab
            orders={orders}
            payments={payments}
            loading={loading}
            selectedOrder={selectedOrder}
            setSelectedOrder={setSelectedOrder}
            isDrawerOpen={isDrawerOpen}
            setIsDrawerOpen={setIsDrawerOpen}
            orderFilter={orderFilter}
            setOrderFilter={setOrderFilter}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
            getOrderItemImage={getOrderItemImage}
            formatOrderDate={formatOrderDate}
            handleShipOrder={handleShipOrder}
            handleCancelOrder={handleCancelOrder}
            handleSimulateWebhook={handleTriggerWebhook}
            handleReturnReceived={handleReturnReceived}
          />
        )}

        {activeTab === "customers" && (
          <CustomersTab orders={orders} />
        )}

        {activeTab === "products" && (
          <ProductsTab setActiveTab={setActiveTab} setEditingProductId={setEditingProductId} />
        )}

        {activeTab === "inventory" && (
          <InventoryTab />
        )}

        {activeTab === "campaigns" && (
          <CampaignsTab />
        )}

        {activeTab === "promotion-stats" && (
          <PromotionStatsTab />
        )}

        {activeTab === "categories" && (
          <CategoriesTab onNavigateToAddProduct={() => setActiveTab("add-product")} />
        )}

        {activeTab === "transactions" && (
          <TransactionsTab orders={orders} payments={payments} users={users} onRefresh={fetchOrders} />
        )}

        {activeTab === "add-product" && (
          <AddProductTab
            key={editingProductId || "new"}
            onSaveProduct={(newProd) => {
              fetchProducts();
              setActiveTab("products");
            }}
            editingProductId={editingProductId}
            setEditingProductId={setEditingProductId}
            initialData={editingProductId ? null : quickAddTemplate}
          />
        )}

        {activeTab === "admin-role" && (
          <AdminRoleTab />
        )}

        {activeTab === "brands" && (
          <BrandsTab />
        )}

        {activeTab === "reviews" && (
          <ReviewsTab />
        )}

        {activeTab === "analytics-ai" && (
          <AnalyticsAITab onNavigate={setActiveTab} />
        )}

        {activeTab === "support-chat" && (
          <SupportChatTab />
        )}
        </Suspense>
      </main>
    </div>
  );
}
