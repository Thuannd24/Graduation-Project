import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productApi } from "../../../services/productApi";
import ProductCarousel from "./ProductCarousel";
import Icon from "../../../components/common/Icon";
import { calculateDiscountPercent } from "../../../utils/format";

// Import processed transparent banners
import blackFridayBanner from "../../../assets/images/black_friday_banner.png";
import bestSellerBadge from "../../../assets/images/best_seller_badge.png";
import newArrivalBadge from "../../../assets/images/new_arrival_badge.png";

const TAB_CONFIGS = {
  deal: {
    gradient: "linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)",
    glowColor: "rgba(255, 75, 43, 0.4)",
    label: "DEAL CHỚP NHOÁNG",
    icon: "bolt",
    color: "#FF4B2B",
    badgeImage: blackFridayBanner,
    badgeHeight: "68px",
    badgeHeightMobile: "52px",
    badgeTop: "-22px",
    badgeLeft: "10px",
    activeColor: "#FF4B2B",
    inactiveColor: "#71717A",
  },
  new: {
    gradient: "linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)",
    glowColor: "rgba(0, 114, 255, 0.4)",
    label: "HÀNG MỚI TUYỂN CHỌN",
    icon: "auto_awesome",
    color: "#0072FF",
    badgeImage: newArrivalBadge,
    badgeHeight: "68px",
    badgeHeightMobile: "52px",
    badgeTop: "-22px",
    badgeLeft: "10px",
    activeColor: "#0072FF",
    inactiveColor: "#71717A",
  },
  hot: {
    gradient: "linear-gradient(135deg, #FFB800 0%, #FF7A00 100%)",
    glowColor: "rgba(255, 122, 0, 0.4)",
    label: "SẢN PHẨM BÁN CHẠY",
    icon: "local_fire_department",
    color: "#FF7A00",
    badgeImage: bestSellerBadge,
    badgeHeight: "68px",
    badgeHeightMobile: "52px",
    badgeTop: "-22px",
    badgeLeft: "10px",
    activeColor: "#FF7A00",
    inactiveColor: "#71717A",
  }
};

const MAIN_TABS = [
  { id: "deal" },
  { id: "new" },
  { id: "hot" },
];

// Helper to fallback resolve beautiful icons for database categories if cat.icon is not provided
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
  return "category"; // fallback
};

const VISIBLE_CARDS = 5;
const CARD_GAP = 12;

