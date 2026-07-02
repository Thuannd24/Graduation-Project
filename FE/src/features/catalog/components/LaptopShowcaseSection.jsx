import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import ProductCarousel from "./ProductCarousel";
import Icon from "../../../components/common/Icon";
import { getBrandLogo } from "../../../utils/brandLogo";
import { productApi } from "../../../services/productApi";

const RED = "#D70018";

const LAPTOP_TABS = [
  { id: "laptop",   label: "LAPTOP" },
  { id: "monitor",  label: "MÀN HÌNH MÁY TÍNH" },
  { id: "pc",       label: "PC" },
  { id: "access",   label: "PHỤ KIỆN MÁY TÍNH" },
];

export default function LaptopShowcaseSection({ categories }) {
  const [activeTab, setActiveTab]     = useState("laptop");
  const [activeBrand, setActiveBrand] = useState(null);
  const [activeSub, setActiveSub]     = useState(null);
  const [products, setProducts]       = useState([]);
  const [brands, setBrands]           = useState([]);
  const [loading, setLoading]         = useState(false);

  const activeCategory = useMemo(() => {
    if (!categories?.length) return null;
    const tab = activeTab.toLowerCase();
    if (tab === "laptop") {
      return categories.find(c => (c.slug || c.name || "").toLowerCase().includes("laptop"));
    }
    if (tab === "monitor") {
      return categories.find(c => (c.slug || c.name || "").toLowerCase().includes("man-hinh") || (c.slug || c.name || "").toLowerCase().includes("pc"));
    }
    if (tab === "pc") {
      return categories.find(c => (c.slug || c.name || "").toLowerCase().includes("pc"));
    }
    if (tab === "access") {
      return categories.find(c => (c.slug || c.name || "").toLowerCase().includes("phu-kien") || (c.slug || c.name || "").toLowerCase().includes("accessory"));
    }
    return null;
  }, [categories, activeTab]);

  const subCategories = activeCategory?.children || [];

  useEffect(() => {
    if (activeCategory?.id) {
      productApi.listBrandsByCategory(activeCategory.id)
        .then(setBrands)
        .catch(() => setBrands([]));
    } else {
      setBrands([]);
    }
  }, [activeCategory]);

  const loadProducts = useCallback((brand, subId) => {
    setLoading(true);
    const targetCatId = subId || activeCategory?.id;
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
  }, [activeCategory]);

  useEffect(() => {
    loadProducts(activeBrand, activeSub?.id);
  }, [activeBrand, activeSub, loadProducts]);

  const displayProducts = products;

  return (
    <section style={{
      display: "flex",
      gap: 12,
      backgroundColor: "#fff",
      borderRadius: 12,
      border: "1px solid #EDEDED",
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
    }}>
      {/* ── Left sidebar ── */}
      <div style={{
        width: 200,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 0 12px 12px",
      }}>
        {/* Laptop AI banner */}
        <div style={{
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(180deg, #1E3A5F 0%, #0F2744 100%)",
          padding: "16px 12px",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>
            Laptop AI
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#93C5FD", marginTop: 6, lineHeight: 1.4 }}>
            Giảm thêm đến<br />2 Triệu
          </div>
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <Link to="/category?activeCategory=laptop" style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 6,
              backgroundColor: "#fff",
              color: "#0F2744",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}>
              MUA NGAY
            </Link>
          </div>
        </div>

        {/* Mac for students */}
        <div style={{
          borderRadius: 10,
          border: "1px solid #E5E7EB",
          backgroundColor: "#fff",
          padding: "12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <Icon name="school" style={{ fontSize: 24, color: "#374151" }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#374151" }}>Mac Cho</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: RED }}>Sinh Viên</div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 16px 16px 0" }}>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          borderBottom: "2px solid #F0F0F0",
          marginBottom: 14,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}>
          {LAPTOP_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setActiveBrand(null); setActiveSub(null); }}
                style={{
                  padding: "8px 16px 10px",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  color: isActive ? RED : "#374151",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? `3px solid ${RED}` : "3px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Subcategory icon row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}>
          <div style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            flex: 1,
          }}>
            {subCategories.map(sub => {
              const isActive = activeSub?.id === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setActiveSub(isActive ? null : sub)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <div style={{
                    width: 72,
                    height: 56,
                    borderRadius: 8,
                    border: `1px solid ${isActive ? RED : "#E5E7EB"}`,
                    backgroundColor: "#F9FAFB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 0.15s",
                    overflow: "hidden"
                  }}>
                    {sub.imageUrl ? (
                      <img src={sub.imageUrl} alt={sub.name} style={{ width: "80%", height: "80%", objectFit: "contain" }} />
                    ) : (
                      <Icon name={sub.icon || "devices"} style={{ fontSize: 22, color: isActive ? RED : "#6B7280" }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: isActive ? RED : "#6B7280",
                    textAlign: "center",
                    maxWidth: 72,
                    lineHeight: 1.25,
                  }}>
                    {sub.name}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1px solid #E5E7EB", backgroundColor: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
          }}>
            <Icon name="chevron_right" style={{ fontSize: 18, color: "#6B7280" }} />
          </button>
        </div>

        {/* Brand pills */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          marginBottom: 14,
        }}>
          {brands.map(brand => {
            const logo = getBrandLogo(brand.name);
            const isActive = activeBrand === brand.name;
            return (
              <button
                key={brand.id}
                type="button"
                onClick={() => setActiveBrand(isActive ? null : brand.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: `1px solid ${isActive ? RED : "#E5E7EB"}`,
                  backgroundColor: isActive ? "#FFF1F2" : "#fff",
                  color: isActive ? RED : "#374151",
                  fontWeight: 700,
                  fontSize: 11.5,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={brand.name} style={{ maxHeight: 16, maxWidth: 60, objectFit: "contain" }} />
                ) : logo ? (
                  <span style={{ display: "flex", alignItems: "center", fontSize: 0 }}>{logo}</span>
                ) : brand.name}
              </button>
            );
          })}
          <Link
            to="/category?activeCategory=laptop"
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#288AD6",
              fontWeight: 700,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            Xem tất cả
            <Icon name="chevron_right" style={{ fontSize: 15 }} />
          </Link>
        </div>

        {/* Product carousel */}
        <ProductCarousel
          products={displayProducts}
          visibleCount={4}
          gap={10}
          cardProps={{ variant: "laptop", showShipping: true }}
        />
      </div>
    </section>
  );
}
