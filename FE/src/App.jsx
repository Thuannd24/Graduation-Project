import React from "react";
import { Route, Routes, Outlet } from "react-router-dom";
import { CartProvider } from "./context/CartContext.jsx";
import { WishlistProvider } from "./context/WishlistContext.jsx";
import Header from "./components/common/Header.jsx";
import Footer from "./components/common/Footer.jsx";
import HomePage from "./features/catalog/pages/HomePage.jsx";
import CategoryPage from "./features/catalog/pages/CategoryPage.jsx";
import ProductDetailPage from "./features/catalog/pages/ProductDetailPage.jsx";
import CartPage from "./features/cart/pages/CartPage.jsx";
import CheckoutPage from "./features/checkout/pages/CheckoutPage.jsx";
import LoginPage from "./features/auth/pages/LoginPage.jsx";
import RegisterPage from "./features/auth/pages/RegisterPage.jsx";
import ProfilePage from "./features/profile/pages/ProfilePage.jsx";
import SearchPage from "./features/catalog/pages/SearchPage.jsx";
import OrderDetailPage from "./features/profile/pages/OrderDetailPage.jsx";
import WarrantyPage from "./pages/WarrantyPage.jsx";
import TradeInPage from "./pages/TradeInPage.jsx";
import StorePage from "./pages/StorePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import WishlistPage from "./features/catalog/pages/WishlistPage.jsx";
import Toast from "./components/common/Toast.jsx";
import AdminDashboardPage from "./features/admin/pages/AdminDashboardPage.jsx";
import RequireAuth from "./components/common/RequireAuth.jsx";
import RequireAdmin from "./components/common/RequireAdmin.jsx";

function StorefrontLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <WishlistProvider>
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
            <Route path="/warranty" element={<WarrantyPage />} />
            <Route path="/tradein" element={<TradeInPage />} />
            <Route path="/stores" element={<StorePage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <Toast />
      </WishlistProvider>
    </CartProvider>
  );
}

