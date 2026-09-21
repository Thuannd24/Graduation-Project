import React, { useEffect, Suspense, lazy } from "react";
import { Route, Routes, Outlet, useLocation, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext.jsx";
import { WishlistProvider } from "./context/WishlistContext.jsx";
import Header from "./components/common/Header.jsx";
import Footer from "./components/common/Footer.jsx";
import Toast from "./components/common/Toast.jsx";
import RequireAuth from "./components/common/RequireAuth.jsx";
import RequireAdmin from "./components/common/RequireAdmin.jsx";
import AIChatbotWidget from "./features/chatbot/components/AIChatbotWidget.jsx";

const HomePage = lazy(() => import("./features/catalog/pages/HomePage.jsx"));
const CategoryPage = lazy(() => import("./features/catalog/pages/CategoryPage.jsx"));
const ProductDetailPage = lazy(() => import("./features/catalog/pages/ProductDetailPage.jsx"));
const CartPage = lazy(() => import("./features/cart/pages/CartPage.jsx"));
const CheckoutPage = lazy(() => import("./features/checkout/pages/CheckoutPage.jsx"));
const LoginPage = lazy(() => import("./features/auth/pages/LoginPage.jsx"));
const RegisterPage = lazy(() => import("./features/auth/pages/RegisterPage.jsx"));
const ProfilePage = lazy(() => import("./features/profile/pages/ProfilePage.jsx"));
const SearchPage = lazy(() => import("./features/catalog/pages/SearchPage.jsx"));
const OrderDetailPage = lazy(() => import("./features/profile/pages/OrderDetailPage.jsx"));
const TradeInPage = lazy(() => import("./pages/TradeInPage.jsx"));
const StorePage = lazy(() => import("./pages/StorePage.jsx"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));
const WishlistPage = lazy(() => import("./features/catalog/pages/WishlistPage.jsx"));
const AdminDashboardPage = lazy(() => import("./features/admin/pages/AdminDashboardPage.jsx"));

function RouteFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>
        progress_activity
      </span>
    </div>
  );
}

function StorefrontLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Outlet />
      </main>
      <Footer />
      <AIChatbotWidget />
    </div>
  );
}

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return null;
}

export default function App() {
  return (
    <CartProvider>
      <WishlistProvider>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Admin routes */}
            <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
            <Route path="/admin/*" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />

            {/* Storefront routes wrapped in the Layout layout */}
            <Route element={<StorefrontLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/category" element={<CategoryPage />} />
              <Route path="/product/:productId" element={<ProductDetailPage />} />
              <Route path="/cart" element={<RequireAuth><CartPage /></RequireAuth>} />
              <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/order/:orderId" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
              <Route path="/warranty" element={<Navigate to="/profile?tab=warranty" replace />} />
              <Route path="/tradein" element={<TradeInPage />} />
              <Route path="/stores" element={<StorePage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
        <Toast />
      </WishlistProvider>
    </CartProvider>
  );
}

