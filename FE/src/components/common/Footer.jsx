import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

const SOCIAL_LINKS = [
  {
    name: "Facebook",
    href: "https://facebook.com",
    color: "#1877F2",
    path: "M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
  },
  {
    name: "YouTube",
    href: "https://youtube.com",
    color: "#FF0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
  },
  {
    name: "TikTok",
    href: "https://tiktok.com",
    color: "#000000",
    path: "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
  }
];

const PAYMENT_METHODS = [
  { name: "VISA", bg: "linear-gradient(135deg,#1a1f71,#2b3a9e)" },
  { name: "MoMo", bg: "linear-gradient(135deg,#a50064,#d82d8b)" },
  { name: "ZaloPay", bg: "linear-gradient(135deg,#0068ff,#00a2ff)" },
  { name: "VNPAY", bg: "linear-gradient(135deg,#005baa,#00a8e8)" }
];

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-slate-100 to-slate-200/70 text-slate-600 pt-16 pb-8 border-t-4 border-primary font-sans relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="max-w-container-max mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        
        {/* Brand Information Section */}
        <section className="flex flex-col gap-5">
          <Link className="flex items-center select-none hover:opacity-90 transition-opacity font-orbitron text-2xl tracking-wider uppercase" to="/">
            <span className="font-black text-slate-900 drop-shadow-[0_2px_4px_rgba(0,0,0,0.06)]">Aura</span>
            <span className="font-light text-rose-600 text-lg border-l border-slate-300 pl-2 ml-2 tracking-widest">Tech</span>
          </Link>
          <p className="text-sm leading-relaxed text-slate-500">
            Hệ thống bán lẻ điện thoại, laptop, thiết bị công nghệ chính hãng hàng đầu Việt Nam. Cam kết chất lượng, bảo hành uy tín.
          </p>
          <div className="flex items-center gap-3.5 bg-white border border-slate-200/80 rounded-2xl p-4 mt-2 shadow-sm">
            <div className="p-2.5 bg-red-500/10 rounded-xl text-red-600">
              <Icon name="phone_in_talk" className="text-xl" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Hotline hỗ trợ (Miễn phí)</p>
              <a href="tel:18002097" className="text-lg font-black text-slate-900 hover:text-red-600 transition-colors">1800.2097</a>
            </div>
          </div>
        </section>

        {/* Group 1: Thông tin chính sách */}
        <section>
          <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-6 border-l-2 border-red-600 pl-3">
            Thông tin &amp; Chính sách
          </h3>
          <ul className="space-y-3.5 text-sm">
            <li>
              <Link to="/profile?tab=policy" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách bảo hành
              </Link>
            </li>
            <li>
              <Link to="/profile?tab=policy" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách đổi trả 30 ngày
              </Link>
            </li>
            <li>
              <Link to="/profile?tab=policy" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách giao nhận hàng
              </Link>
            </li>
            <li>
              <Link to="/profile?tab=policy" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách bảo mật thông tin
              </Link>
            </li>
          </ul>
        </section>

        {/* Group 2: Hỗ trợ khách hàng */}
        <section>
          <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-6 border-l-2 border-red-600 pl-3">
            Hỗ trợ khách hàng
          </h3>
          <ul className="space-y-3.5 text-sm">
            <li>
              <Link to="/profile" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Tra cứu đơn hàng của bạn
              </Link>
            </li>
          </ul>
        </section>

        {/* Group 3: Kết nối & Thanh toán */}
        <section className="flex flex-col gap-6">
          <div>
            <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-4 border-l-2 border-red-600 pl-3">
              Kết nối với chúng tôi
            </h3>
            <div className="flex gap-3.5">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  title={social.name}
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                  style={{ backgroundColor: social.color }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" className="fill-white">
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-4 border-l-2 border-red-600 pl-3">
              Phương thức thanh toán
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {PAYMENT_METHODS.map((method) => (
                <div
                  key={method.name}
                  className="rounded-lg py-2.5 text-center text-[10px] font-black text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 tracking-wide"
                  style={{ background: method.bg }}
                >
                  {method.name}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Copyright footer bottom */}
      <div className="max-w-container-max mx-auto px-6 mt-16 pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400">
        <p>© 2026 AuraTech. All rights reserved.</p>
        <p className="text-slate-400 tracking-wider uppercase font-semibold">High-performance retail environment.</p>
      </div>
    </footer>
  );
}
