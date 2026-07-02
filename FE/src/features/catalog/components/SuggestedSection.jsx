import ProductCarousel from "./ProductCarousel";

const GRADIENT = "linear-gradient(135deg, #FFB6C8 0%, #E8C4FF 40%, #A8D4FF 100%)";

export default function SuggestedSection({ products: apiProducts, loading: apiLoading }) {
  const suggested = apiProducts ?? [];
  const loading = apiLoading;

  if (!loading && !suggested.length) return null;

  return (
    <section
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: GRADIENT,
        padding: 16,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "linear-gradient(180deg, #3B9AE8 0%, #288AD6 100%)",
          padding: "8px 28px",
          borderRadius: 999,
          boxShadow: "0 2px 8px rgba(40,138,214,0.35)",
        }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <h2 style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: "0.06em",
            color: "#fff",
            textTransform: "uppercase",
          }}>
            Gợi ý cho bạn
          </h2>
          <span style={{ fontSize: 16 }}>✨</span>
        </div>
      </div>

      <ProductCarousel
        products={suggested}
        visibleCount={5}
        gap={12}
        loading={loading}
        cardProps={{ showShipping: true }}
      />
    </section>
  );
}
