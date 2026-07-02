import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { productApi } from "../../../services/productApi";
import ProductCarousel from "./ProductCarousel";
import Icon from "../../../components/common/Icon";
import { calculateDiscountPercent } from "../../../utils/format";

const MAIN_TABS = [
  { id: "deal", inactiveLabel: "DEAL SỐC MỖI NGÀY" },
  { id: "hot",  inactiveLabel: "SẢN PHẨM HOT TREND" },
  { id: "new",  inactiveLabel: "HÀNG MỚI VỀ" },
];

const SUB_FILTERS = [
  { id: "all", name: "Tất cả",           icon: "apps"              },
  { id: "cap", name: "Củ cáp",           icon: "cable"             },
  { id: "mouse", name: "Chuột, bàn phím", icon: "keyboard"          },
  { id: "pin", name: "Sạc dự phòng",     icon: "battery_charging_full" },
  { id: "op", name: "Ốp lưng",           icon: "phone_iphone"      },
  { id: "dan", name: "Dán màn hình",     icon: "tablet_mac"        },
  { id: "usb", name: "Thẻ nhớ, USB",     icon: "usb"               },
];

const BORDER = "#4A90E2";
const RED = "#D70018";
const TAB_BLUE = "#288AD6";
const GLOSSY_GRADIENT = "linear-gradient(to bottom, #00a2ff 0%, #0078e8 48%, #0052d4 100%)";
const VISIBLE_CARDS = 5;
const CARD_GAP = 12;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function TabBadge({ tabId }) {
  const badgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: GLOSSY_GRADIENT,
    borderRadius: 10,
    padding: "9px 26px",
    color: "#fff",
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: "0.06em",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.55), 0 2px 8px rgba(0,82,212,0.38)",
    textShadow: "0 0 8px rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.15)",
  };

  if (tabId === "deal") {
    return (
      <span style={{ ...badgeStyle, gap: 7 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🔥</span>
        <span>DEAL SỐC MỖI NGÀY</span>
      </span>
    );
  }
  if (tabId === "hot") {
    return (
      <span style={{ ...badgeStyle, gap: 9 }}>
        <span>SẢN PHẨM</span>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🔥</span>
        <span>HOT TREND</span>
      </span>
    );
  }
  return (
    <span style={badgeStyle}>
      HÀNG MỚI VỀ
    </span>
  );
}

export default function FlashDealSection({ products: apiProducts, loading: apiLoading }) {
  const [mainTab, setMainTab] = useState("deal");
  const [activeCat, setActiveCat] = useState(null);
  const [activeSub, setActiveSub] = useState("all");
  const [categories, setCategories] = useState([]);

  const products = apiProducts ?? [];
  const loading = apiLoading;

  useEffect(() => {
    productApi.listCategories()
      .then(c => setCategories(c.slice(0, 7)))
      .catch(() => setCategories([]));
  }, []);

  const cats = categories;

  const filtered = useMemo(() => {
    let list = [...products];
    if (mainTab === "deal") {
      list = list
        .filter(p => Number(p.oldPrice) > Number(p.price))
        .sort((a, b) => calculateDiscountPercent(b.price, b.oldPrice) - calculateDiscountPercent(a.price, a.oldPrice));
    } else if (mainTab === "hot") {
      list = list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      list = list.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    }
    if (activeCat) {
      list = list.filter(p => String(p.categoryId) === String(activeCat.id));
    }
    if (activeSub && activeSub !== "all") {
      const lowerSub = activeSub.toLowerCase();
      list = list.filter(p => {
        const name = (p.name || "").toLowerCase();
        if (lowerSub === "cap") return name.includes("cáp") || name.includes("sạc") || name.includes("cable") || name.includes("charger");
        if (lowerSub === "mouse") return name.includes("chuột") || name.includes("bàn phím") || name.includes("mouse") || name.includes("keyboard") || name.includes("key");
        if (lowerSub === "pin") return name.includes("dự phòng") || name.includes("powerbank");
        if (lowerSub === "op") return name.includes("ốp") || name.includes("case");
        if (lowerSub === "dan") return name.includes("dán kính") || name.includes("dán màn hình") || name.includes("protector");
        if (lowerSub === "usb") return name.includes("thẻ nhớ") || name.includes("usb") || name.includes("sd card") || name.includes("flash drive");
        return true;
      });
    }
    return list.slice(0, 12);
  }, [products, mainTab, activeCat, activeSub]);

  return (
    <section style={{
      position: "relative",
      border: `1px solid ${BORDER}`,
      borderRadius: 15,
      overflow: "hidden",
      backgroundColor: "#fff",
      fontFamily: FONT,
      boxShadow: "0 2px 16px rgba(74,144,226,0.08)",
    }}>

      {/* TAB ROW — 3 tab căn giữa, full width */}
      <div style={{
        display: "flex",
        width: "100%",
        alignItems: "flex-end",
        borderBottom: `1px solid ${BORDER}`,
        backgroundColor: "#fff",
      }}>
        {MAIN_TABS.map((tab, idx) => {
          const isActive = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setMainTab(tab.id); setActiveCat(null); setActiveSub("all"); }}
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 54,
                cursor: "pointer",
                outline: "none",
                transition: "all 0.2s",
                boxSizing: "border-box",
                position: "relative",
                zIndex: isActive ? 3 : 1,
                marginBottom: isActive ? -1 : 0,
                ...(isActive ? {
                  backgroundColor: "#F0F7FF",
                  borderTop: `1px solid ${BORDER}`,
                  borderLeft: idx === 0 ? "none" : `1px solid ${BORDER}`,
                  borderRight: idx === MAIN_TABS.length - 1 ? "none" : `1px solid ${BORDER}`,
                  borderBottom: "1px solid #F0F7FF",
                  borderRadius: "12px 12px 0 0",
                  padding: "8px 12px 12px",
                } : {
                  background: "linear-gradient(180deg, #FAFBFD 0%, #EEF2F7 100%)",
                  border: "none",
                  borderRight: idx < MAIN_TABS.length - 1 ? "1px solid #E0EAF5" : "none",
                  padding: "12px 8px 13px",
                }),
              }}
            >
              {isActive ? (
                <TabBadge tabId={tab.id} />
              ) : (
                <span style={{
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                  color: TAB_BLUE,
                  textAlign: "center",
                  lineHeight: 1.3,
                }}>
                  {tab.inactiveLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <div style={{ backgroundColor: "#fff" }}>

        {/* Row 1: category pills — căn giữa */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: "12px 20px 10px",
          justifyContent: "center",
          backgroundColor: "#F8FBFF",
          borderBottom: "1px solid #D8E8FF",
        }}>
          {cats.map(cat => {
            const isActive = activeCat?.id === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(isActive ? null : cat)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "6px 16px",
                  borderRadius: 999,
                  border: isActive ? `1.5px solid ${TAB_BLUE}` : "1.5px solid #D0DDE8",
                  backgroundColor: isActive ? TAB_BLUE : "#fff",
                  color: isActive ? "#fff" : "#333",
                  fontWeight: 700,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  letterSpacing: "0.01em",
                }}
              >
                {(cat.name || cat.label || "").split(" ").map(w =>
                  w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                ).join(" ")}
              </button>
            );
          })}
        </div>

        {/* Row 2: sub-filters — căn giữa */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "10px 20px 12px",
          borderBottom: "1px solid #F0F0F0",
          backgroundColor: "#fff",
          flexWrap: "wrap",
        }}>
          {SUB_FILTERS.map(sub => {
            const isActive = activeSub === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setActiveSub(sub.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: isActive ? `1.5px solid ${TAB_BLUE}` : "1px solid #E5E7EB",
                  backgroundColor: isActive ? "#F0F7FF" : "#fff",
                  color: isActive ? TAB_BLUE : "#444",
                  fontWeight: 600,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Icon name={sub.icon} style={{ fontSize: 17, color: isActive ? TAB_BLUE : "#9CA3AF" }} />
                {sub.name}
              </button>
            );
          })}
        </div>

        {/* Products carousel — 5 card/lần + nút kéo */}
        <div style={{ padding: "16px 20px 10px" }}>
          {filtered.length === 0 && !loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 14 }}>
              Không có sản phẩm phù hợp
            </div>
          ) : (
            <ProductCarousel
              products={filtered}
              visibleCount={VISIBLE_CARDS}
              gap={CARD_GAP}
              loading={loading}
              cardProps={{ showShipping: true }}
            />
          )}
        </div>

        {/* View all — căn giữa */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 20px" }}>
          <Link
            to="/category"
            style={{
              padding: "9px 56px",
              border: `1.5px solid ${TAB_BLUE}`,
              borderRadius: 999,
              color: TAB_BLUE,
              fontWeight: 700,
              fontSize: 13.5,
              textDecoration: "none",
              transition: "all 0.2s",
              display: "inline-block",
              letterSpacing: "0.02em",
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = TAB_BLUE; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = TAB_BLUE; }}
          >
            Xem tất cả →
          </Link>
        </div>
      </div>
    </section>
  );
}
