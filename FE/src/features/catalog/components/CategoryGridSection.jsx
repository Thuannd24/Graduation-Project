import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon";
import { getRootCategories } from "../utils/categoryUtils.js";

const FALLBACK_IMG = "https://placehold.co/56x56/f8f9fb/6b7280?text=SP";

// Lưới "Danh mục nổi bật": mọi danh mục GỐC đang active, theo sortOrder — đúng với mọi catalog.
// Thay cho AccessoriesSection cũ (chỉ tìm danh mục "phụ kiện" của shop điện tử, đã xoá).
export default function CategoryGridSection({ categories }) {
  const cats = getRootCategories(categories).filter((c) => !c.parentId);

  // Pad categories list to a multiple of 12 (divisible by 6, 4, 3, 2 for responsive layouts)
  const getPaddedCats = (items) => {
    if (!items || items.length === 0) return [];
    const targetLength = Math.max(12, Math.ceil(items.length / 12) * 12);
    const padded = [...items];
    while (padded.length < targetLength) {
      padded.push({
        id: `empty-${padded.length}`,
        isEmpty: true,
        name: "",
      });
    }
    return padded;
  };

  const paddedCats = getPaddedCats(cats);
  if (paddedCats.length === 0) return null;

  return (
    <section style={{ marginTop: 24 }}>
      {/* CSS Styling Block */}
      <style>{`
        .catgrid-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          background-color: #E5E7EB; /* Grid border line color */
          gap: 1px;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .catgrid-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background-color: #ffffff;
          text-decoration: none;
          height: 84px;
          box-sizing: border-box;
          transition: background-color 0.2s ease, color 0.2s ease;
        }
        .catgrid-item-empty {
          cursor: default;
          pointer-events: none;
        }
        .catgrid-item:not(.catgrid-item-empty):hover {
          background-color: #F9FAFB;
        }
        .catgrid-item:not(.catgrid-item-empty):hover .catgrid-item-title {
          color: #D70018; /* Hover text color */
        }
        .catgrid-item:not(.catgrid-item-empty):hover .catgrid-item-img {
          transform: translateY(-3px);
        }
        .catgrid-img-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          background-color: #ffffff;
        }
        .catgrid-item-img {
          width: 56px;
          height: 56px;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .catgrid-item-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #1F2937;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        @media (max-width: 1024px) {
          .catgrid-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        @media (max-width: 768px) {
          .catgrid-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .catgrid-item {
            padding: 10px 12px;
            height: 76px;
            gap: 10px;
          }
          .catgrid-img-container, .catgrid-item-img {
            width: 46px;
            height: 46px;
          }
          .catgrid-item-title {
            font-size: 12.5px;
          }
          .catgrid-title-row h2 {
            font-size: 14px !important;
          }
        }
        @media (max-width: 480px) {
          .catgrid-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .catgrid-item {
            padding: 8px 10px;
            height: 70px;
            gap: 8px;
          }
          .catgrid-img-container, .catgrid-item-img {
            width: 40px;
            height: 40px;
          }
          .catgrid-item-title {
            font-size: 11.5px;
          }
        }
      `}</style>

      {/* Header row */}
      <div 
        className="catgrid-title-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <h2 style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 900,
          color: "#111827",
          letterSpacing: "0.01em",
          textTransform: "uppercase",
        }}>
          DANH MỤC NỔI BẬT
        </h2>
        <span style={{ color: "#D1D5DB", fontWeight: 300, fontSize: 18 }}>|</span>
        <Link
          to="/category"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            fontSize: 13,
            color: "#288AD6",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Xem tất cả
          <Icon name="chevron_right" style={{ fontSize: 16 }} />
        </Link>
      </div>

      {/* Flat Grid structure */}
      <div className="catgrid-grid">
        {paddedCats.map((cat, idx) => {
          if (cat.isEmpty) {
            return (
              <div key={cat.id} className="catgrid-item catgrid-item-empty" />
            );
          }
          return (
            <Link
              key={cat.id}
              to={`/category?activeCategory=${cat.slug || encodeURIComponent(cat.name || "")}`}
              className="catgrid-item"
            >
              <div className="catgrid-img-container">
                <img
                  src={cat.imageUrl || FALLBACK_IMG}
                  alt={cat.name}
                  className="catgrid-item-img"
                  onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMG; }}
                />
              </div>
              <span className="catgrid-item-title">
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
