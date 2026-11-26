import React, { useEffect, useRef, useState, useTransition, Suspense, lazy } from "react";
import { Route, Routes, Outlet, useLocation, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext.jsx";
import { WishlistProvider } from "./context/WishlistContext.jsx";
import Header from "./components/common/Header.jsx";
import Footer from "./components/common/Footer.jsx";
import Toast from "./components/common/Toast.jsx";
import RequireAuth from "./components/common/RequireAuth.jsx";
import RequireAdmin from "./components/common/RequireAdmin.jsx";
import AIChatbotWidget from "./features/chatbot/components/AIChatbotWidget.jsx";
import { notifyRouteChange } from "./services/behaviorTracker.ts";

// Import trực tiếp các trang mua sắm chính để chuyển trang tức thì, không phải đợi tải chunk JS.
import HomePage from "./features/catalog/pages/HomePage.jsx";
import CategoryPage from "./features/catalog/pages/CategoryPage.jsx";
import ProductDetailPage from "./features/catalog/pages/ProductDetailPage.jsx";
import CartPage from "./features/cart/pages/CartPage.jsx";
import CheckoutPage from "./features/checkout/pages/CheckoutPage.jsx";
import OrderDetailPage from "./features/profile/pages/OrderDetailPage.jsx";

const LoginPage = lazy(() => import("./features/auth/pages/LoginPage.jsx"));
const RegisterPage = lazy(() => import("./features/auth/pages/RegisterPage.jsx"));
const ProfilePage = lazy(() => import("./features/profile/pages/ProfilePage.jsx"));
const SearchPage = lazy(() => import("./features/catalog/pages/SearchPage.jsx"));
// TradeInPage ("Thu cũ đổi mới") và StorePage ("Hệ thống cửa hàng") chưa có backend nên tạm gỡ khỏi
// router (giữ file trong src/pages để bật lại khi có API /tradein, /stores).
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));
const WishlistPage = lazy(() => import("./features/catalog/pages/WishlistPage.jsx"));
const AdminDashboardPage = lazy(() => import("./features/admin/pages/AdminDashboardPage.jsx"));

function PageLoadingOverlay({ overlay = false, fullScreen = false }) {
  const containerClass = overlay
    ? "fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[2px]"
    : fullScreen
      ? "flex items-center justify-center min-h-screen bg-slate-50/80 backdrop-blur-[2px]"
      : "flex items-center justify-center min-h-[60vh] bg-white/60 backdrop-blur-[2px] rounded-xl";

  return (
    <div className={containerClass} role="status" aria-label="Đang tải trang">
      <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-white/90 shadow-lg border border-slate-200/80">
        <div className="w-9 h-9 border-4 border-primary/25 border-t-primary rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-600">Đang tải...</span>
      </div>
    </div>
  );
}

function StorefrontLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="page-container">
        <Suspense fallback={<PageLoadingOverlay />}>
          <Outlet />
        </Suspense>
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

// Báo tracker mỗi lần đổi trang (kể cả link thường — `popstate` chỉ bắn khi bấm Back), bỏ qua lần
// render đầu vì chưa có "trang trước" nào để tính thời gian dừng. Xem behaviorTracker.ts.
function BehaviorRouteTracker() {
  const { pathname } = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    notifyRouteChange();
  }, [pathname]);

  return null;
}

export default function App() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (
      location.key !== displayLocation.key ||
      location.pathname !== displayLocation.pathname ||
      location.search !== displayLocation.search ||
      location.hash !== displayLocation.hash
    ) {
      startTransition(() => {
        setDisplayLocation(location);
      });
    }
  }, [location, displayLocation]);

  const adminElement = (
    <RequireAdmin>
      <Suspense fallback={<PageLoadingOverlay fullScreen />}>
        <AdminDashboardPage />
      </Suspense>
    </RequireAdmin>
  );

  return (
    <CartProvider>
      <WishlistProvider>
        <ScrollToTop />
        <BehaviorRouteTracker />
        {isPending && <PageLoadingOverlay overlay />}
        <Routes location={displayLocation}>
          {/* Admin routes */}
          <Route path="/admin" element={adminElement} />
          <Route path="/admin/*" element={adminElement} />

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
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <Toast />
      </WishlistProvider>
    </CartProvider>
  );
}

