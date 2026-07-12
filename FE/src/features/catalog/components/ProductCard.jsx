import { useState } from "react";
import { Link } from "react-router-dom";
import { useWishlist } from "../../../context/WishlistContext.jsx";
import { calculateDiscountPercent, formatVnd } from "../../../utils/format.js";
import Icon from "../../../components/common/Icon.jsx";

const RED = "#D70018";
const GOLD = "#F59E0B";
const FONT = "'Inter', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/* ========== Star Rating - 1 icon sao đen + số điểm ========== */
function StarRating({ rating }) {
  const score = rating > 0 ? rating : 5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <Icon name="star" filled style={{ fontSize: 16, color: "#1F2937" }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: "#1F2937" }}>
        {score % 1 === 0 ? score.toFixed(0) : score.toFixed(1)}
      </span>
    </div>
  );
}

export default function ProductCard({
  product,
  variant = "standard",
  showInstallment = true,
  showShipping = true,
  showRating = true,
  isFlashSale = false,
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
        borderRadius: 16,
        border: "1px solid #EAEAEA",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease, transform 0.3s ease",
        cursor: "pointer",
        fontFamily: FONT,
        boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 10px 25px rgba(215,0,24,0.08), 0 4px 12px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#D1D5DB";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
        e.currentTarget.style.borderColor = "#EAEAEA";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Discount badge - Folded Ribbon style */}
      {discount > 0 && (
        <div style={{
          position: "absolute",
          top: 14,
          left: -4,
          zIndex: 5,
          pointerEvents: "none",
        }}>
          {/* Ribbon Fold shadow */}
          <div style={{
            position: "absolute",
            left: 0,
            bottom: "100%",
            width: 0,
            height: 0,
            borderBottom: "4px solid #8A000E",
            borderLeft: "4px solid transparent",
          }} />
          {/* Ribbon Body */}
          <div style={{
            background: "#D70018",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 8px",
            borderRadius: "0 6px 6px 6px",
            lineHeight: 1.2,
            boxShadow: "2px 2px 4px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            fontFamily: FONT,
          }}>
            Giảm {discount}%
          </div>
        </div>
      )}

      {/* Image Container */}
      <Link
        to={`/product/${product.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          flexShrink: 0,
          aspectRatio: "1 / 1",
          background: "linear-gradient(180deg, #FAFBFC 0%, #F5F6F8 100%)",
          padding: "24px 16px 12px",
          textDecoration: "none",
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid #F1F2F4",
          borderRadius: "16px 16px 0 0",
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
            transform: imgHover ? "scale(1.05)" : "scale(1)",
          }}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://placehold.co/200x200/f8f9fb/6b7280?text=${encodeURIComponent("SP")}`;
          }}
        />
      </Link>

      {/* Body */}
      <div style={{
        padding: "12px 14px 14px",
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
            fontSize: 14.5,
            fontWeight: 700,
            color: "#1A1A1A",
            textDecoration: "none",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            marginBottom: 6,
            minHeight: 40,
            letterSpacing: "-0.01em",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = RED; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#1A1A1A"; }}
        >
          {product.name}
        </Link>

        {/* Price Row */}
        <div style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 4,
        }}>
          <strong style={{
            fontSize: 18,
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
        </div>

        {/* Discount Badge Row (Separate line below price) */}
        {discount > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              color: RED,
              background: "#FFF0F0",
              padding: "2px 6px",
              borderRadius: 4,
              lineHeight: 1.4,
              display: "inline-block",
            }}>
              -{discount}%
            </span>
          </div>
        )}

        {/* Shipping info */}
        {showShipping && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
            flexWrap: "wrap",
          }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              color: RED,
            }}>
              <Icon name="local_shipping" style={{ fontSize: 15, color: RED }} />
              Ship 2 ngày
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#6B7280",
              fontWeight: 500,
            }}>
              <Icon name="location_on" style={{ fontSize: 14, color: "#9CA3AF" }} />
              Hà Nội
            </span>
          </div>
        )}

        {/* Bottom Area: Rating + Wishlist Button */}
        {/* Bottom Area: Rating + Wishlist Button OR Flash Sale Progress */}
        {isFlashSale ? (
          <div style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px solid #F1F2F4",
            gap: 6
          }}>
            {/* Rating: Star + score */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, shrink: 0 }}>
              <Icon name="star" filled style={{ fontSize: 14, color: "#1F2937" }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1F2937" }}>
                {rating > 0 ? rating.toFixed(1) : "5.0"}
              </span>
            </div>

            {/* Progress Bar Pill */}
            <div style={{
              flex: 1,
              background: "#FEE2E2",
              borderRadius: 20,
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              position: "relative",
              overflow: "hidden"
            }}>
              {/* Progress Fill (Mock 15% to look beautiful and active) */}
              <div style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "15%",
                background: "linear-gradient(90deg, #FF4B2B 0%, #FF416C 100%)",
                borderRadius: 20,
                opacity: 0.85
              }} />
              
              {/* Flame/Hot Icon */}
              <Icon name="whatshot" style={{ fontSize: 13, color: RED, zIndex: 1 }} />
              
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#D70018",
                zIndex: 1,
                whiteSpace: "nowrap"
              }}>
                Đã bán 0/{product.id ? (Number(product.id) % 2 === 0 ? 30 : 10) : 10} suất
              </span>
            </div>
          </div>
        ) : (
          <div style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: "1px solid #F1F2F4",
          }}>
            {showRating ? (
              <StarRating rating={rating} />
            ) : <span />}

            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(product); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: isLiked ? "#FFF0F0" : "#F3F4F6",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                color: isLiked ? RED : "#6B7280",
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 12px",
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
        )}
      </div>
    </article>
  );
}
