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

  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };
  const rows = chunkArray(cats, 6);

  return (
    <section>
      {/* Header outside box */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
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

      {/* Grid box 3 rows x 6 cols */}
      <div style={{
        backgroundColor: "#fff",
        borderRadius: 10,
        border: "1px solid #EEEEEE",
        overflow: "hidden",
      }}>
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              borderTop: rowIdx > 0 ? "1px solid #EEEEEE" : "none",
            }}
          >
            {row.map((cat, colIdx) => {
              const hasImg = !!(cat.imageUrl || ACC_IMG[cat.id]);
              return (
                <Link
                  key={cat.id}
                  to={`/category?activeCategory=${cat.slug || encodeURIComponent(cat.name || "")}`}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 12px",
                    textDecoration: "none",
                    borderRight: colIdx < row.length - 1 ? "1px solid #EEEEEE" : "none",
                    transition: "background-color 0.15s",
                    minHeight: 72,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FAFAFA"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <img
                    src={cat.imageUrl || ACC_IMG[cat.id] || ""}
                    alt={cat.name}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                    onError={e => {
                      e.target.style.display = "none";
                      if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                    }}
                  />
                  <Icon
                    name={cat.icon || "category"}
                    style={{
                      fontSize: 28,
                      color: "#6B7280",
                      display: hasImg ? "none" : "flex",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#374151",
                    lineHeight: 1.35,
                  }}>
                    {cat.name}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
