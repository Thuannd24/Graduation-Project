import { useState } from "react";
import { Link } from "react-router-dom";
import { useWishlist } from "../../../context/WishlistContext.jsx";
import { calculateDiscountPercent, formatVnd } from "../../../utils/format.js";
import Icon from "../../../components/common/Icon.jsx";

const RED = "#D70018";
const GOLD = "#F59E0B";
const FONT = "'Inter', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/* ========== Star Rating - 1 icon sao + số điểm ========== */
function StarRating({ rating }) {
  const score = rating > 0 ? rating : 5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Icon name="star" filled style={{ fontSize: 14, color: GOLD }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
        {score % 1 === 0 ? score.toFixed(0) : score.toFixed(1)}
      </span>
    </div>
  );
}

export default function ProductCard({
  product,
  variant = "standard",
  showInstallment = true,
  showShipping = false,
  showRating = true,
}) {
  const { toggleWishlist, isInWishlist } = useWishlist();
  const discount = calculateDiscountPercent(
    Number(product.price || 0),
    Number(product.oldPrice || 0)
  );
  const isLiked = isInWishlist(product.id);
  const rating = Number(product.rating || 0);
  const hasOld = Number(product.oldPrice) > Number(product.price);
  const isLaptop = variant === "laptop";
  const [imgHover, setImgHover] = useState(false);

  return (
    <article
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        border: "1px solid #E8E8E8",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease, transform 0.3s ease",
        cursor: "pointer",
        fontFamily: FONT,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(169,0,16,0.10), 0 2px 8px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = "#D1D5DB";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#E8E8E8";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Discount badge */}
      {discount > 0 && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 5,
          pointerEvents: "none",
        }}>
          <span style={{
            background: "linear-gradient(135deg, #D70018, #FF1A1A)",
            color: "#fff",
            fontSize: 11, fontWeight: 800,
            padding: "3px 8px", borderRadius: 6,
            lineHeight: 1.3,
            boxShadow: "0 2px 8px rgba(215,0,24,0.3)",
          }}>
            -{discount}%
          </span>
        </div>
      )}

      {/* Image - khung ảnh cao hơn */}
      <Link
        to={`/product/${product.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          flexShrink: 0,
          aspectRatio: "1 / 1",
          background: "linear-gradient(180deg, #FAFBFC 0%, #F0F1F3 100%)",
          padding: "28px 16px 12px",
          textDecoration: "none",
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid #F3F4F6",
        }}
        onMouseEnter={() => setImgHover(true)}
        onMouseLeave={() => setImgHover(false)}
      >
        <img
          alt={product.name}
          src={product.image || product.imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transition: "transform 0.4s ease",
            transform: imgHover ? "scale(1.06)" : "scale(1)",
          }}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://placehold.co/200x200/f8f9fb/6b7280?text=${encodeURIComponent("SP")}`;
          }}
        />
      </Link>

      {/* Body */}
      <div style={{
        padding: "10px 14px 14px",
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}>
        {/* Laptop specs */}
        {isLaptop && product.specHighlight && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: RED, lineHeight: 1.3 }}>
              {product.specHighlight}
            </div>
            {product.specDetail && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                {product.specDetail}
              </div>
            )}
          </div>
        )}

        {/* Product name */}
        <Link
          to={`/product/${product.id}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#1A1A1A",
            textDecoration: "none",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            marginBottom: 6,
            minHeight: 42,
            letterSpacing: "-0.01em",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = RED; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#1A1A1A"; }}
        >
          {product.name}
        </Link>

        {/* Price */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 8,
        }}>
          <strong style={{
            fontSize: 17,
            fontWeight: 800,
            color: RED,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            {formatVnd(Number(product.price || 0))}
          </strong>
          {hasOld && (
            <span style={{
              fontSize: 12,
              color: "#AAAAAA",
              textDecoration: "line-through",
              fontWeight: 400,
            }}>
              {formatVnd(Number(product.oldPrice))}
            </span>
          )}
          {discount > 0 && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              color: RED,
              background: "#FFF0F0",
              padding: "1px 5px",
              borderRadius: 3,
              lineHeight: 1.5,
            }}>
              -{discount}%
            </span>
          )}
        </div>

        {/* Shipping info */}
        {showShipping && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 8, flexWrap: "wrap",
          }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11, fontWeight: 600, color: RED,
            }}>
              <Icon name="local_shipping" style={{ fontSize: 14, color: RED }} />
              Ship 2 ngày
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 11, color: "#6B7280",
            }}>
              <Icon name="location_on" style={{ fontSize: 13, color: "#9CA3AF" }} />
              Hà Nội
            </span>
          </div>
        )}

        {/* Bottom: Rating + Wishlist */}
        <div style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 6,
          borderTop: "1px solid #F3F4F6",
        }}>
          {showRating ? (
            <StarRating rating={rating} />
          ) : <span />}

          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(product); }}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              background: isLiked ? "#FFF0F0" : "#F3F4F6",
              border: "none", borderRadius: 8,
              cursor: "pointer",
              color: isLiked ? RED : "#6B7280",
              fontSize: 11, fontWeight: 700,
              padding: "4px 8px",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!isLiked) {
                e.currentTarget.style.background = "#FEE2E2";
                e.currentTarget.style.color = RED;
              }
            }}
            onMouseLeave={(e) => {
              if (!isLiked) {
                e.currentTarget.style.background = "#F3F4F6";
                e.currentTarget.style.color = "#6B7280";
              }
            }}
          >
            <Icon
              name="favorite"
              filled={isLiked}
              style={{
                fontSize: 14,
                color: isLiked ? RED : "#9CA3AF",
                transition: "all 0.2s",
              }}
            />
            {isLiked ? "Đã thích" : "Yêu thích"}
          </button>
        </div>
      </div>
    </article>
  );
}
