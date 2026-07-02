import { Link } from "react-router-dom";
import Icon from "../../../components/common/Icon";
import { MOCK_HOME_APPLIANCE_CATS, MOCK_HEALTH_CATS } from "../data/mockData";

const BRANDS = ["Roborock", "Xiaomi", "Dreame", "Tineco", "Sharp"];

function SubCatGrid({ items, title, showSeeAll, seeAllLink }) {
  const rows = [items.slice(0, 4), items.slice(4, 8), items.slice(8, 11)];
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 1,
        backgroundColor: "#F0F0F0",
        border: "1px solid #F0F0F0",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {items.map((cat, i) => (
          <Link
            key={cat.id}
            to={`/category?activeCategory=${cat.id}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "14px 8px",
              backgroundColor: "#fff",
              textDecoration: "none",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#F9FAFB"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; }}
          >
            <div style={{
              width: 48, height: 48,
              backgroundColor: "#F3F4F6",
              borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name={cat.icon || "category"} style={{ fontSize: 26, color: "#4B5563" }} />
            </div>
            <span style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "#374151",
              textAlign: "center",
              lineHeight: 1.3,
            }}>
              {cat.name}
            </span>
          </Link>
        ))}
        {/* See all cell */}
        <Link
          to={seeAllLink || "/category"}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "14px 8px",
            backgroundColor: "#fff",
            textDecoration: "none",
          }}
        >
          <div style={{
            width: 40, height: 40,
            borderRadius: "50%",
            border: "2px solid #3B82F6",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="chevron_right" style={{ fontSize: 20, color: "#3B82F6" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>Xem tất cả</span>
        </Link>
      </div>
    </div>
  );
}

export default function HomeApplianceSection() {
  return (
    <section style={{
      backgroundColor: "#fff",
      borderRadius: 16,
      border: "1px solid #F0F0F0",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      padding: "20px 24px 24px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 900,
          color: "#111827",
          textTransform: "uppercase",
        }}>
          ĐỒ GIA DỤNG
        </h2>
        {/* Brand filter pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {BRANDS.map(b => (
            <Link
              key={b}
              to={`/category?brand=${b}`}
              style={{
                padding: "3px 12px",
                borderRadius: 999,
                border: "1px solid #E5E7EB",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#374151",
                textDecoration: "none",
                backgroundColor: "#fff",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#D70018"; e.currentTarget.style.color = "#D70018"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#374151"; }}
            >
              {b}
            </Link>
          ))}
          <Link to="/category?activeCategory=gia-dung" style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", textDecoration: "none", display: "flex", alignItems: "center" }}>
            Xem tất cả <Icon name="chevron_right" style={{ fontSize: 15 }} />
          </Link>
        </div>
      </div>

      {/* 2 promo banners */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{
          borderRadius: 12,
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          padding: "18px 20px",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 90,
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.3 }}>Chăm Nhà<br />Chuẩn Hiện Đại</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>Giao - Lắp miễn phí</div>
          <div style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            textAlign: "right",
          }}>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>Trả góp 0%</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>250K</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Trả góp 0% | 12 tháng</div>
            <div style={{
              marginTop: 6,
              padding: "5px 14px",
              backgroundColor: "#22C55E",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-block",
            }}>MUA NGAY</div>
          </div>
        </div>
        <div style={{
          borderRadius: 12,
          background: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 90,
          position: "relative",
          overflow: "hidden",
          border: "1px solid #FBD5E8",
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#831843", lineHeight: 1.3 }}>Chăm Sóc<br />Chuẩn Chuyên Gia</div>
          <div style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            textAlign: "right",
          }}>
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Chỉ từ</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#7C3AED" }}>88K</div>
            <div style={{
              marginTop: 6,
              padding: "5px 14px",
              backgroundColor: "#7C3AED",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              display: "inline-block",
            }}>MUA NGAY</div>
          </div>
        </div>
      </div>

      {/* 2 grids side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SubCatGrid items={MOCK_HOME_APPLIANCE_CATS} seeAllLink="/category?activeCategory=gia-dung" />
        <SubCatGrid items={MOCK_HEALTH_CATS} seeAllLink="/category?activeCategory=lam-dep" />
      </div>
    </section>
  );
}
