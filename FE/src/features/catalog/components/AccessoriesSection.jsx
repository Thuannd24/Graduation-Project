import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon";

const ACC_IMG = {
  a1:  "https://images.unsplash.com/photo-1588156979435-379b9d802b0a?w=80&h=80&fit=crop&auto=format",
  a2:  "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=80&h=80&fit=crop&auto=format",
  a3:  "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=80&h=80&fit=crop&auto=format",
  a4:  "https://images.unsplash.com/photo-1601784551445-20e9ef69285a?w=80&h=80&fit=crop&auto=format",
  a5:  "https://images.unsplash.com/photo-1601784551445-20e9ef69285a?w=80&h=80&fit=crop&auto=format",
  a6:  "https://images.unsplash.com/photo-1597872200969-2b65d08bb8ca?w=80&h=80&fit=crop&auto=format",
  a7:  "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=80&h=80&fit=crop&auto=format",
  a8:  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop&auto=format",
  a9:  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop&auto=format",
  a10: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=80&h=80&fit=crop&auto=format",
  a11: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=80&h=80&fit=crop&auto=format",
  a12: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=80&h=80&fit=crop&auto=format",
  a13: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=80&h=80&fit=crop&auto=format",
  a14: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=80&h=80&fit=crop&auto=format",
  a15: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=80&h=80&fit=crop&auto=format",
  a16: "https://images.unsplash.com/photo-1625948515291-69613efd288f?w=80&h=80&fit=crop&auto=format",
  a17: "https://images.unsplash.com/photo-1601784551445-20e9ef69285a?w=80&h=80&fit=crop&auto=format",
  a18: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=80&h=80&fit=crop&auto=format",
};

export default function AccessoriesSection({ categories }) {
  const accessoryCategory = categories?.find(c => {
    const name = (c.name || c.label || "").toLowerCase();
    const slug = (c.slug || "").toLowerCase();
    return slug.includes("phu-kien") || slug.includes("accessory") || name.includes("phụ kiện");
  });

  const cats = accessoryCategory?.children?.length 
    ? accessoryCategory.children 
    : categories?.filter(c => {
        const name = (c.name || c.label || "").toLowerCase();
        const slug = (c.slug || "").toLowerCase();
        return !slug.includes("dien-thoai") && !slug.includes("phone") && !slug.includes("laptop");
      }) || [];

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

  return (
    <section style={{ marginTop: 24 }}>
      {/* CSS Styling Block */}
      <style>{`
        .accessories-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          background-color: #E5E7EB; /* Grid border line color */
          gap: 1px;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .accessories-item {
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
        .accessories-item-empty {
          cursor: default;
          pointer-events: none;
        }
        .accessories-item:not(.accessories-item-empty):hover {
          background-color: #F9FAFB;
        }
        .accessories-item:not(.accessories-item-empty):hover .accessories-item-title {
          color: #D70018; /* Hover text color */
        }
        .accessories-item:not(.accessories-item-empty):hover .accessories-item-img {
          transform: translateY(-3px);
        }
        .accessories-img-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          background-color: #ffffff;
        }
        .accessories-item-img {
          width: 56px;
          height: 56px;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .accessories-item-title {
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
          .accessories-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        @media (max-width: 768px) {
          .accessories-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .accessories-item {
            padding: 10px 12px;
            height: 76px;
            gap: 10px;
          }
          .accessories-img-container, .accessories-item-img {
            width: 46px;
            height: 46px;
          }
          .accessories-item-title {
            font-size: 12.5px;
          }
          .accessories-title-row h2 {
            font-size: 14px !important;
          }
        }
        @media (max-width: 480px) {
          .accessories-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .accessories-item {
            padding: 8px 10px;
            height: 70px;
            gap: 8px;
          }
          .accessories-img-container, .accessories-item-img {
            width: 40px;
            height: 40px;
          }
          .accessories-item-title {
            font-size: 11.5px;
          }
        }
      `}</style>

      {/* Header row */}
      <div 
        className="accessories-title-row"
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
          SẮM THÊM PHỤ KIỆN CHẤT LƯỢNG
        </h2>
        <span style={{ color: "#D1D5DB", fontWeight: 300, fontSize: 18 }}>|</span>
        <Link
          to="/category?activeCategory=phu-kien"
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
      <div className="accessories-grid">
        {paddedCats.map((cat, idx) => {
          if (cat.isEmpty) {
            return (
              <div key={cat.id} className="accessories-item accessories-item-empty" />
            );
          }
          const hasImg = !!(cat.imageUrl || ACC_IMG[cat.id]);
          return (
            <Link
              key={cat.id}
              to={`/category?activeCategory=${cat.slug || encodeURIComponent(cat.name || "")}`}
              className="accessories-item"
            >
              <div className="accessories-img-container">
                <img
                  src={cat.imageUrl || ACC_IMG[cat.id] || ""}
                  alt={cat.name}
                  className="accessories-item-img"
                  onError={e => {
                    e.target.style.display = "none";
                    if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                  }}
                />
                <Icon
                  name={cat.icon || "category"}
                  style={{
                    fontSize: 28,
                    color: "#9CA3AF",
                    display: hasImg ? "none" : "flex",
                  }}
                />
              </div>
              <span className="accessories-item-title">
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
