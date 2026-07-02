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

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    Promise.all([
      productApi.listProducts(),
      productApi.listCategories(),
    ])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentSlide((p) => (p + 1) % SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  const nextSlide = () => setCurrentSlide((p) => (p + 1) % SLIDES.length);
  const prevSlide = () => setCurrentSlide((p) => (p - 1 + SLIDES.length) % SLIDES.length);

  const dualCategories = categories.slice(0, 2);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="home-hero items-stretch">
        <CategorySidebar />

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="hero-banner relative group overflow-hidden rounded-xl shadow-sm w-full h-[310px] min-h-[310px]">
            {SLIDES.map((slide, idx) => (
              <Link
                key={idx}
                to={slide.link}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
              >
                <img alt={`Banner ${idx}`} src={slide.image} className="w-full h-full object-cover" />
              </Link>
            ))}
            <button onClick={prevSlide} type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity border-none cursor-pointer flex items-center">
              <Icon name="chevron_left" className="text-xl" />
            </button>
            <button onClick={nextSlide} type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity border-none cursor-pointer flex items-center">
              <Icon name="chevron_right" className="text-xl" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
              {SLIDES.map((_, idx) => (
                <button key={idx} onClick={() => setCurrentSlide(idx)} type="button"
                  className={`h-2 rounded-full border-none cursor-pointer transition-all duration-300 ${idx === currentSlide ? "bg-primary w-5 scale-125" : "bg-white/50 hover:bg-white/85 w-2"}`}
                  aria-label={`Slide ${idx + 1}`} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-[124px] min-h-[124px]">
            {[under0, under1, under2].map((src, i) => (
              <Link key={i} to="/category" className="block rounded-xl overflow-hidden hover:scale-[1.02] transition-transform shadow-sm h-full">
                <img src={src} alt={`Sub-banner ${i + 1}`} className="w-full h-full object-cover rounded-xl" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Ảnh 1: Deal Sốc */}
      <FlashDealSection products={products} loading={loading} />

      {/* Ảnh 2: Gợi ý cho bạn */}
      <SuggestedSection products={products} loading={loading} />

      {/* Ảnh 3: Điện thoại / Máy tính bảng */}
      <CategoryDualSection categories={categories} />

      {/* Ảnh 4: Phụ kiện chất lượng */}
      <AccessoriesSection categories={categories} />

      {/* Ảnh 5: Laptop */}
      <LaptopShowcaseSection categories={categories} />
    </div>
  );
}
