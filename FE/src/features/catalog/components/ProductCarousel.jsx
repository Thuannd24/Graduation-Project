import { useRef, useState, useEffect, useCallback } from "react";
import ProductCard from "./ProductCard";
import Icon from "../../../components/common/Icon";

export default function ProductCarousel({
  products = [],
  visibleCount = 5,
  gap = 12,
  loading = false,
  cardProps = {},
  padding = "0",
  skeletonHeight = 380,
}) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const itemBasis = `calc((100% - ${(visibleCount - 1) * gap}px) / ${visibleCount})`;

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [products, checkScroll]);

  const scrollBy = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = (el.clientWidth - gap * (visibleCount - 1)) / visibleCount;
    el.scrollBy({
      left: direction * (cardWidth + gap) * Math.max(1, visibleCount - 1),
      behavior: "smooth",
    });
  };

  const navBtn = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 10,
    width: 42,
    height: 42,
    backgroundColor: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: "50%",
    boxShadow: "0 4px 14px rgba(0,0,0,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  };

  if (loading) {
    return (
      <div style={{ position: "relative", padding }}>
        <div style={{ display: "flex", gap }}>
          {Array.from({ length: visibleCount }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: `0 0 ${itemBasis}`,
                height: skeletonHeight,
                borderRadius: 12,
                backgroundColor: "#F3F4F6",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!products.length) return null;

  return (
    <div style={{ position: "relative", padding }}>
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap,
          overflowX: "auto",
          scrollBehavior: "smooth",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {products.map((p) => (
          <div key={p.id} style={{ flex: `0 0 ${itemBasis}`, minWidth: 0 }}>
            <ProductCard product={p} {...cardProps} />
          </div>
        ))}
      </div>

      <style>{`
        .carousel-nav-btn {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .carousel-nav-btn:hover {
          transform: translateY(-50%) scale(1.1) !important;
          background-color: #F8FAFC !important;
          border-color: #CBD5E1 !important;
          box-shadow: 0 6px 18px rgba(0,0,0,0.15) !important;
        }
        .carousel-nav-btn:active {
          transform: translateY(-50%) scale(0.95) !important;
        }
      `}</style>

      {canLeft && (
        <button 
          type="button" 
          aria-label="Xem trước" 
          onClick={() => scrollBy(-1)} 
          className="carousel-nav-btn"
          style={{ ...navBtn, left: -14 }}
        >
          <Icon name="chevron_left" style={{ fontSize: 26, color: "#334155" }} />
        </button>
      )}

      {canRight && (
        <button 
          type="button" 
          aria-label="Xem tiếp" 
          onClick={() => scrollBy(1)} 
          className="carousel-nav-btn"
          style={{ ...navBtn, right: -14 }}
        >
          <Icon name="chevron_right" style={{ fontSize: 26, color: "#334155" }} />
        </button>
      )}
    </div>
  );
}
