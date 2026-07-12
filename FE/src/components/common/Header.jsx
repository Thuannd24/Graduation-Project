import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../../context/CartContext.jsx";
import { useWishlist } from "../../context/WishlistContext.jsx";
import Icon from "./Icon.jsx";
import keycloak from "../../services/keycloak.js";
import CategorySidebar from "../../features/catalog/components/CategorySidebar.jsx";
import VisualSearchModal from "../../features/catalog/components/VisualSearchModal.jsx";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { items, showToast } = useCart();
  const { wishlist } = useWishlist();
  const count = items.reduce((total, item) => total + item.qty, 0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);

  // Close dropdown on route change
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [location]);

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
        // Get username or email for personalizing the toast
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
    <header className="sticky top-0 z-50 w-full flex flex-col items-center bg-gradient-to-r from-[#c82229] via-[#dd373f] to-[#ec5158] dark:from-[#aa1e24] dark:to-[#d83138] shadow-md">
      <div className="max-w-container-max w-full px-gutter flex items-center justify-between h-16 gap-lg">
        {/* Left Side: Logo & Category Dropdown */}
        <div className="flex items-center gap-lg shrink-0">
          <Link className="flex items-center select-none hover:opacity-90 transition-opacity font-orbitron text-2xl tracking-wider uppercase" to="/">
            <span className="font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">Aura</span>
            <span className="font-light text-rose-100/90 text-lg border-l border-white/20 pl-2 ml-2 tracking-widest">Tech</span>
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

        {/* Center: Beautiful Search bar with Image & Keyword support */}
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
        <nav className="flex items-center gap-2 md:gap-3" aria-label="Tiện ích">
          <Link className="p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[56px]" to="/profile?tab=warranty">
            <Icon name="local_shipping" className="text-lg" />
            <span className="text-[11px] font-extrabold mt-0.5">Tra cứu</span>
          </Link>
          <Link className="p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[56px] relative" to="/wishlist">
            <Icon name="favorite" className="text-lg" />
            <span className="text-[11px] font-extrabold mt-0.5">Yêu thích</span>
            {wishlist.length > 0 && (
              <strong className="absolute top-1 right-2 bg-badge-yellow text-slate-900 text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold px-1">{wishlist.length}</strong>
            )}
          </Link>
          <Link className="p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[56px] relative" to="/cart">
            <Icon name="shopping_cart" className="text-lg" />
            <span className="text-[11px] font-extrabold mt-0.5">Giỏ hàng</span>
            <strong className="absolute top-1 right-2 bg-badge-yellow text-slate-900 text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold px-1">{count}</strong>
          </Link>
          <Link
            className="p-2 text-white hover:bg-white/10 transition-all duration-200 rounded-xl flex flex-col items-center min-w-[56px]"
            to="/profile"
            onClick={handleAccountClick}
          >
            <Icon name={keycloak.authenticated ? "account_circle" : "login"} className="text-lg" />
            <span className="text-[11px] font-extrabold mt-0.5">
              {keycloak.authenticated ? "Tài khoản" : "Đăng nhập"}
            </span>
          </Link>
        </nav>
      </div>

      <VisualSearchModal isOpen={isVisualSearchOpen} onClose={() => setIsVisualSearchOpen(false)} />
    </header>
  );
}
