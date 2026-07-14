import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { productApi } from "../../../services/productApi";
import ProductCarousel from "./ProductCarousel";
import { getBrandLogo } from "../../../utils/brandLogo";
import Icon from "../../../components/common/Icon";
import leftBanner from "../../../assets/images/left.webp";

const RED = "#D70018";
const PHONE_BRANDS = ["Apple", "Samsung", "Xiaomi", "OPPO", "HONOR", "TECNO", "realme", "Nokia", "Infinix", "Nothing"];

const DEFAULT_TABS = [
  { id: "phone",  label: "ĐIỆN THOẠI",    slug: "dien-thoai" },
  { id: "tablet", label: "MÀN HÌNH MÁY TÍNH", slug: "may-tinh-bang" },
];

export default function CategoryDualSection({ categories }) {
  const [activeTab, setActiveTab]     = useState("phone");
  const [activeBrand, setActiveBrand] = useState(null);
  const [activeSub, setActiveSub]     = useState(null);
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(true);

  const tabs = useMemo(() => {
    return categories?.length >= 2
      ? categories.slice(0, 2).map((c, i) => ({
          id: i === 0 ? "phone" : "tablet",
          label: (c.name || "").toUpperCase(),
          slug: c.slug || c.name,
          category: c,
        }))
      : DEFAULT_TABS.map(t => ({ ...t, category: null }));
  }, [categories]);

  const activeCategory = tabs.find(t => t.id === activeTab)?.category;

  const [brands, setBrands] = useState([]);

  useEffect(() => {
    if (activeCategory?.id) {
      productApi.listBrandsByCategory(activeCategory.id)
        .then(setBrands)
        .catch(() => setBrands([]));
    } else {
      productApi.listBrands()
        .then(setBrands)
        .catch(() => setBrands([]));
    }
  }, [activeCategory]);

  const loadProducts = useCallback((tabId, brand, subId) => {
    setLoading(true);
    const activeCat = tabs.find(t => t.id === tabId)?.category;
    const targetCatId = subId || activeCat?.id;
    const params = targetCatId ? { categoryId: String(targetCatId) } : {};
    productApi
      .listProducts(params)
      .then((all) => {
        let out = brand
          ? all.filter((p) => String(p.brand || "").toLowerCase() === brand.toLowerCase())
          : all;
        setProducts(out.slice(0, 8));
      })
      .catch((err) => {
        console.error("Error loading products:", err);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, [tabs]);

  useEffect(() => {
    loadProducts(activeTab, activeBrand, activeSub?.id);
  }, [activeTab, activeBrand, activeSub, loadProducts]);

  return (
    <section 
      className="category-shelf-container"
      style={{
        display: "flex",
        gap: 16,
        backgroundColor: "#fff",
        borderRadius: "16px",
        border: "1px solid #EDEDED",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        padding: "16px",
        position: "relative"
      }}
    >
      {/* CSS styling for responsiveness and hover transitions */}
      <style>{`
        .category-shelf-container {
          transition: all 0.3s ease;
        }
        @media (max-width: 768px) {
          .category-shelf-sidebar {
            display: none !important;
          }
          .category-shelf-container {
            padding: 10px !important;
            border-radius: 12px !important;
          }
          .category-shelf-main {
            padding: 0 !important;
          }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .brand-pill-btn {
          transition: all 0.15s ease-in-out !important;
        }
        .brand-pill-btn:hover {
          border-color: #D70018 !important;
          color: #D70018 !important;
          background-color: #FFF1F2 !important;
        }
        .sub-cat-btn {
          transition: all 0.2s ease !important;
        }
        .sub-cat-btn:hover {
          border-color: #D70018 !important;
          background-color: #FFF1F2 !important;
        }
        .view-all-link:hover {
          text-decoration: underline !important;
          color: #1D4ED8 !important;
        }
        .sidebar-banner-hover img {
          transition: transform 0.3s ease, filter 0.3s ease !important;
        }
        .sidebar-banner-hover:hover img {
          transform: scale(1.02);
          filter: brightness(0.95);
        }
      `}</style>

      {/* ── Left sidebar (Hidden on Mobile) ── */}
      <div 
        className="category-shelf-sidebar"
        style={{
          width: 210,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Link 
          to="/category?activeCategory=dien-thoai" 
          style={{ 
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
          }}
          className="sidebar-banner-hover"
        >
          <img 
            src={leftBanner} 
            alt="Left Promo Banner" 
            style={{ 
              width: "100%", 
              height: "100%", 
              objectFit: "cover",
              display: "block"
            }} 
          />
        </Link>
      </div>

      {/* ── Main content ── */}
      <div 
        className="category-shelf-main"
        style={{ 
          flex: 1, 
          minWidth: 0,
        }}
      >
        {/* Tab bar (Red underline, borderless container) */}
        <div style={{
          display: "flex",
          borderBottom: "2px solid #E5E7EB",
          marginBottom: 16,
          backgroundColor: "#fff"
        }}>
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setActiveBrand(null); setActiveSub(null); }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 52,
                  fontSize: "15px",
                  fontWeight: 800,
                  letterSpacing: "0.03em",
                  color: isActive ? "#D70018" : "#4B5563",
                  background: isActive ? "linear-gradient(to top, rgba(215, 0, 24, 0.08) 0%, rgba(255, 255, 255, 0) 100%)" : "none",
                  border: "none",
                  borderBottom: isActive ? "2px solid #D70018" : "2px solid transparent",
                  borderRight: idx < tabs.length - 1 ? "1px solid #E5E7EB" : "none",
                  marginBottom: "-2px",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  transition: "all 0.2s"
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Subcategory icons row */}
        {(activeCategory?.children || []).length > 0 && (
          <div style={{
            position: "relative",
            marginBottom: 14,
            display: "flex",
            alignItems: "center"
          }}>
            <div 
              className="hide-scrollbar"
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                flex: 1,
                paddingBottom: 4
              }}
            >
              {(activeCategory?.children || []).map(sub => {
                const isActive = activeSub?.id === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setActiveSub(isActive ? null : sub)}
                    className="sub-cat-btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${isActive ? "#D70018" : "#F3F4F6"}`,
                      backgroundColor: isActive ? "#FFF1F2" : "#F3F4F6",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {sub.imageUrl ? (
                      <img src={sub.imageUrl} alt={sub.name} style={{ width: 22, height: 22, objectFit: "contain" }} />
                    ) : (
                      <Icon name={sub.icon || "devices"} style={{ fontSize: 16, color: isActive ? "#D70018" : "#4B5563" }} />
                    )}
                    <span style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isActive ? "#D70018" : "#374151"
                    }}>
                      {sub.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Brand pills (Horizontal scrollable with "View All" aligned right) */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          borderTop: (activeCategory?.children || []).length > 0 ? "none" : "none"
        }}>
          <div 
            className="hide-scrollbar"
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              flex: 1,
              paddingBottom: 2
            }}
          >
            {brands.map(brand => {
              const logo = getBrandLogo(brand.name);
              const isActive = activeBrand === brand.name;
              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setActiveBrand(isActive ? null : brand.name)}
                  className="brand-pill-btn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 18px",
                    height: 38,
                    boxSizing: "border-box",
                    borderRadius: "20px",
                    border: `1px solid ${isActive ? "#D70018" : "#E5E7EB"}`,
                    backgroundColor: isActive ? "#FFF1F2" : "#ffffff",
                    color: isActive ? "#D70018" : "#4B5563",
                    fontWeight: 700,
                    fontSize: "13.5px",
                    cursor: "pointer",
                    flexShrink: 0,
                    boxShadow: isActive ? "0 2px 6px rgba(215, 0, 24, 0.06)" : "none",
                  }}
                >
                  {brand.logoUrl ? (
                    <img src={brand.logoUrl} alt={brand.name} style={{ maxHeight: 26, maxWidth: 85, objectFit: "contain" }} />
                  ) : logo ? (
                    <span style={{ display: "flex", alignItems: "center", height: 26, fontSize: 0 }}>
                      {logo}
                    </span>
                  ) : (
                    <span>{brand.name}</span>
                  )}
                </button>
              );
            })}
          </div>

          <Link
            to={`/category?activeCategory=${activeCategory?.slug || "dien-thoai"}`}
            className="view-all-link"
            style={{
              fontSize: "13px",
              color: "#288AD6",
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 2,
              flexShrink: 0,
              marginLeft: 12
            }}
          >
            Xem tất cả
            <Icon name="chevron_right" style={{ fontSize: 16 }} />
          </Link>
        </div>

        {/* Product carousel grid */}
        {loading ? (
          <ProductCarousel products={[]} visibleCount={4} gap={12} loading />
        ) : products.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "48px 0", 
            color: "#9CA3AF", 
            fontSize: "14px",
            fontWeight: 500,
            backgroundColor: "#F9FAFB",
            borderRadius: "12px",
            border: "1px dashed #E5E7EB"
          }}>
            Không có sản phẩm nào thuộc bộ lọc này
          </div>
        ) : (
          <ProductCarousel
            products={products}
            visibleCount={4}
            gap={12}
            cardProps={{ showShipping: true }}
          />
        )}
      </div>
    </section>
  );
}
