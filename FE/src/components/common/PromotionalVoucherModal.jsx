import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { voucherApi } from "../../services/voucherApi";

// Helper rút gọn số tiền thành chữ hoa đẹp chuẩn poster TMĐT (ví dụ: 50K, 100K, 1TR)
function formatShortVnd(amount) {
  if (!amount) return "0Đ";
  const num = Number(amount);
  if (num >= 1000000) {
    const tr = num / 1000000;
    return `${tr % 1 === 0 ? tr : tr.toFixed(1)}TR`;
  }
  if (num >= 1000) {
    return `${Math.round(num / 1000)}K`;
  }
  return `${num}Đ`;
}

export default function PromotionalVoucherModal() {
  const [voucher, setVoucher] = useState(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Mỗi phiên duyệt web chỉ hiện 1 lần nếu người dùng đã đóng popup
    if (sessionStorage.getItem("seen_promo_voucher_popup")) {
      return;
    }

    let isMounted = true;

    // Gọi API lấy voucher của người dùng từ Backend
    voucherApi
      .getMyVouchers()
      .then((data) => {
        if (!isMounted || !Array.isArray(data) || data.length === 0) return;

        // Chỉ lấy các voucher còn hạn và chưa dùng
        const available = data.filter((v) => v.usable && v.status === "UNUSED");
        if (available.length === 0) return;

        // Nếu có nhiều voucher thì chỉ chọn 1 voucher có ưu đãi cao nhất
        const typePriority = { PERCENT: 3, FIXED: 2, FREESHIP: 1 };
        const selected = [...available].sort((a, b) => {
          const pDiff = (typePriority[b.voucherType] || 0) - (typePriority[a.voucherType] || 0);
          if (pDiff !== 0) return pDiff;
          const valA = a.discountPercent || a.discountAmount || a.maxShippingDiscount || 0;
          const valB = b.discountPercent || b.discountAmount || b.maxShippingDiscount || 0;
          return valB - valA;
        })[0];

        if (selected) {
          setVoucher(selected);
          setVisible(true);
        }
      })
      .catch(() => {
        // Chưa đăng nhập hoặc lỗi API -> không hiển thị gì cả
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Đóng modal khi bấm nút (X) hoặc bấm ra ngoài
  const handleClose = (e) => {
    if (e) e.stopPropagation();
    setVisible(false);
    sessionStorage.setItem("seen_promo_voucher_popup", "true");
  };

  // Bấm vào ảnh -> Tự động sao chép mã và dẫn tới giỏ hàng
  const handleBannerClick = () => {
    if (voucher?.code) {
      navigator.clipboard?.writeText(voucher.code);
      setCopied(true);
    }
    setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem("seen_promo_voucher_popup", "true");
      navigate("/cart");
    }, 700);
  };

  if (!visible || !voucher) {
    return null;
  }

  // Nhận diện loại voucher để hiển thị đúng 1 trong 3 banner
  const isPercent = voucher.voucherType === "PERCENT";
  const isFixed = voucher.voucherType === "FIXED";

  const bannerSrc = isPercent
    ? "/banners/voucher_percent_popup.jpg"
    : isFixed
      ? "/banners/voucher_fixed_popup.jpg"
      : "/banners/voucher_freeship_popup.jpg";

  return (
    // Background mờ tối vừa phải, không dùng backdrop-blur để màn hình sau luôn sắc nét
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in"
      onClick={handleClose}
    >
      {/* Container chính của Popup */}
      <div
        className="relative w-full max-w-[360px] sm:max-w-[440px] rounded-2xl overflow-visible shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* NÚT (X) NHỎ ĐỂ TẮT NẰM NỔI Ở GÓC TRÊN BÊN PHẢI */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute -top-3.5 -right-3.5 w-8 h-8 rounded-full bg-slate-950 text-white border-2 border-white/90 shadow-2xl flex items-center justify-center hover:bg-red-600 hover:scale-110 active:scale-95 transition-all z-30 cursor-pointer group"
          title="Đóng popup"
        >
          <span className="text-sm font-black group-hover:rotate-90 transition-transform">✕</span>
        </button>

        {/* KHUNG BANNER DUY NHẤT (CLICK VÀO ĐỂ NHẬN MÃ & MUA SẮM) */}
        <div
          onClick={handleBannerClick}
          className="relative w-full rounded-2xl overflow-hidden shadow-2xl cursor-pointer hover:brightness-105 active:scale-[0.99] transition-all group border border-white/20"
          title="Bấm vào để lưu mã và mua sắm ngay"
        >
          {/* Ảnh banner */}
          <img
            src={bannerSrc}
            alt={voucher.title || "Voucher Popup"}
            className="w-full h-auto object-cover select-none block"
          />

          {/* 1. GÁN ĐỘNG: Số % vào đúng giữa ngôi sao răng cưa đen bên trái */}
          {isPercent && (
            <div
              className="absolute flex items-center justify-center select-none pointer-events-none"
              style={{
                top: "37.9%",
                left: "16.4%",
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="text-yellow-400 font-black text-2xl sm:text-3xl leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] tracking-tight">
                {voucher.discountPercent ?? 10}%
              </span>
            </div>
          )}

          {/* 2. GÁN ĐỘNG: Số tiền vào đúng tâm hình tròn đỏ - Đã căn chuẩn */}
          {isFixed && (
            <div
              className="absolute flex flex-col items-center justify-center select-none pointer-events-none text-center"
              style={{
                top: "50.5%",
                left: "82.0%",
                transform: "translate(-50%, -50%)",
              }}
            >
              <span
                className="text-white font-black text-2xl sm:text-3xl lg:text-[34px] tracking-tight leading-none select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                style={{
                  fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
                }}
              >
                {formatShortVnd(voucher.discountAmount ?? 50000)}
              </span>
              <span
                className="text-slate-950 font-black text-xs sm:text-[13px] uppercase tracking-widest mt-1 select-none"
                style={{
                  letterSpacing: "0.22em",
                }}
              >
                GIẢM
              </span>
            </div>
          )}

          {/* Thông báo nhỏ khi bấm lưu mã */}
          {copied && (
            <div className="absolute inset-x-4 bottom-4 bg-emerald-600/95 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-lg text-center backdrop-blur-sm animate-bounce">
              ✓ Đã sao chép mã {voucher.code}! Đang mở giỏ hàng...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
