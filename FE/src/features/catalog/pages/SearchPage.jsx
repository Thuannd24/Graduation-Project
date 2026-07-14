import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import FilterPanel from "../components/category/FilterPanel.jsx";
import FilterDrawer from "../components/category/FilterDrawer.jsx";
import ProductToolbar from "../components/category/ProductToolbar.jsx";
import ProductGridSkeleton from "../components/category/ProductGridSkeleton.jsx";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";
import { PRICE_PRESETS } from "../utils/categoryUtils.js";
import { useDebounce } from "../hooks/useDebounce.js";

const DEFAULT_MAX_PRICE = 50000000;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const isImageSearch = searchParams.get("imageSearch") === "true";

  const selectedBrands = useMemo(
    () => searchParams.get("brand")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const minPrice = Number(searchParams.get("minPrice") || 0);
  const maxPrice = Number(searchParams.get("maxPrice") || DEFAULT_MAX_PRICE);
  const onSale = searchParams.get("sale") === "1";
  const sort = searchParams.get("sort") || "featured";

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const [uploadedImage, setUploadedImage] = useState("");
  const [cropBox, setCropBox] = useState(null);

  const [priceDraft, setPriceDraft] = useState({ min: minPrice, max: maxPrice });
  const debouncedPrice = useDebounce(priceDraft, 400);

  const updateFilters = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        next.delete(key);
        return;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) next.delete(key);
        else next.set(key, value.join(","));
        return;
      }
      next.set(key, String(value));
    });
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setPriceDraft({ min: minPrice, max: maxPrice });
  }, [minPrice, maxPrice]);

  useEffect(() => {
    if (debouncedPrice.min === minPrice && debouncedPrice.max === maxPrice) return;
    updateFilters({ minPrice: debouncedPrice.min, maxPrice: debouncedPrice.max });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPrice]);

  useEffect(() => {
    setLoading(true);
    setError("");

    if (isImageSearch) {
      const cachedResults = sessionStorage.getItem("visual_search_results");
      const cachedImage = sessionStorage.getItem("visual_search_image");
      const cachedCrop = sessionStorage.getItem("visual_search_crop");

      setAllProducts(cachedResults ? JSON.parse(cachedResults) : []);
      if (cachedImage) setUploadedImage(cachedImage);
      if (cachedCrop) setCropBox(JSON.parse(cachedCrop));
      setLoading(false);
    } else {
      productApi
        .searchProducts(query, 0, 100)
        .then((result) => setAllProducts(result.items))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [query, isImageSearch]);

  const availableBrands = useMemo(() => {
    const names = Array.from(new Set(allProducts.map((p) => p.brand).filter(Boolean)));
    return names.map((name) => ({ id: name, name }));
  }, [allProducts]);

  const toggleBrand = (brand) => {
    const next = selectedBrands.includes(brand)
      ? selectedBrands.filter((b) => b !== brand)
      : [...selectedBrands, brand];
    updateFilters({ brand: next });
  };

  const activePricePreset = useMemo(
    () => PRICE_PRESETS.find((p) => p.min === minPrice && p.max === maxPrice) || null,
    [minPrice, maxPrice]
  );

  const activeFilterCount =
    selectedBrands.length +
    (onSale ? 1 : 0) +
    (minPrice > 0 || maxPrice < DEFAULT_MAX_PRICE ? 1 : 0);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(product.brand)) return false;
      if (onSale) {
        const isDiscounted = Number(product.oldPrice || 0) > Number(product.price || 0);
        if (!isDiscounted) return false;
      }
      const price = Number(product.price || 0);
      if (price < minPrice || price > maxPrice) return false;
      return true;
    });
  }, [allProducts, selectedBrands, onSale, minPrice, maxPrice]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (sort === "price_asc") return list.sort((a, b) => a.price - b.price);
    if (sort === "price_desc") return list.sort((a, b) => b.price - a.price);
    if (sort === "rating_desc") return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return list;
  }, [filteredProducts, sort]);

  const filterPanelProps = {
    brands: availableBrands,
    selectedBrands,
    onBrandToggle: toggleBrand,
    onSale,
    onSaleChange: (v) => updateFilters({ sale: v ? "1" : null }),
    minPrice: priceDraft.min,
    maxPrice: priceDraft.max,
    onPriceChange: setPriceDraft,
    pricePreset: activePricePreset,
    onPricePreset: (preset) => {
      setPriceDraft({ min: preset.min, max: preset.max });
      updateFilters({ minPrice: preset.min, maxPrice: preset.max });
    },
    dynamicSpecFilters: [],
    onClearAll: () => {
      const next = new URLSearchParams();
      next.set("q", query);
      setSearchParams(next, { replace: true });
    },
  };

  return (
    <div className="max-w-container-max w-full mx-auto py-6 px-4 lg:px-6 min-h-screen">
      {/* Visual Search Context header */}
      {isImageSearch && uploadedImage ? (
        <div className="mb-6 p-5 bg-gradient-to-r from-rose-50 to-slate-50 dark:from-slate-900/40 dark:to-slate-900/10 rounded-2xl border border-rose-100 dark:border-slate-800 flex flex-col md:flex-row gap-6 items-center">
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
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-200">
              Sản phẩm tương đồng với ảnh tải lên
            </h1>
            <p className="text-sm text-slate-500">
              Aura AI đã trích xuất đặc trưng hình ảnh bằng mô hình <strong>CLIP ViT-B/32</strong> và tìm kiếm trên chỉ mục <strong>FAISS FlatIP Index</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Kết quả tìm kiếm: <span className="text-[#D70018]">"{query}"</span>
          </h1>
        </div>
      )}

      {error && (
        <div className="text-center py-16 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-2xl mb-4">
          <Icon name="error_outline" className="text-4xl text-red-400 mb-2" />
          <p className="text-red-600 font-semibold">{error}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-[280px] shrink-0">
          <div className="sticky top-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <FilterPanel {...filterPanelProps} />
          </div>
        </aside>

        {/* Main content */}
        <section className="flex-1 min-w-0 space-y-5">
          <ProductToolbar
            title={`Kết quả cho "${query}"`}
            count={sortedProducts.length}
            sort={sort}
            onSortChange={(v) => updateFilters({ sort: v })}
            brands={availableBrands}
            selectedBrands={selectedBrands}
            onBrandToggle={toggleBrand}
            onOpenFilters={() => setFilterDrawerOpen(true)}
            activeFilterCount={activeFilterCount}
          />

          {loading ? (
            <ProductGridSkeleton count={9} />
          ) : sortedProducts.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
              <Icon name="search_off" className="text-5xl text-slate-300 mb-3" />
              <p className="text-slate-600 font-semibold mb-1">Không tìm thấy sản phẩm</p>
              <p className="text-sm text-slate-400 mb-4">Thử từ khóa khác hoặc điều chỉnh bộ lọc</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={filterPanelProps.onClearAll}
                  className="px-5 py-2 rounded-lg bg-[#D70018] text-white text-sm font-bold border-none cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
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
          )}
        </section>
      </div>

      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        resultCount={sortedProducts.length}
        filterPanelProps={filterPanelProps}
      />
    </div>
  );
}
