import { useState, useMemo } from "react";
import ProductCarousel from "./ProductCarousel";
import Icon from "../../../components/common/Icon";

const MAIN_TABS = [
  { id: "suggest", label: "GỢI Ý TỪ AURA AI" },
  { id: "trend", label: "XU HƯỚNG MUA SẮM" },
  { id: "personal", label: "DÀNH RIÊNG CHO BẠN" },
];

export default function SuggestedSection({ products: apiProducts, loading: apiLoading }) {
  const suggested = apiProducts ?? [];
  const loading = apiLoading;

  const [activeTab, setActiveTab] = useState("suggest");

  // Filter or sort suggested products based on active tab
  const filtered = useMemo(() => {
    let list = [...suggested];
    if (activeTab === "trend") {
      list = list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (activeTab === "personal") {
      list = list.sort((a, b) => {
        const discA = Number(a.oldPrice || 0) - Number(a.price || 0);
        const discB = Number(b.oldPrice || 0) - Number(b.price || 0);
        return discB - discA;
      });
    }
    return list.slice(0, 10);
  }, [suggested, activeTab]);


  return (
    <div 
      className="suggested-section-wrapper"
      style={{
        margin: "54px 0 30px",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        position: "relative",
        transition: "all 0.3s ease"
      }}
    >
      {/* Dynamic Keyframes and Margins to expand wider on desktop */}
      <style>{`
        @media (min-width: 1280px) {
          .suggested-section-wrapper {
            margin-left: -24px !important;
            margin-right: -24px !important;
          }
        }
        .suggested-tab-group:hover .tab-body-bg {
          opacity: 0.9 !important;
        }
        .suggested-tab-group:hover .tab-text {
          color: #ffffff !important;
        }
        
        /* Mobile-First Classes matching CellphoneS source style exactly */
        .suggested-header-bg {
          height: 40px !important;
          width: calc(100% - 24px) !important;
        }
        .suggested-tabs-inset {
          left: 16px !important;
          right: 16px !important;
          bottom: 4px !important;
        }
        .suggested-tab-group {
          width: calc(33.3333% - 5.33px) !important;
        }
        .tab-text {
          font-size: 11px !important;
        }
        .tab-body-wrapper {
          height: 36px !important;
        }
        .tab-base-feet {
          height: 8px !important;
        }
        .gift-box-left {
          top: 20px !important;
          left: -6px !important;
          width: 46px !important;
          height: 46px !important;
        }
        .gift-box-right {
          top: -16px !important;
          right: 0px !important;
          width: 36px !important;
          height: 36px !important;
        }

        @media (min-width: 768px) {
          .suggested-header-bg {
            height: 54px !important;
            width: calc(100% - 60px) !important;
          }
          .suggested-tabs-inset {
            left: 28px !important;
            right: 28px !important;
            bottom: 4px !important;
          }
          .tab-text {
            font-size: 18px !important;
          }
          .tab-body-wrapper {
            height: 54px !important;
          }
          .tab-base-feet {
            height: 12px !important;
          }
          .gift-box-left {
            top: 56px !important;
            left: -16px !important;
            width: 56px !important;
            height: 56px !important;
          }
          .gift-box-right {
            top: 16px !important;
            right: 4px !important;
            width: 68px !important;
            height: 68px !important;
          }
        }
      `}</style>

      {/* 1. Header background banner with absolute tabs container */}
      <div 
        className="suggested-header-bg"
        style={{
          position: "relative",
          margin: "0 auto",
          backgroundImage: "url('https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/flash_sale/Tet/2026_header_bg.png')",
          backgroundPosition: "center center",
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat"
        }}
      >
        <div 
          className="suggested-tabs-inset"
          style={{
            position: "absolute",
            display: "flex",
            height: "100%",
            justifyContent: "center"
          }}
        >
          <div style={{
            display: "flex",
            width: "100%",
            gap: "8px"
          }}>
            {MAIN_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="suggested-tab-group"
                  style={{
                    position: "relative",
                    display: "flex",
                    height: "100%",
                    transform: "translateY(-10px)",
                    alignItems: "center",
                    justifyContent: "center",
                    userSelect: "none",
                    cursor: "pointer",
                    transition: "all 0.3s ease"
                  }}
                >
                  {/* Tab Body (Tỉ lệ 92% bo tròn 16px) */}
                  <div 
                    className="tab-body-wrapper"
                    style={{
                      position: "absolute",
                      top: 0,
                      zIndex: 1,
                      width: "92%",
                      overflow: "hidden",
                      borderRadius: "16px 16px 0 0"
                    }}
                  >
                    <div 
                      className="tab-body-bg"
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "16px 16px 0 0",
                        backgroundImage: isActive 
                          ? "linear-gradient(rgb(207, 31, 43), rgb(217, 65, 72))" 
                          : "linear-gradient(rgb(207, 31, 43), rgb(143, 15, 26))",
                        boxShadow: isActive 
                          ? "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -5px 5px #8F0F1A" 
                          : "none",
                        transition: "opacity 0.3s"
                      }} 
                    />
                  </div>

                  {/* Tab base foot (Bản đế 100% màu đỏ sẫm bo tròn 18px) */}
                  <div 
                    className="tab-base-feet"
                    style={{
                      position: "absolute",
                      bottom: 0,
                      zIndex: 0,
                      width: "100%",
                      borderRadius: "18px 18px 0 0",
                      backgroundColor: isActive ? "rgb(143, 15, 26)" : "rgb(162, 17, 29)",
                      transition: "all 0.3s"
                    }} 
                  />

                  {/* Tab Text */}
                  <div 
                    className="tab-text"
                    style={{
                      position: "relative",
                      zIndex: 2,
                      padding: "0 12px",
                      textAlign: "center",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      fontStyle: "italic",
                      letterSpacing: "0.02em",
                      color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                      transition: "all 0.3s"
                    }}
                  >
                    {tab.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Main Crimson Container with Golden Bezel shadows and absolute decorative gift boxes */}
      <div style={{
        marginTop: 0,
        transform: "translateY(-7px)",
        borderRadius: "24px",
        border: "1px solid rgb(255, 243, 207)",
        background: "linear-gradient(rgb(202, 14, 7) 0%, rgb(212, 21, 9) 55%, rgb(212, 21, 9) 100%)",
        boxShadow: "inset 0px 0px 0px 1px rgb(255, 247, 220), inset 0px 0px 0px 3px rgb(242, 215, 159), inset 0px 0px 0px 4px rgb(185, 133, 52), 0 22px 45px rgba(211, 29, 40, 0.24)",
        position: "relative",
        zIndex: 3,
        padding: "26px 20px 20px"
      }}>
        {/* Left Decorative Gift Box */}
        <img 
          alt="Gift Box Left" 
          src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/flash_sale/Tet/2026_left_icon.png"
          className="gift-box-left"
          style={{
            position: "absolute",
            zIndex: 4,
            pointerEvents: "none"
          }}
        />

        {/* Right Decorative Gift Box */}
        <img 
          alt="Gift Box Right" 
          src="https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/flash_sale/Tet/2026_right_icon.png"
          className="gift-box-right"
          style={{
            position: "absolute",
            zIndex: 4,
            pointerEvents: "none"
          }}
        />
        
        {/* 3. White Carousel container */}
        <div style={{
          backgroundColor: "#fff",
          borderRadius: "20px",
          padding: "26px 18px",
          border: "2px solid #FFE4E6",
          boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.01)"
        }}>
          {loading ? (
            <div style={{ display: "flex", gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: "1",
                    height: 380,
                    borderRadius: 16,
                    backgroundColor: "#F3F4F6",
                    animation: "pulse 1.5s infinite"
                  }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF", fontSize: 13, fontWeight: 600 }}>
              Chưa có gợi ý dành cho bạn lúc này
            </div>
          ) : (
            <ProductCarousel
              products={filtered}
              visibleCount={5}
              gap={12}
              loading={loading}
              cardProps={{ showShipping: true }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