export default function FlashDealSection() {
  const [mainTab, setMainTab] = useState("deal");
  const [activeCat, setActiveCat] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failedImages, setFailedImages] = useState({});

  // Fetch categories from API on mount
  useEffect(() => {
    productApi.listCategories()
      .then(c => setCategories(c.slice(0, 10)))
      .catch(() => setCategories([]));
  }, []);

  // Fetch real data from backend based on mainTab & activeCat
  useEffect(() => {
    setLoading(true);
    
    // Set query parameters for Spring Boot Pageable and sorting
    const params = {
      size: mainTab === "deal" ? "100" : "35", // fetch more for deals because we filter locally
    };
    
    if (activeCat) {
      params.categoryId = String(activeCat.id);
    }
    
    if (mainTab === "new") {
      params.sort = "id,desc";
    } else if (mainTab === "hot") {
      params.sort = "rating,desc";
    }
    
    productApi.listProductsPaged(params)
      .then(result => {
        let items = result.items || [];
        
        if (mainTab === "deal") {
          // Filter products with discounts (oldPrice > price) and sort by discount percent descending
          items = items
            .filter(p => Number(p.oldPrice) > Number(p.price))
            .sort((a, b) => calculateDiscountPercent(b.price, b.oldPrice) - calculateDiscountPercent(a.price, a.oldPrice));
        }
        
        setProducts(items);
      })
      .catch(err => {
        console.error("Failed to fetch backend products in FlashDealSection:", err);
        setProducts([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [mainTab, activeCat]);

  const activeConfig = TAB_CONFIGS[mainTab];

  return (
    <div style={{
      background: activeConfig.gradient,
      padding: "2px",
      borderRadius: "20px",
      boxShadow: `0 12px 40px ${activeConfig.glowColor}`,
      position: "relative",
      transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      margin: "44px 0 20px",
      "--active-gradient": activeConfig.gradient,
      "--active-glow": activeConfig.glowColor,
    }}>
      {/* Dynamic Keyframes and Imports */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        
        @keyframes floatBanner {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-5px) rotate(1deg); }
        }
        @keyframes pulseFire {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.22); }
        }
        @keyframes popExplode {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; filter: brightness(2); }
          70% { transform: scale(1.22) rotate(4deg); opacity: 0.9; }
          100% { transform: scale(1) rotate(-2deg); opacity: 1; }
        }
        @keyframes ringPulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.9; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes breathingGlow {
          0%, 100% { filter: drop-shadow(0 8px 18px rgba(0,0,0,0.22)) brightness(1); }
          50% { filter: drop-shadow(0 12px 26px var(--active-glow)) brightness(1.08); }
        }
        @keyframes underlineExpand {
          from { left: 50%; right: 50%; opacity: 0; }
          to { left: 15%; right: 15%; opacity: 1; }
        }
        
        /* 3D Tab Icon styling */
        .tab-icon-deal {
          animation: pulseFire 1.2s infinite;
          color: #FF4B2B !important;
          font-size: 21px !important;
          display: inline-block;
        }
        .tab-icon-deal-inactive {
          color: #94A3B8 !important;
          font-size: 21px !important;
          display: inline-block;
        }
        
        .tab-icon-hot {
          animation: pulseFire 1.2s infinite;
          color: #FF7A00 !important;
          font-size: 21px !important;
          display: inline-block;
        }
        .tab-icon-hot-inactive {
          color: #94A3B8 !important;
          font-size: 21px !important;
          display: inline-block;
        }
        
        .tab-icon-new {
          animation: pulseFire 1.2s infinite;
          color: #0072FF !important;
          font-size: 21px !important;
          display: inline-block;
        }
        .tab-icon-new-inactive {
          color: #94A3B8 !important;
          font-size: 21px !important;
          display: inline-block;
        }
        
        .overlapping-banner-wrapper {
          position: absolute;
          z-index: 25;
          animation: popExplode 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, 
                     floatBanner 4.5s ease-in-out infinite 0.6s,
                     breathingGlow 3s ease-in-out infinite;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .overlapping-banner-wrapper:hover {
          transform: scale(1.08) rotate(0deg) translateY(-2px) !important;
          filter: drop-shadow(0 16px 32px var(--active-glow)) brightness(1.15) !important;
        }
        .overlapping-banner-img {
          height: var(--badge-height, 68px);
          width: auto;
          display: block;
          transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        
        @media (max-width: 768px) {
          .overlapping-banner-img {
            height: var(--badge-height-mobile, 52px);
          }
        }
        
        .badge-glow-ring {
          position: absolute;
          width: 90px;
          height: 90px;
          border-radius: 50%;
          z-index: 22;
          pointer-events: none;
          transform-origin: center;
          animation: ringPulse 2.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        
        .premium-tab-button {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 58px;
          cursor: pointer;
          outline: none;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-sizing: border-box;
          position: relative;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800;
          font-size: 13.5px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border: none;
          background: transparent;
        }
        
        .premium-tab-button.inactive {
          color: #71717A;
        }
        .premium-tab-button.inactive:hover {
          color: #18181B;
          transform: translateY(-1px);
        }
        
        .premium-tab-button.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 12%;
          right: 12%;
          height: 4px;
          background: var(--active-gradient);
          border-radius: 99px 99px 0 0;
          box-shadow: 0 2px 10px var(--active-glow);
          animation: underlineExpand 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .sub-filter-pill {
          transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        .sub-filter-pill:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(0,0,0,0.06) !important;
          border-color: #CBD5E1 !important;
        }
        .sub-filter-pill.active:hover {
          opacity: 0.95;
          transform: translateY(-1px);
        }
        
        @media (max-width: 768px) {
          .premium-tab-button {
            font-size: 11.5px;
            min-height: 52px;
          }
          .premium-tab-button.active::after {
            left: 8%;
            right: 8%;
            height: 3px;
          }
        }
        @media (max-width: 480px) {
          .premium-tab-button {
            font-size: 9.5px;
            min-height: 46px;
            letter-spacing: 0.02em;
          }
        }
      `}</style>

      {/* Explosive Sparkle Particle Ring */}
      <div 
        key={`ring-${mainTab}`} 
        className="badge-glow-ring" 
        style={{
          top: `calc(${activeConfig.badgeTop} + (${activeConfig.badgeHeight} / 2))`,
          left: `calc(${activeConfig.badgeLeft} + 40px)`,
          background: `radial-gradient(circle, ${activeConfig.glowColor} 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {/* Floating Badge */}
      <Link 
        key={`badge-${mainTab}`}
        to="/category" 
        className="overlapping-banner-wrapper"
        style={{
          top: activeConfig.badgeTop,
          left: activeConfig.badgeLeft,
          "--badge-height": activeConfig.badgeHeight,
          "--badge-height-mobile": activeConfig.badgeHeightMobile,
        }}
      >
        <img 
          src={activeConfig.badgeImage} 
          alt={activeConfig.label} 
          className="overlapping-banner-img" 
        />
      </Link>

      <section style={{
        position: "relative",
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#fff",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>

        {/* TAB ROW — Flat seamless tab design */}
        <div style={{
          display: "flex",
          width: "100%",
          alignItems: "stretch",
          backgroundColor: "#fff",
          borderBottom: "1px solid #E2E8F0",
        }}>
          {MAIN_TABS.map((tab) => {
            const isActive = mainTab === tab.id;
            const config = TAB_CONFIGS[tab.id];
            
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setMainTab(tab.id); setActiveCat(null); }}
                className={`premium-tab-button ${isActive ? "active" : "inactive"}`}
                style={{
                  color: isActive ? config.activeColor : config.inactiveColor,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon 
                    name={config.icon} 
                    className={isActive ? `tab-icon-${tab.id}` : `tab-icon-${tab.id}-inactive`} 
                  />
                  <span>{config.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* CONTENT */}
        <div style={{ backgroundColor: "#fff" }}>

          {/* Single clean row of category pills */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "16px 20px 18px",
            borderBottom: "1px solid #F4F4F5",
            backgroundColor: "#FAFAFA",
            flexWrap: "wrap",
          }}>
            {/* "Tất cả" pill */}
            <button
              type="button"
              onClick={() => setActiveCat(null)}
              className={`sub-filter-pill ${activeCat === null ? "active" : "inactive"}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 18px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "12.5px",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                border: "none",
                boxShadow: activeCat === null 
                  ? `0 4px 10px ${activeConfig.glowColor}` 
                  : "0 2px 4px rgba(0,0,0,0.02)",
                ...(activeCat === null ? {
                  background: activeConfig.gradient,
                  color: "#fff",
                } : {
                  backgroundColor: "#fff",
                  color: "#475569",
                  border: "1.5px solid #E2E8F0",
                })
              }}
            >
              <Icon name="apps" style={{ fontSize: 16, color: activeCat === null ? "#fff" : "#94A3B8" }} />
              Tất cả
            </button>

            {/* Dynamic Category pills from API */}
            {categories.map(cat => {
              const isActive = activeCat?.id === cat.id;
              
              // Use BE category image/logo URL if it exists, otherwise fallback to icon string or mapped name
              const useIconUrl = !failedImages[cat.id] && cat.imageUrl;
              const useIconName = cat.icon || getCategoryIconFallback(cat.name);

              const displayName = (cat.name || "").split(" ").map(w =>
                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
              ).join(" ");

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCat(cat)}
                  className={`sub-filter-pill ${isActive ? "active" : "inactive"}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "12.5px",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    border: "none",
                    boxShadow: isActive 
                      ? `0 4px 10px ${activeConfig.glowColor}` 
                      : "0 2px 4px rgba(0,0,0,0.02)",
                    ...(isActive ? {
                      background: activeConfig.gradient,
                      color: "#fff",
                    } : {
                      backgroundColor: "#fff",
                      color: "#475569",
                      border: "1.5px solid #E2E8F0",
                    })
                  }}
                >
                  {useIconUrl ? (
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                      border: isActive ? "none" : "1px solid #E2E8F0",
                      padding: 2,
                      overflow: "hidden",
                      flexShrink: 0
                    }}>
                      <img 
                        src={useIconUrl} 
                        alt={cat.name} 
                        onError={() => setFailedImages(prev => ({ ...prev, [cat.id]: true }))}
                        style={{ 
                          width: "100%", 
                          height: "100%", 
                          objectFit: "contain", 
                          transition: "all 0.2s ease"
                        }} 
                      />
                    </div>
                  ) : (
                    <Icon name={useIconName} style={{ fontSize: 18, color: isActive ? "#fff" : "#94A3B8" }} />
                  )}
                  {displayName}
                </button>
              );
            })}
          </div>

          {/* Products carousel — 5 cards per page */}
          <div style={{ padding: "20px 24px 24px" }}>
            {products.length === 0 && !loading ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 14 }}>
                Không có sản phẩm phù hợp
              </div>
            ) : (
              <ProductCarousel
                products={products}
                visibleCount={VISIBLE_CARDS}
                gap={CARD_GAP}
                loading={loading}
                cardProps={{ showShipping: true }}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
