import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import FilterPanel from "../components/category/FilterPanel.jsx";
import FilterDrawer from "../components/category/FilterDrawer.jsx";
import ProductToolbar from "../components/category/ProductToolbar.jsx";
import ProductGridSkeleton from "../components/category/ProductGridSkeleton.jsx";
import Icon from "../../../components/common/Icon.jsx";
import { aiApi } from "../../../services/aiApi.ts";
import { productApi } from "../../../services/productApi";
import { PRICE_PRESETS, PRICE_MAX } from "../utils/categoryUtils.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { trackBehavior, trackImpressions } from "../../../services/behaviorTracker.ts";

const DEFAULT_MAX_PRICE = PRICE_MAX;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";

  // Tìm kiếm = hành vi chủ động tìm thứ cụ thể, khác hẳn duyệt lướt. KHÔNG gửi nội dung truy vấn
  // (không cần cho bài toán, và tránh thu thập dữ liệu không cần thiết) — chỉ ghi nhận "đã tìm".
  useEffect(() => {
    if (query.trim()) trackBehavior("SEARCH");
  }, [query]);

  const selectedBrands = useMemo(
    () => searchParams.get("brand")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const minPrice = Number(searchParams.get("minPrice") || 0);
  const maxPrice = Number(searchParams.get("maxPrice") || DEFAULT_MAX_PRICE);
  const onSale = searchParams.get("sale") === "1";
  const sort = searchParams.get("sort") || "featured";

  // FILTER_APPLIED/SORT_APPLIED: bỏ qua lần render đầu (giá trị mặc định từ URL) — chỉ bắn khi
  // user THỰC SỰ đổi filter/sort sau đó (giống CategoryPage.jsx).
  const filterMounted = useRef(false);
  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return;
    }
    trackBehavior("FILTER_APPLIED");
  }, [selectedBrands, onSale, minPrice, maxPrice]);

  const sortMounted = useRef(false);
  useEffect(() => {
    if (!sortMounted.current) {
      sortMounted.current = true;
      return;
    }
    trackBehavior("SORT_APPLIED");
  }, [sort]);

  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

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

    // Chạy song song tìm theo từ khóa và tìm ngữ nghĩa (AI). Giữ thứ tự xếp hạng của AI (đã kết hợp
    // BM25 + vector), dùng bản ghi đầy đủ từ product-service khi có, rồi nối các kết quả chỉ khớp từ khóa.
    Promise.all([
      productApi.searchProducts(query, 0, 100).then((result) => result.items).catch(() => null),
      // Tìm kiếm AI có giới hạn 4 giây (vd. lúc model vừa khởi động) -> quá hạn thì dùng kết quả từ khóa.
      Promise.race([aiApi.searchText(query, 40), new Promise((resolve) => setTimeout(() => resolve([]), 4000))])
    ])
      .then(([keywordItems, semanticItems]) => {
        if (keywordItems === null && semanticItems.length === 0) {
          throw new Error("Không thể tìm kiếm lúc này, vui lòng thử lại.");
        }
        const keywordById = new Map((keywordItems || []).map((p) => [String(p.id), p]));
        const seen = new Set();
        const merged = [];
        for (const item of semanticItems) {
          const id = String(item.id);
          if (seen.has(id)) continue;
          seen.add(id);
          merged.push(keywordById.get(id) || item);
        }
        for (const item of keywordItems || []) {
          if (!seen.has(String(item.id))) merged.push(item);
        }
        setAllProducts(merged);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

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

  // Ghi nhận sản phẩm THẬT SỰ hiển thị cho user sau khi lọc/sắp xếp xong — không phải toàn bộ
  // allProducts đã tải (có thể lớn hơn nhiều những gì user thấy).
  useEffect(() => {
    if (sortedProducts.length > 0) trackImpressions(sortedProducts.map((p) => p.id), "search");
  }, [sortedProducts]);

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
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Kết quả tìm kiếm: <span className="text-[#D70018]">"{query}"</span>
        </h1>
      </div>

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
            loading={loading}
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
