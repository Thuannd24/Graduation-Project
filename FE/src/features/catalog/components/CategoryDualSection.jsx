import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { productApi } from "../../../services/productApi";
import ProductCarousel from "./ProductCarousel";
import { getBrandLogo } from "../../../utils/brandLogo";
import Icon from "../../../components/common/Icon";

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
        {/* Promo banner HONOR style */}
        <div style={{
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(180deg, #E8F8FF 0%, #C8EEFF 100%)",
          padding: "14px 12px",
          minHeight: 280,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>
            HONOR X7D
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginTop: 4 }}>
            Chỉ 6.09 Triệu
          </div>
          <div style={{ fontSize: 11, color: "#374151", marginTop: 6, lineHeight: 1.5 }}>
            Tặng Sim 5G<br />
            Giảm thêm cho S-Student
          </div>
          <div style={{
            marginTop: "auto",
            paddingTop: 12,
          }}>
            <Link to="/category" style={{
              display: "inline-block",
              padding: "6px 18px",
              borderRadius: 6,
              backgroundColor: "#22C55E",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}>
              MUA NGAY
            </Link>
          </div>
        </div>

        {/* Bottom slogan banner */}
        <div style={{
          borderRadius: 10,
          overflow: "hidden",
          background: "linear-gradient(135deg, #E8F4FF 0%, #D0EAFF 100%)",
          padding: "12px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: RED, lineHeight: 1.4 }}>
            Luôn Ở Cạnh.<br />
            <span style={{ color: "#22C55E" }}>Theo Cách Riêng.</span>
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
        }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setActiveBrand(null); setActiveSub(null); }}
                style={{
                  padding: "8px 20px 10px",
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.03em",
                  color: isActive ? RED : "#374151",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? `3px solid ${RED}` : "3px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
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
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            flex: 1,
          }}>
            {(activeCategory?.children || []).map(sub => {
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
                  <span style={{ display: "flex", alignItems: "center", fontSize: 0 }}>
                    {logo}
                  </span>
                ) : brand.name}
              </button>
            );
          })}
          <Link
            to={`/category?activeCategory=${activeCategory?.slug || "dien-thoai"}`}
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
        {loading ? (
          <ProductCarousel products={[]} visibleCount={4} gap={10} loading />
        ) : products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 13 }}>Không có sản phẩm</div>
        ) : (
          <ProductCarousel
            products={products}
            visibleCount={4}
            gap={10}
            cardProps={{ showShipping: true }}
          />
        )}
      </div>
    </section>
  );
}
