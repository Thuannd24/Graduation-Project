import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CategorySidebar from "../components/CategorySidebar.jsx";
import { productApi } from "../../../services/productApi";
import Icon from "../../../components/common/Icon.jsx";
import FlashDealSection from "../components/FlashDealSection.jsx";
import SuggestedSection from "../components/SuggestedSection.jsx";
import CategoryDualSection from "../components/CategoryDualSection.jsx";
import AccessoriesSection from "../components/AccessoriesSection.jsx";
import LaptopShowcaseSection from "../components/LaptopShowcaseSection.jsx";
import BrandShowcaseSection from "../components/BrandShowcaseSection.jsx";
import { SubBannersGrid, WidePromoBanner } from "../components/PromoBannersSection.jsx";
import { aiApi } from "../../../services/aiApi.ts";

import banner0 from "../../../assets/images/banner0.webp";
import banner1 from "../../../assets/images/banner1.webp";
import banner2 from "../../../assets/images/banner2.webp";
import banner3 from "../../../assets/images/banner3.webp";
import banner4 from "../../../assets/images/banner4.webp";
import under0 from "../../../assets/images/under0.webp";
import under1 from "../../../assets/images/under1.png";
import under2 from "../../../assets/images/under2.webp";

const SLIDES = [
  { image: banner0, link: "/category" },
  { image: banner1, link: "/category" },
  { image: banner2, link: "/category" },
  { image: banner3, link: "/category" },
  { image: banner4, link: "/category" },
];

