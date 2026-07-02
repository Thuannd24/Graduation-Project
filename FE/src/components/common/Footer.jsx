import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import logoImg from "../../assets/images/image.png";

export default function Footer() {
  return (
    <footer className="bg-slate-100 text-slate-600 pt-16 pb-8 border-t-4 border-primary font-sans">
      <div className="max-w-container-max mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        
        {/* Brand Information Section */}
        <section className="flex flex-col gap-5">
          <Link className="flex items-center gap-3 text-slate-900 text-2xl font-black tracking-tight" to="/">
            <img src={logoImg} alt="AuraTech Logo" className="h-12 w-auto object-contain rounded-lg shadow-sm border border-slate-200" />
            <span className="font-extrabold text-2xl bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">AuraTech</span>
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
              <Link to="/warranty" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách bảo hành
              </Link>
            </li>
            <li>
              <Link to="/warranty" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách đổi trả 30 ngày
              </Link>
            </li>
            <li>
              <Link to="/warranty" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chính sách giao nhận hàng
              </Link>
            </li>
            <li>
              <Link to="/warranty" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
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
            <li>
              <Link to="/stores" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Hệ thống cửa hàng toàn quốc
              </Link>
            </li>
            <li>
              <Link to="/tradein" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Chương trình thu cũ đổi mới
              </Link>
            </li>
            <li>
              <Link to="/warranty" className="hover:text-red-600 hover:translate-x-1.5 inline-flex items-center gap-1.5 transition-all duration-200">
                <span className="text-[10px] text-red-500">●</span> Trung tâm bảo hành uỷ quyền
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
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white hover:bg-red-600 text-slate-600 hover:text-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm border border-slate-200">
                <Icon name="public" className="text-lg" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white hover:bg-red-600 text-slate-600 hover:text-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm border border-slate-200">
                <Icon name="play_circle" className="text-lg" filled />
              </a>
              <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white hover:bg-red-600 text-slate-600 hover:text-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm border border-slate-200">
                <Icon name="music_note" className="text-lg" />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-slate-900 text-sm font-bold uppercase tracking-wider mb-4 border-l-2 border-red-600 pl-3">
              Phương thức thanh toán
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {["VISA", "MOMO", "ZALOPAY", "VNPAY"].map((item) => (
                <div key={item} className="bg-white border border-slate-200 rounded-lg py-2.5 text-center text-[10px] font-black text-slate-700 hover:border-slate-400 transition-colors shadow-sm">
                  {item}
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
