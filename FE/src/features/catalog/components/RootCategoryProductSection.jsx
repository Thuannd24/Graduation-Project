import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import ProductCarousel from "./ProductCarousel";
import Icon from "../../../components/common/Icon";
import { getBrandLogo } from "../../../utils/brandLogo";
import { productApi } from "../../../services/productApi";
import { formatCategoryName } from "../utils/categoryUtils.js";

// Khối trang chủ cho MỘT danh mục gốc bất kỳ (sàn đa ngành): danh mục con + thương hiệu + sản phẩm.
// Thay cho LaptopShowcaseSection cũ (shop điện tử, đã xoá) — không ghi cứng tên/slug danh mục nào.
export default function RootCategoryProductSection({ category }) {
  const [activeBrand, setActiveBrand] = useState(null);
  const [activeSub, setActiveSub]     = useState(null);
  const [products, setProducts]       = useState([]);
  const [brands, setBrands]           = useState([]);
  const [loading, setLoading]         = useState(false);

  const subCategories = (category?.children || []).filter((c) => c.active !== false);
  const targetCategory = activeSub || category;

  useEffect(() => {
    if (!targetCategory?.id) return;
    productApi.listBrandsByCategory(targetCategory.id)
      .then(setBrands)
      .catch(() => setBrands([]));
  }, [targetCategory?.id]);

  const loadProducts = useCallback((brand, catId) => {
    if (!catId) return;
    setLoading(true);
    productApi
      .listProducts({ categoryId: String(catId) })
      .then((all) => {
        const out = brand
          ? all.filter((p) => String(p.brand || "").toLowerCase() === brand.toLowerCase())
          : all;
        setProducts(out.slice(0, 8));
      })
      .catch((err) => {
        console.error("Error loading products:", err);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts(activeBrand, targetCategory?.id);
  }, [activeBrand, targetCategory?.id, loadProducts]);

  if (!category?.id) return null;

  return (
    <section
      className="root-cat-shelf"
      style={{
        backgroundColor: "#fff",
        borderRadius: "16px",
        border: "1px solid #EDEDED",
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        padding: "16px",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .root-cat-shelf {
            padding: 10px !important;
            border-radius: 12px !important;
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
      `}</style>

      {/* Tiêu đề = tên danh mục gốc */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "2px solid #E5E7EB",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            height: 52,
            display: "flex",
            alignItems: "center",
            padding: "0 4px",
            fontSize: "15px",
            fontWeight: 800,
            letterSpacing: "0.02em",
            color: "#D70018",
            borderBottom: "2px solid #D70018",
            marginBottom: "-2px",
            textTransform: "uppercase",
          }}
        >
          {formatCategoryName(category.name)}
        </h2>
      </div>

      {/* Danh mục con (bấm để lọc, bấm lại để bỏ lọc) */}
      {subCategories.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center" }}>
          <div
            className="hide-scrollbar"
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              flex: 1,
              paddingBottom: 4,
            }}
          >
            {subCategories.map((sub) => {
              const isActive = activeSub?.id === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => { setActiveSub(isActive ? null : sub); setActiveBrand(null); }}
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
                    <Icon name={sub.icon || "category"} style={{ fontSize: 16, color: isActive ? "#D70018" : "#4B5563" }} />
                  )}
                  <span style={{ fontSize: "12px", fontWeight: 600, color: isActive ? "#D70018" : "#374151" }}>
                    {sub.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Thương hiệu + Xem tất cả */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div
          className="hide-scrollbar"
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            flex: 1,
            paddingBottom: 2,
          }}
        >
          {brands.map((brand) => {
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
                  <span style={{ display: "flex", alignItems: "center", height: 26, fontSize: 0 }}>{logo}</span>
                ) : (
                  <span>{brand.name}</span>
                )}
              </button>
            );
          })}
        </div>

        <Link
          to={`/category?activeCategory=${targetCategory.slug || encodeURIComponent(targetCategory.name || "")}`}
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
            marginLeft: 12,
          }}
        >
          Xem tất cả
          <Icon name="chevron_right" style={{ fontSize: 16 }} />
        </Link>
      </div>

      {/* Sản phẩm */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ProductCarousel products={[]} visibleCount={4} gap={12} loading />
        </div>
      ) : products.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "#9CA3AF",
            fontSize: "14px",
            fontWeight: 500,
            backgroundColor: "#F9FAFB",
            borderRadius: "12px",
            border: "1px dashed #E5E7EB",
          }}
        >
          Không có sản phẩm nào thuộc bộ lọc này
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ProductCarousel products={products.slice(0, 4)} visibleCount={4} gap={12} cardProps={{ showShipping: true }} />
          {products.length > 4 && (
            <ProductCarousel products={products.slice(4, 8)} visibleCount={4} gap={12} cardProps={{ showShipping: true }} />
          )}
        </div>
      )}
    </section>
  );
}
