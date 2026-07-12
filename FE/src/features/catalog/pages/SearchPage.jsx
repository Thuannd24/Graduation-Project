import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";
import { formatVnd } from "../../../utils/format.js";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const isImageSearch = searchParams.get("imageSearch") === "true";

  const [products, setProducts] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [uploadedImage, setUploadedImage] = useState("");
  const [cropBox, setCropBox] = useState(null);

  useEffect(() => {
    setLoading(true);
    setSelectedBrands([]);

    if (isImageSearch) {
      // Fetch visual search results from local storage
      const cachedResults = sessionStorage.getItem("visual_search_results");
      const cachedImage = sessionStorage.getItem("visual_search_image");
      const cachedCrop = sessionStorage.getItem("visual_search_crop");

      if (cachedResults) {
        setProducts(JSON.parse(cachedResults));
      } else {
        setProducts([]);
      }
      if (cachedImage) setUploadedImage(cachedImage);
      if (cachedCrop) setCropBox(JSON.parse(cachedCrop));

      setLoading(false);
    } else {
      productApi
        .searchProducts(query)
        .then(setProducts)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [query, isImageSearch]);

  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))), [products]);
  const sortedProducts = useMemo(() => {
    const list = products.filter((product) => selectedBrands.length === 0 || selectedBrands.includes(product.brand));
    if (sortBy === "price-asc") return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "price-desc") return [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") return [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return list;
  }, [products, selectedBrands, sortBy]);

  const handleBrandChange = (brand) => {
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  };

  return (
    <div className="max-w-container-max w-full mx-auto py-md px-md lg:px-lg min-h-screen text-on-background font-body-lg">
      
      {/* Visual Search Context header */}
      {isImageSearch && uploadedImage ? (
        <div className="mb-8 p-5 bg-gradient-to-r from-rose-50 to-slate-50 dark:from-slate-900/40 dark:to-slate-900/10 rounded-2xl border border-rose-100 dark:border-slate-800 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative w-36 h-36 bg-white dark:bg-slate-950 rounded-xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-800 shrink-0">
            <img src={uploadedImage} alt="Search Query" className="w-full h-full object-contain" />
            {cropBox && (
              <div
                style={{
                  position: "absolute",
                  left: `${cropBox.x}%`,
                  top: `${cropBox.y}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                  border: "2px solid #ef4444",
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.2)"
                }}
              />
            )}
            <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow">
              YOLO v8 detected
            </span>
          </div>
          <div className="flex-1 space-y-2 text-center md:text-left">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase rounded-full tracking-wider shadow-sm">
              <Icon name="center_focus_strong" className="text-xs" />
              Tìm kiếm bằng hình ảnh
            </span>
            <h1 className="text-headline-md font-black text-slate-800 dark:text-slate-200">
              Sản phẩm tương đồng với ảnh tải lên
            </h1>
            <p className="font-body-sm text-secondary">
              Aura AI đã trích xuất đặc trưng hình ảnh bằng mô hình <strong>CLIP ViT-B/32</strong> và tìm kiếm trên chỉ mục <strong>FAISS FlatIP Index</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-md">
          <h1 className="text-headline-md font-bold mb-xs">Kết quả tìm kiếm: <span className="text-primary">"{query}"</span></h1>
          <p className="font-body-sm text-secondary">Tìm thấy <strong>{sortedProducts.length}</strong> sản phẩm.</p>
        </div>
      )}

      {loading && <p className="admin-note">Đang tải kết quả tìm kiếm...</p>}
      {error && <p className="admin-error">{error}</p>}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-md items-start">
          <aside className="md:col-span-3 bg-surface-container-lowest p-md rounded-lg shadow-sm border border-surface-container-highest space-y-md">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide border-b border-surface-container-highest pb-xs mb-sm flex items-center justify-between">
              <span>Hãng sản xuất</span>
              <Icon className="text-secondary text-[16px]" name="filter_alt" />
            </h3>
            {brands.map((brand) => (
              <label key={brand} className="flex items-center gap-sm font-body-sm cursor-pointer text-on-surface-variant hover:text-on-surface">
                <input type="checkbox" checked={selectedBrands.includes(brand)} onChange={() => handleBrandChange(brand)} />
                <span>{brand}</span>
              </label>
            ))}
          </aside>
          
          <section className="md:col-span-9 space-y-md">
            <div className="bg-surface-container-lowest p-sm px-md rounded-lg shadow-sm border border-surface-container-highest flex flex-col sm:flex-row items-center justify-between gap-sm">
              <span className="font-body-sm text-secondary">Sắp xếp</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="relevance">Liên quan nhất</option>
                <option value="price-asc">Giá tăng dần</option>
                <option value="price-desc">Giá giảm dần</option>
                <option value="rating">Đánh giá tốt nhất</option>
              </select>
            </div>
            
            {sortedProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
                {sortedProducts.map((product) => (
                  <div key={product.id} className="relative group">
                    <ProductCard product={product} />
                    {isImageSearch && product.matchScore && (
                      <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow-md z-10 flex items-center gap-1 select-none">
                        <Icon name="check_circle" className="text-[10px]" />
                        Độ khớp: {product.matchScore}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-xl text-center">
                <Icon className="text-[64px] text-secondary opacity-40" name="search_off" />
                <h3 className="font-bold text-headline-md text-on-surface">Không tìm thấy sản phẩm tương đồng</h3>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
