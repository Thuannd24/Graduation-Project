import React from "react";

// Helper to render official brand logo style
export function getBrandLogo(label) {
  if (!label) return null;
  const brand = label.toLowerCase();
  switch (brand) {
    case "iphone":
    case "ipad":
    case "macbook":
    case "apple":
      return (
        <div className="flex items-center justify-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
          <svg className="h-4.5 w-4.5 fill-current text-slate-800 dark:text-slate-200" viewBox="0 0 170 170">
            <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.13-1.9-14.36-6.08-3.69-2.9-7.5-7.7-11.43-14.39-7.85-13.4-11.78-26.81-11.78-40.2 0-13.1 3.29-23.95 9.87-32.57 6.58-8.62 14.82-12.96 24.72-13.02 4.47 0 9.27 1.25 14.39 3.75 5.12 2.5 8.4 3.75 9.84 3.75 1.96 0 5.48-1.31 10.57-3.93 5.09-2.62 9.74-3.87 13.96-3.75 15.22.88 26.66 6.86 34.33 17.93-13.1 7.93-19.55 18.23-19.34 30.91.2 10.3 4.1 19.04 11.7 26.23 7.6 7.19 16.71 10.96 27.34 11.31.25.13.25.25.25.38zm-30.82-121c0 8.3-3.13 16.14-9.39 23.51-6.26 7.37-13.62 11.76-22.09 13.16.2-7.58 3.26-15.11 9.21-22.59 5.95-7.48 13.34-12.06 22.18-13.73.06-.06.09-.12.09-.35z" />
          </svg>
          <span className="text-[13px] font-extrabold">{label}</span>
        </div>
      );
    case "samsung":
      return (
        <span className="text-[#034ea2] font-black tracking-tighter text-[12px] font-sans uppercase">
          SAMSUNG
        </span>
      );
    case "xiaomi":
      return (
        <div className="flex items-center gap-1">
          <span className="bg-[#ff6700] text-white font-extrabold text-[9px] px-1 rounded font-sans leading-none flex items-center h-3.5">
            mi
          </span>
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Xiaomi</span>
        </div>
      );
    case "oppo":
      return (
        <span className="text-[#10b981] font-bold text-[12px] font-mono tracking-widest lowercase">
          oppo
        </span>
      );
    case "realme":
      return (
        <span className="text-[#ffc915] font-black italic text-[12px] lowercase">
          realme
        </span>
      );
    case "vivo":
      return (
        <span className="text-[#415fff] font-black tracking-wider text-[11px] italic uppercase">
          vivo
        </span>
      );
    case "oneplus":
      return (
        <span className="text-[#eb0028] font-extrabold border-2 border-[#eb0028] text-[8px] px-1 rounded-sm uppercase">
          1+ ONEPLUS
        </span>
      );
    case "asus":
      return (
        <span className="text-[#00539b] font-black tracking-tighter text-[11px] italic uppercase">
          ASUS
        </span>
      );
    case "dell":
      return (
        <div className="flex items-center gap-1">
          <span className="text-[#007dbd] font-bold border border-[#007dbd] rounded-full text-[8px] w-3.5 h-3.5 flex items-center justify-center font-sans">
            D
          </span>
          <span className="text-[11px] font-extrabold text-[#007dbd]">DELL</span>
        </div>
      );
    case "hp":
      return (
        <span className="text-[#0096d6] font-extrabold italic text-[12px] lowercase">
          hp
        </span>
      );
    case "lenovo":
      return (
        <span className="bg-[#e11d48] text-white font-bold text-[9px] px-1.5 py-0.5 rounded lowercase">
          lenovo
        </span>
      );
    case "acer":
      return (
        <span className="text-[#83b81a] font-black text-[11px] lowercase">
          acer
        </span>
      );
    case "msi":
      return (
        <span className="text-[#e11d48] font-black tracking-widest text-[11px] uppercase">
          msi
        </span>
      );
    case "sony":
      return (
        <span className="text-black dark:text-white font-serif font-extrabold tracking-widest text-[9px] uppercase">
          SONY
        </span>
      );
    case "jbl":
      return (
        <span className="bg-[#ff6700] text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
          JBL
        </span>
      );
    case "marshall":
      return (
        <span className="text-black dark:text-white font-serif font-light italic text-[12px] lowercase">
          marshall
        </span>
      );
    case "bose":
      return (
        <span className="text-black dark:text-white font-black tracking-widest text-[10px] italic uppercase">
          BOSE
        </span>
      );
    case "anker":
      return (
        <span className="text-[#00a8e8] font-bold text-[11px] uppercase">
          ANKER
        </span>
      );
    case "logitech":
      return (
        <span className="text-[#00b0ff] font-extrabold text-[10px] lowercase">
          logi
        </span>
      );
    case "garmin":
      return (
        <span className="text-black dark:text-white font-bold text-[10px] uppercase">
          GARMIN
        </span>
      );
    case "tecno":
      return (
        <span className="text-[#005aff] font-black tracking-tighter text-[12px] uppercase">
          TECNO
        </span>
      );
    case "honor":
      return (
        <span className="text-[#0c2340] dark:text-slate-200 font-black tracking-widest text-[11px] uppercase">
          HONOR
        </span>
      );
    case "nubia":
      return (
        <span className="text-[#e11d48] font-extrabold text-[12px] tracking-tight uppercase">
          nubia
        </span>
      );
    case "nokia":
      return (
        <span className="text-[#1241b6] font-bold text-[11px] font-sans uppercase">
          NOKIA
        </span>
      );
    case "nothing":
      return (
        <span className="text-black dark:text-white font-mono font-bold tracking-widest text-[9px] uppercase">
          NOTHING
        </span>
      );
    case "masstel":
      return (
        <span className="text-[#bf081f] font-extrabold text-[11px] uppercase">
          Masstel
        </span>
      );
    case "itel":
      return (
        <span className="text-[#ff007f] font-black text-[12px] lowercase">
          itel
        </span>
      );
    case "huawei":
      return (
        <span className="text-[#e11d48] font-black tracking-tighter text-[11px] uppercase">
          HUAWEI
        </span>
      );
    case "meizu":
      return (
        <span className="text-[#00b0ff] font-bold text-[12px] lowercase">
          MEIZU
        </span>
      );
    case "infinix":
      return (
        <span className="text-black dark:text-white font-sans font-bold text-[12px] tracking-tighter">
          Infinix
        </span>
      );
    default:
      return null;
  }
}
