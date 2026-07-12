import { Link } from "react-router-dom";
import under1 from "../../../assets/images/under1.png";
import banner3 from "../../../assets/images/banner3.webp";
import banner4 from "../../../assets/images/banner4.webp";
import schoolPromoBanner from "../../../assets/images/school_promo_banner.png";

export function SubBannersGrid() {
  const subBanners = [
    {
      src: banner4,
      link: "/category",
      glow: "hover:shadow-red-500/10 hover:border-red-500/30",
    },
    {
      src: banner3,
      link: "/category",
      glow: "hover:shadow-blue-500/10 hover:border-blue-500/30",
    },
    {
      src: under1,
      link: "/category",
      glow: "hover:shadow-rose-500/10 hover:border-rose-500/30",
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-[124px] min-h-[124px]">
      {subBanners.map((banner, i) => (
        <Link
          key={i}
          to={banner.link}
          className={`block rounded-xl overflow-hidden shadow-md hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 relative group border border-slate-100 dark:border-slate-800/80 h-full bg-slate-50 dark:bg-slate-900 ${banner.glow}`}
        >
          <img
            src={banner.src}
            alt={`Sub-banner ${i + 1}`}
            className="w-full h-full object-fill group-hover:scale-[1.015] transition-transform duration-500 ease-out rounded-xl"
          />
          
          {/* Premium overlay tint */}
          <div className="absolute inset-0 bg-black/[0.02] group-hover:bg-transparent transition-colors duration-300 pointer-events-none" />

          {/* Sweeping shine reflection effect */}
          <div className="absolute inset-0 w-[40%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-[150%] group-hover:translate-x-[250%] transition-transform duration-1000 ease-out pointer-events-none" />
        </Link>
      ))}
    </div>
  );
}

export function WidePromoBanner() {
  return (
    <div className="relative select-none w-full">
      {/* Inject custom CSS keyframes for sweep sheen, button glint, and ambient pulse */}
      <style>{`
        @keyframes sweep {
          0% { transform: translate(-150%, -50%) rotate(25deg); }
          30%, 100% { transform: translate(350%, -50%) rotate(25deg); }
        }
        @keyframes btnGlint {
          0%, 20% { transform: translateX(-100%) skewX(-20deg); }
          50%, 100% { transform: translateX(180%) skewX(-20deg); }
        }
        @keyframes shadowPulse {
          0%, 100% { box-shadow: 0 4px 15px rgba(239, 68, 68, 0.04); }
          50% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.12); }
        }
        .animate-sweep-sheen {
          animation: sweep 4.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-btn-glint {
          animation: btnGlint 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-shadow-pulse {
          animation: shadowPulse 3s ease-in-out infinite;
        }
      `}</style>

      {/* Slim horizontal single-image banner - borderless, floating glow container */}
      <Link 
        to="/category" 
        className="block w-full h-[50px] sm:h-[60px] md:h-[70px] lg:h-[75px] rounded-2xl overflow-hidden border border-rose-100/50 dark:border-red-950/20 animate-shadow-pulse hover:scale-[1.005] hover:shadow-[0_8px_25px_rgba(239,68,68,0.18)] dark:hover:shadow-[0_8px_30px_rgba(239,68,68,0.3)] transition-all duration-500 group bg-slate-50 dark:bg-slate-900 relative"
      >
        {/* Core static banner image */}
        <img
          src={schoolPromoBanner}
          alt="Đổi Điểm Lên Deal"
          className="w-full h-full object-fill transition-transform duration-700 ease-out group-hover:scale-[1.008]"
        />

        {/* 1. Diagonal glossy sweep reflection across the whole banner */}
        <div className="absolute top-1/2 left-0 w-32 h-[300%] bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-y-1/2 animate-sweep-sheen pointer-events-none z-10" />

        {/* 2. Glassmorphic sheen overlay to give a polished screen vibe */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/[0.03] pointer-events-none mix-blend-overlay z-10" />

        {/* 3. Button Glint (Shine effect specifically over the "ĐỔI ĐIỂM NGAY" red button area) */}
        <div className="absolute right-[1.6%] top-[60%] w-[10.5%] h-[30%] rounded-full overflow-hidden pointer-events-none hidden sm:block z-20">
          {/* A sliding white light ray inside the button boundaries */}
          <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-transparent via-white/70 to-transparent animate-btn-glint" />
        </div>

        {/* 4. Tiny pulsing halo underneath the button to attract subtle focus */}
        <div className="absolute right-[1.6%] top-[60%] w-[10.5%] h-[30%] bg-yellow-400/10 rounded-full blur-[1px] animate-pulse pointer-events-none hidden sm:block z-20" />
      </Link>
    </div>
  );
}
