import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productApi } from "../../../services/productApi";
import { getBrandLogo } from "../../../utils/brandLogo";
import Icon from "../../../components/common/Icon";

// Helper to resolve custom premium glow and border styles based on brand names
function getBrandStyle(label) {
  if (!label) return "hover:border-red-500 hover:shadow-[0_12px_24px_rgba(215,0,24,0.1)]";
  const brand = label.toLowerCase();
  switch (brand) {
    case "apple":
    case "macbook":
    case "iphone":
    case "ipad":
      return "hover:border-slate-800 dark:hover:border-slate-200 hover:shadow-[0_12px_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_24px_rgba(255,255,255,0.05)]";
    case "samsung":
      return "hover:border-[#034ea2] hover:shadow-[0_12px_24px_rgba(3,78,162,0.15)]";
    case "xiaomi":
      return "hover:border-[#ff6700] hover:shadow-[0_12px_24px_rgba(255,103,0,0.15)]";
    case "oppo":
      return "hover:border-[#10b981] hover:shadow-[0_12px_24px_rgba(16,185,129,0.15)]";
    case "realme":
      return "hover:border-[#ffc915] hover:shadow-[0_12px_24px_rgba(255,201,21,0.15)]";
    case "asus":
      return "hover:border-[#00539b] hover:shadow-[0_12px_24px_rgba(0,83,155,0.15)]";
    case "dell":
      return "hover:border-[#007dbd] hover:shadow-[0_12px_24px_rgba(0,125,189,0.15)]";
    case "hp":
      return "hover:border-[#0096d6] hover:shadow-[0_12px_24px_rgba(0,150,214,0.15)]";
    case "lenovo":
      return "hover:border-[#e11d48] hover:shadow-[0_12px_24px_rgba(225,29,72,0.15)]";
    case "msi":
      return "hover:border-[#e11d48] hover:shadow-[0_12px_24px_rgba(225,29,72,0.15)]";
    case "acer":
      return "hover:border-[#83b81a] hover:shadow-[0_12px_24px_rgba(131,184,26,0.15)]";
    case "jbl":
      return "hover:border-[#ff6700] hover:shadow-[0_12px_24px_rgba(255,103,0,0.15)]";
    case "sony":
      return "hover:border-slate-800 dark:hover:border-slate-200 hover:shadow-[0_12px_24px_rgba(0,0,0,0.08)]";
    case "huawei":
      return "hover:border-[#e11d48] hover:shadow-[0_12px_24px_rgba(225,29,72,0.15)]";
    case "logitech":
      return "hover:border-[#00b0ff] hover:shadow-[0_12px_24px_rgba(0,176,255,0.15)]";
    default:
      return "hover:border-red-500 hover:shadow-[0_12px_24px_rgba(215,0,24,0.1)]";
  }
}

export default function BrandShowcaseSection() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productApi.listBrands()
      .then(res => {
        setBrands(res.filter(b => b.active !== false).slice(0, 16));
      })
      .catch(err => {
        console.error("Error loading brands:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
        <div className="h-6 w-56 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-16 bg-slate-100 dark:bg-slate-850 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (brands.length === 0) return null;

  return (
    <section className="w-full bg-gradient-to-br from-white via-white to-slate-50/40 dark:from-slate-900 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-8 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.03)] transition-all">
      
      {/* Premium Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 dark:border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-6 bg-gradient-to-b from-red-500 to-red-700 rounded-full shadow-[0_2px_10px_rgba(220,38,38,0.4)]" />
            <h2 className="text-[18px] font-black tracking-tight text-slate-800 dark:text-slate-100 uppercase">
              Thương Hiệu Đối Tác
            </h2>
           
          </div>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
            Phân phối chính hãng các dòng sản phẩm công nghệ hàng đầu thế giới
          </p>
        </div>
        
        <Link 
          to="/category" 
          className="group flex items-center gap-2 text-[12px] font-extrabold text-slate-655 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-500 transition-colors uppercase tracking-wider shrink-0"
        >
          Tất cả danh mục
          <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center transition-all group-hover:bg-red-500 group-hover:text-white group-hover:translate-x-1">
            <Icon name="arrow_forward" className="text-[14px]" />
          </span>
        </Link>
      </div>

      {/* Elegant Brands grid with custom brand glows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
        {brands.map(brand => {
          const stylizedLogo = getBrandLogo(brand.name);
          const brandStyleClass = getBrandStyle(brand.name);
          
          return (
            <Link
              key={brand.id}
              to={`/category?brand=${encodeURIComponent(brand.name)}`}
              className={`group relative flex items-center justify-center h-16 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${brandStyleClass}`}
            >
              {/* Background Glassmorphic Tint */}
              <span className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/40 dark:to-slate-900/10 pointer-events-none" />

              {/* Logo wrapper */}
              <div className="w-full h-full flex items-center justify-center transition-all duration-300 group-hover:scale-105 relative z-10">
                {brand.logoUrl ? (
                  <img
                    src={brand.logoUrl}
                    alt={brand.name}
                    className="max-w-full max-h-full object-contain filter dark:brightness-95"
                  />
                ) : stylizedLogo ? (
                  stylizedLogo
                ) : (
                  <span className="text-[12px] font-black text-slate-700 dark:text-slate-350 tracking-wider">
                    {brand.name}
                  </span>
                )}
              </div>

              {/* Verified glowing indicator dot */}
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 transition-all duration-300 group-hover:bg-red-500 group-hover:scale-125 group-hover:shadow-[0_0_8px_#ef4444]" />

              {/* Underline Slide Effect */}
              <span className="absolute bottom-0 left-0 w-0 h-[3px] bg-gradient-to-r from-red-500 to-rose-600 transition-all duration-300 group-hover:w-full" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