const SLIDE_TITLES = [
  { main: "LÊN ĐỜI SIÊU PHẨM", sub: "iPhone 15 Pro Max giảm sâu" },
  { main: "TIVI MÀN HÌNH LỚN", sub: "Giảm đến 40% - Mua ngay" },
  { main: "LAPTOP GAMING", sub: "Tặng voucher 1 triệu đồng" },
  { main: "PHỤ KIỆN GIÁ SỐC", sub: "Chỉ từ 9k - Deal cực ngon" },
  { main: "LOA - TAI NGHE", sub: "Giảm sâu đến 50%" },
];

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [personalizedProducts, setPersonalizedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [newsList, setNewsList] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    Promise.all([productApi.listProducts(), productApi.listCategories()])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    aiApi.getPersonalizedRecommendations()
      .then(setPersonalizedProducts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((p) => (p + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("https://api.rss2json.com/v1/api.json?rss_url=https://vnexpress.net/rss/so-hoa.rss")
      .then((res) => res.json())
      .then((data) => {
        if (active && data.status === "ok" && data.items && data.items.length > 0) {
          const formatted = data.items.slice(0, 2).map((item, idx) => {
            let imgUrl = item.thumbnail || (item.enclosure && item.enclosure.link);
            if (!imgUrl && item.description) {
              const match = item.description.match(/<img[^>]+src="([^">]+)"/);
              if (match && match[1]) {
                imgUrl = match[1];
              }
            }
            if (imgUrl) {
              if (imgUrl.startsWith("//")) {
                imgUrl = "https:" + imgUrl;
              }
              // Replace escaped html entities &amp; with real & for CDN request
              imgUrl = imgUrl.replace(/&amp;/g, "&");
            }
            return {
              id: idx + 1,
              title: item.title,
              link: item.link,
              image: imgUrl || ""
            };
          });
          setNewsList(formatted);
          setLoadingNews(false);
        } else {
          throw new Error("Invalid RSS data");
        }
      })
      .catch((err) => {
        console.warn("VnExpress RSS news fetch error:", err);
        if (active) {
          setNewsList([]);
          setLoadingNews(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const nextSlide = () => setCurrentSlide((p) => (p + 1) % SLIDES.length);
  const prevSlide = () => setCurrentSlide((p) => (p - 1 + SLIDES.length) % SLIDES.length);

  const dualCategories = categories.slice(0, 2);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="flex flex-col lg:flex-row gap-4 items-stretch select-none">
        <CategorySidebar />

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Main Grid: Slider (3 cols) + Side Banners (1 col) */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            {/* Middle: Clean full-bleed Slider */}
            <div className="xl:col-span-3 flex flex-col h-[180px] sm:h-[280px] md:h-[350px] xl:h-[420px] bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-md border border-slate-100 dark:border-slate-800">
              <div className="flex-1 relative group overflow-hidden bg-slate-50 dark:bg-slate-950">
                {SLIDES.map((slide, idx) => (
                  <Link
                    key={idx}
                    to={slide.link}
                    className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${idx === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
                  >
                    <img alt={`Banner ${idx}`} src={slide.image} className="w-full h-full object-cover sm:object-fill" />
                  </Link>
                ))}
                <button onClick={prevSlide} type="button"
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity border-none cursor-pointer flex items-center shadow-sm">
                  <Icon name="chevron_left" className="text-xl" />
                </button>
                <button onClick={nextSlide} type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity border-none cursor-pointer flex items-center shadow-sm">
                  <Icon name="chevron_right" className="text-xl" />
                </button>
              </div>
            </div>

            {/* Right: Custom Promo & News Widget Panel */}
            <div className="hidden xl:flex flex-col gap-2.5 h-[420px]">
              {/* Tech News Box */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between flex-1">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5">
                  <span className="text-[11px] font-extrabold text-red-600 tracking-wider uppercase flex items-center gap-1">
                    <Icon name="newspaper" className="text-sm shrink-0 text-red-600" /> Tin công nghệ
                  </span>
                  <a href="https://vnexpress.net/so-hoa" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-bold">Xem thêm</a>
                </div>
                <div className="flex flex-col gap-2.5 flex-1 justify-center">
                  {loadingNews ? (
                    <div className="flex flex-col gap-3 py-1.5 animate-pulse">
                      <div className="flex gap-2">
                        <div className="w-12 h-10 bg-slate-200 dark:bg-slate-800 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded" />
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="w-12 h-10 bg-slate-200 dark:bg-slate-800 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded" />
                          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
                        </div>
                      </div>
                    </div>
                  ) : newsList.length > 0 ? (
                    newsList.map((news) => {
                      const isExternal = news.link.startsWith("http");
                      const LinkComp = isExternal ? "a" : Link;
                      const linkProps = isExternal ? { href: news.link, target: "_blank", rel: "noopener noreferrer" } : { to: news.link };
                      return (
                        <LinkComp key={news.id} {...linkProps} className="flex gap-2 group">
                          {news.image && (
                            <div className="w-12 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-100 dark:border-slate-800">
                              <img src={news.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="News thumbnail" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight group-hover:text-red-600 transition-colors">
                              {news.title}
                            </h4>
                          </div>
                        </LinkComp>
                      );
                    })
                  ) : (
                    <div className="text-center py-3">
                      <span className="text-[10px] text-slate-400 font-bold block">Tạm thời không tải được tin tức</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Utility Promotions List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between flex-[2.2]">
                <h5 className="text-[11px] font-extrabold text-red-600 tracking-wider uppercase border-b border-slate-100 dark:border-slate-800 pb-1 mb-1.5">Ưu đãi độc quyền</h5>
                <div className="flex flex-col gap-2.5 flex-1 justify-center">
                  <div className="flex items-center gap-2 group cursor-pointer">
                    <Icon name="school" className="text-slate-400 group-hover:text-red-500 text-base shrink-0 transition-colors" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-none">Ưu đãi cho Học sinh - Sinh viên</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-none">Giảm thêm đến 3% toàn bộ sản phẩm</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 group cursor-pointer">
                    <Icon name="sync" className="text-slate-400 group-hover:text-red-500 text-base shrink-0 transition-colors" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-none">Thu cũ đổi mới trợ giá khủng</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-none">Thu cũ lên đời trợ giá đến 2 triệu</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 group cursor-pointer">
                    <Icon name="local_shipping" className="text-slate-400 group-hover:text-red-500 text-base shrink-0 transition-colors" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-none">Giao hàng miễn phí toàn quốc</p>
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-none">Đơn hàng từ 300k - Giao nhanh 2h</p>
                    </div>
                  </div>
                </div>
                {/* Micro banner at the bottom of the widget */}
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Link to="/category" className="block overflow-hidden rounded-lg relative group h-[64px]">
                    <img src={under0} alt="Right widget mini promo" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors pointer-events-none" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Grid: 3 Sub-banners */}
          <SubBannersGrid />
        </div>
      </section>

      {/* Premium Full-width Promo Banner */}
      <WidePromoBanner />

      {/* Ảnh 1: Deal Sốc */}
      <FlashDealSection products={products} loading={loading} />

      {/* Ảnh 2: Gợi ý cho bạn */}
      <SuggestedSection products={personalizedProducts} loading={loading} />

      {/* Ảnh 3: Điện thoại / Máy tính bảng */}
      <CategoryDualSection categories={categories} />

      {/* Ảnh 4: Phụ kiện chất lượng */}
      <AccessoriesSection categories={categories} />

      {/* Ảnh 5: Laptop */}
      <LaptopShowcaseSection categories={categories} />

      {/* Brand Showcase Section */}
      <BrandShowcaseSection />
    </div>
  );
}
