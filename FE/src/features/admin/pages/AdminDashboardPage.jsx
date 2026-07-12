import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { orderApi } from "../../../services/orderApi.ts";
import { productApi } from "../../../services/productApi.ts";
import { authApi } from "../../../services/authApi.ts";
import keycloak from "../../../services/keycloak.js";

// Import modular subcomponents
import AdminSidebar from "../components/AdminSidebar.jsx";
import AdminHeader from "../components/AdminHeader.jsx";
import OverviewTab from "../components/OverviewTab.jsx";
import OrdersTab from "../components/OrdersTab.jsx";
import CustomersTab from "../components/CustomersTab.jsx";
import ProductsTab from "../components/ProductsTab.jsx";
import InventoryTab from "../components/InventoryTab.jsx";
import CampaignsTab from "../components/CampaignsTab.jsx";
import PromotionStatsTab from "../components/PromotionStatsTab.jsx";
import CategoriesTab from "../components/CategoriesTab.jsx";
import TransactionsTab from "../components/TransactionsTab.jsx";
import AddProductTab from "../components/AddProductTab.jsx";
import AdminRoleTab from "../components/AdminRoleTab.jsx";
import BrandsTab from "../components/BrandsTab.jsx";
import AnalyticsAITab from "../components/AnalyticsAITab.jsx";
import SupportChatTab from "../components/SupportChatTab.jsx";

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
  const [productSearch, setProductSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Form states cho thêm/sửa sản phẩm
  const [productForm, setProductForm] = useState({
    name: "",
    price: 0,
    oldPrice: 0,
    category: "",
    brand: "",
    image: "",
    description: "",
  });
  const [editingProductId, setEditingProductId] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchCategories();
    fetchUsers();
  }, []);

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
      const data = await productApi.listProducts();
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

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy đơn hàng này?")) return;
    try {
      await orderApi.cancelOrder(orderId);
      alert("Hủy đơn hàng thành công!");
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await orderApi.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (err) {
      alert("Lỗi khi hủy đơn hàng: " + err.message);
    }
  };

  const handleTriggerWebhook = async (orderId, status) => {
    try {
      await orderApi.updateDeliveryStatus(orderId, status);
      alert(`Đã cập nhật trạng thái giao vận thành ${status} thành công!`);
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await orderApi.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (err) {
      alert("Lỗi cập nhật trạng thái giao vận: " + err.message);
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProductId) {
        await productApi.updateProduct(editingProductId, productForm);
        alert("Cập nhật sản phẩm thành công!");
      } else {
        await productApi.createProduct(productForm);
        alert("Thêm sản phẩm thành công!");
      }
      setShowProductModal(false);
      setEditingProductId(null);
      setProductForm({
        name: "",
        price: 0,
        oldPrice: 0,
        category: "",
        brand: "",
        image: "",
        description: "",
      });
      fetchProducts();
    } catch (err) {
      alert("Lỗi lưu sản phẩm: " + err.message);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return;
    try {
      await productApi.deleteProduct(id);
      alert("Xóa sản phẩm thành công!");
      fetchProducts();
    } catch (err) {
      alert("Lỗi khi xóa sản phẩm: " + err.message);
    }
  };

  const handleQuickAddTemplate = (templateName, category, price) => {
    setProductForm({
      name: templateName,
      price: price,
      oldPrice: price + 100000,
      category: category,
      brand: "QuickBrand",
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300",
      description: "Sản phẩm được thêm nhanh từ trang tổng quan Admin."
    });
    setEditingProductId(null);
    setShowProductModal(true);
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin + "/login" });
  };

  const getOrderItemImage = (item) => {
    if (!item || !item.productName) return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100";
    const itemNameLower = String(item.productName).toLowerCase();
    const matched = products.find(p => p && p.name && String(p.name).toLowerCase().includes(itemNameLower));
    if (matched && matched.image) return matched.image;
    if (itemNameLower.includes("phone") || itemNameLower.includes("webcam")) {
      return "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?w=100";
    }
    if (itemNameLower.includes("bag") || itemNameLower.includes("wallet")) {
      return "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=100";
    }
    return "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100";
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
  const canceledOrdersCount = orders.filter(o => o && o.status === "CANCELLED").length || 0;
  const pendingOrdersCount = orders.filter(o => o && ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "SHIPPED"].includes(o.status)).length || 0;

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
        <AdminHeader activeTab={activeTab} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />

        {activeTab === "overview" && (
          <OverviewTab
            orders={orders}
            products={products}
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
            productSearch={productSearch}
            setProductSearch={setProductSearch}
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
            orderSearchQuery={orderSearchQuery}
            setOrderSearchQuery={setOrderSearchQuery}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
            getOrderItemImage={getOrderItemImage}
            formatOrderDate={formatOrderDate}
            handleShipOrder={handleShipOrder}
            handleCancelOrder={handleCancelOrder}
            handleSimulateWebhook={handleTriggerWebhook}
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
          />
        )}

        {activeTab === "admin-role" && (
          <AdminRoleTab />
        )}

        {activeTab === "brands" && (
          <BrandsTab />
        )}

        {activeTab === "analytics-ai" && (
          <AnalyticsAITab />
        )}

        {activeTab === "support-chat" && (
          <SupportChatTab />
        )}
      </main>
    </div>
  );
}
