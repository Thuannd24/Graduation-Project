import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../../context/CartContext.jsx";
import { useWishlist } from "../../context/WishlistContext.jsx";
import Icon from "./Icon.jsx";
import keycloak from "../../services/keycloak.js";
import CategorySidebar from "../../features/catalog/components/CategorySidebar.jsx";
import VisualSearchModal from "../../features/catalog/components/VisualSearchModal.jsx";
import { productApi } from "../../services/productApi";

const getCategoryIconFallback = (name) => {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("điện thoại") || normalized.includes("phone")) return "phone_iphone";
  if (normalized.includes("laptop") || normalized.includes("notebook")) return "laptop";
  if (normalized.includes("tai nghe") || normalized.includes("earphone") || normalized.includes("headphone") || normalized.includes("headset")) return "headphones";
  if (normalized.includes("đồng hồ") || normalized.includes("watch")) return "watch";
  if (normalized.includes("tivi") || normalized.includes("ti vi") || normalized.includes("tv")) return "tv";
  if (normalized.includes("pc") || normalized.includes("màn hình") || normalized.includes("monitor") || normalized.includes("desktop")) return "desktop_windows";
  if (normalized.includes("bàn phím") || normalized.includes("chuột") || normalized.includes("keyboard") || normalized.includes("mouse")) return "keyboard";
  if (normalized.includes("cáp") || normalized.includes("sạc") || normalized.includes("cable") || normalized.includes("charger")) return "cable";
  if (normalized.includes("phụ kiện") || normalized.includes("accessory")) return "extension";
  return "category";
};

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { items, showToast } = useCart();
  const { wishlist } = useWishlist();
  const count = items.reduce((total, item) => total + item.qty, 0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);

  // Fetch categories for mobile menu drawer
  useEffect(() => {
    productApi.listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Close dropdown and drawer on route change
  useEffect(() => {
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
  }, [location]);

  // Đồng bộ ô tìm kiếm với URL
  useEffect(() => {
    if (location.pathname === "/search") {
      const q = new URLSearchParams(location.search).get("q") || "";
      setSearchQuery(q);
    } else {
      setSearchQuery("");
    }
  }, [location.pathname, location.search]);

  // Click outside detection to close dropdown
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleOutsideClick = (e) => {
      const container = document.getElementById("category-dropdown-container");
      if (container && !container.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isDropdownOpen]);

  // Show login success toast
  useEffect(() => {
    if (keycloak.authenticated) {
      const shown = sessionStorage.getItem("login_toast_shown");
      if (!shown) {
        sessionStorage.setItem("login_toast_shown", "true");
        const name = keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || "bạn";
        showToast(`Đăng nhập thành công! Chào mừng ${name} quay trở lại.`);
      }
    } else {
      sessionStorage.removeItem("login_toast_shown");
    }
  }, [showToast]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleAccountClick = (e) => {
    if (!keycloak.authenticated) {
      e.preventDefault();
      keycloak.login({
        redirectUri: window.location.origin + "/profile",
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full flex flex-col items-center bg-gradient-to-r from-[#c82229] via-[#dd373f] to-[#ec5158] dark:from-[#aa1e24] dark:to-[#d83138] shadow-md px-3 md:px-6">
      <div className="max-w-container-max w-full flex items-center justify-between h-14 md:h-16 gap-md md:gap-lg">
        {/* Left Side: Logo & Category Dropdown */}
        <div className="flex items-center gap-md md:gap-lg shrink-0">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="block md:hidden text-white bg-transparent border-0 p-1 cursor-pointer flex items-center hover:bg-white/10 rounded-lg transition-colors"
            title="Menu"
          >
            <Icon className="text-2xl" name="menu" />
          </button>

          <Link className="flex items-center select-none hover:opacity-90 transition-opacity font-orbitron text-xl md:text-2xl tracking-wider uppercase" to="/">
            <span className="font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">Aura</span>
            <span className="font-light text-rose-100/90 text-sm md:text-lg border-l border-white/20 pl-2 ml-2 tracking-widest">Tech</span>
          </Link>

          <div id="category-dropdown-container" className="hidden md:block relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors whitespace-nowrap text-sm font-extrabold border border-white/4 cursor-pointer"
            >
              <Icon className="text-base" name="grid_view" />
              <span>Danh mục</span>
              <Icon className="text-xs transition-transform duration-200" name={isDropdownOpen ? "expand_less" : "expand_more"} />
            </button>
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-50">
                <CategorySidebar isDropdown={true} />
              </div>
            )}
          </div>
        </div>

        {/* Center: Beautiful Search bar with Image & Keyword support (Desktop only) */}
        <div className="flex-1 max-w-xl hidden md:block">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 text-white placeholder:text-white/60 border border-white/5 rounded-full pl-5 pr-20 py-2 focus:bg-white/15 focus:ring-2 focus:ring-white/30 transition-all text-sm outline-none"
              placeholder="Bạn muốn mua gì hôm nay ? "
              type="search"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsVisualSearchOpen(true)}
                className="text-white/70 hover:text-white bg-transparent border-0 p-0 cursor-pointer flex items-center transition-colors"
                title="Tìm bằng hình ảnh"
              >
                <Icon name="photo_camera" className="text-base" />
              </button>
              <button
                type="submit"
                className="text-white/75 hover:text-white bg-transparent border-0 p-0 cursor-pointer flex items-center transition-colors"
                title="Tìm kiếm"
              >
                <Icon name="search" className="text-base" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Navigation Utilities */}
        <nav className="flex items-center gap-1 sm:gap-2 md:gap-3" aria-label="Tiện ích">
          <Link className="p-1.5 md:p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[42px] md:min-w-[56px]" to="/profile?tab=warranty">
            <Icon name="local_shipping" className="text-[20px] md:text-lg" />
            <span className="hidden md:block text-[11px] font-extrabold mt-0.5">Tra cứu</span>
          </Link>
          <Link className="p-1.5 md:p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[42px] md:min-w-[56px] relative" to="/wishlist">
            <Icon name="favorite" className="text-[20px] md:text-lg" />
            <span className="hidden md:block text-[11px] font-extrabold mt-0.5">Yêu thích</span>
            {wishlist.length > 0 && (
              <strong className="absolute top-0.5 right-1 md:top-1 md:right-2 bg-badge-yellow text-slate-900 text-[8px] md:text-[9px] rounded-full min-w-[14px] h-[14px] md:min-w-[16px] md:h-[16px] flex items-center justify-center font-bold px-1">{wishlist.length}</strong>
            )}
          </Link>
          <Link className="p-1.5 md:p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[42px] md:min-w-[56px] relative" to="/cart">
            <Icon name="shopping_cart" className="text-[20px] md:text-lg" />
            <span className="hidden md:block text-[11px] font-extrabold mt-0.5">Giỏ hàng</span>
            <strong className="absolute top-0.5 right-1 md:top-1 md:right-2 bg-badge-yellow text-slate-900 text-[8px] md:text-[9px] rounded-full min-w-[14px] h-[14px] md:min-w-[16px] md:h-[16px] flex items-center justify-center font-bold px-1">{count}</strong>
          </Link>
          <Link
            className="p-1.5 md:p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[42px] md:min-w-[56px]"
            to="/profile"
            onClick={handleAccountClick}
          >
            <Icon name={keycloak.authenticated ? "account_circle" : "login"} className="text-[20px] md:text-lg" />
            <span className="hidden md:block text-[11px] font-extrabold mt-0.5">
              {keycloak.authenticated ? "Tài khoản" : "Đăng nhập"}
            </span>
          </Link>
        </nav>
      </div>

      {/* Row 2: Search bar (Mobile only) */}
      <div className="w-full pb-2 md:hidden">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-white placeholder:text-white/60 border border-white/5 rounded-full pl-4 pr-16 py-1.5 focus:bg-white/15 focus:ring-2 focus:ring-white/30 transition-all text-xs outline-none"
            placeholder="Bạn muốn mua gì hôm nay ? "
            type="search"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsVisualSearchOpen(true)}
              className="text-white/70 hover:text-white bg-transparent border-0 p-0 cursor-pointer flex items-center transition-colors"
              title="Tìm bằng hình ảnh"
            >
              <Icon name="photo_camera" className="text-base" />
            </button>
            <button
              type="submit"
              className="text-white/75 hover:text-white bg-transparent border-0 p-0 cursor-pointer flex items-center transition-colors"
              title="Tìm kiếm"
            >
              <Icon name="search" className="text-base" />
            </button>
          </div>
        </form>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 transition-opacity"
          />
          {/* Drawer Panel */}
          <div className="relative flex w-4/5 max-w-[280px] flex-col bg-white dark:bg-slate-900 shadow-xl h-full z-10 transition-transform">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#c82229] to-[#ec5158] text-white">
              <span className="font-orbitron font-black text-lg tracking-wider">AuraTech Menu</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-white bg-transparent border-0 p-1 cursor-pointer flex items-center"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>
            {/* Categories List */}
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-black text-red-600 dark:text-red-500 uppercase tracking-wider">Danh mục sản phẩm</h3>
              </div>
              <nav className="flex flex-col py-1">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/category?activeCategory=${cat.slug || encodeURIComponent(cat.name || "")}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800/40"
                  >
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="w-6 h-6 object-contain shrink-0 rounded bg-white p-0.5 shadow-sm border border-slate-200" />
                    ) : (
                      <Icon name={cat.icon || getCategoryIconFallback(cat.name)} className="text-lg text-slate-500 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {cat.label || cat.name}
                    </span>
                    <Icon name="chevron_right" className="ml-auto text-sm text-slate-400" />
                  </Link>
                ))}
              </nav>
            </div>
            {/* Drawer Footer Commitments */}
            <div className="border-t border-slate-100 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900/50 flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <Icon name="support_agent" className="text-red-600 text-base shrink-0" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tư vấn: 1800.2097 (Miễn phí)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Icon name="verified_user" className="text-red-600 text-base shrink-0" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Bảo hành 1 đổi 1 trong 30 ngày</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <VisualSearchModal isOpen={isVisualSearchOpen} onClose={() => setIsVisualSearchOpen(false)} />
    </header>
  );
}
