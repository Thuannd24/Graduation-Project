import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import CategoryTabs from "../components/category/CategoryTabs.jsx";
import FilterPanel from "../components/category/FilterPanel.jsx";
import FilterDrawer from "../components/category/FilterDrawer.jsx";
import ActiveFilterChips from "../components/category/ActiveFilterChips.jsx";
import ProductToolbar from "../components/category/ProductToolbar.jsx";
import ProductGridSkeleton from "../components/category/ProductGridSkeleton.jsx";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";
import { useCategoryFilters } from "../hooks/useCategoryFilters.js";
import { useDebounce } from "../hooks/useDebounce.js";
import {
  flattenCategories,
  getRootCategories,
  resolveCategory,
  formatCategoryName,
  isLaptopCategory,
  matchesLegacyCategory,
  productMatchesSpec,
  fetchAllCategoryProducts,
  PRICE_PRESETS,
} from "../utils/categoryUtils.js";

const ITEMS_PER_PAGE = 12;

const categoryPromotions = {
  laptop: [],
};

export default function CategoryPage() {
  const filters = useCategoryFilters();
  const {
    categorySlug,
    subSlug,
    brands: selectedBrands,
    minPrice,
    maxPrice,
    onSale,
    sort,
    page,
    specFilters,
    hasActiveFilters,
    updateFilters,
    setCategory,
    toggleBrand,
    toggleSpec,
    clearAllFilters,
    DEFAULT_MAX_PRICE,
  } = filters;

  const [products, setProducts] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [availableBrands, setAvailableBrands] = useState([]);
  const [categoryAttributes, setCategoryAttributes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min: minPrice, max: maxPrice });
  const debouncedPrice = useDebounce(priceDraft, 400);

  const flatCategories = useMemo(() => flattenCategories(categoryTree), [categoryTree]);
  const rootCategories = useMemo(() => getRootCategories(categoryTree), [categoryTree]);

  const resolved = useMemo(
    () => resolveCategory(flatCategories, categorySlug, subSlug),
    [flatCategories, categorySlug, subSlug]
  );

  const activeCategory = resolved?.category;
  const parentCategory = resolved?.parent;
  const displayTitle = formatCategoryName(activeCategory?.name || categorySlug || "Sản phẩm");

  const dynamicSpecFilters = useMemo(() => {
    if (!categoryAttributes.length) return [];
    
    const scoredFilters = categoryAttributes.map(attr => {
      const code = attr.attributeCode || attr.code || "";
      const name = attr.attributeName || attr.name || "";
      if (!code) return null;

      // Respect the admin's explicit isFilter setting — no hardcoding
      if (attr.isFilter === false) return null;
      
      // Bug fix 1: DTO field is attributeAllowedValues, not allowedValues
      let options = [];
      const rawAllowed = attr.attributeAllowedValues || attr.allowedValues;
      if (rawAllowed) {
        try {
          const parsed = JSON.parse(rawAllowed);
          if (Array.isArray(parsed)) {
            options = parsed.map(o => o.name || o.value || String(o));
          }
        } catch (e) {}
      }
      
      // Bug fix 2: variant attributes store values in product.variants[].variantAttr,
      // not in product.attributes — need to scan both sources
      const codeVariants = [code, code.toLowerCase(), code.toUpperCase()];
      
      const fromSpecs = products.flatMap(p =>
        codeVariants.map(c => p.attributes?.[c]).filter(v => v != null && String(v).trim() !== "")
      );

      const fromVariants = products.flatMap(p =>
        (p.variants || []).flatMap(v => {
          let vAttr = v.variantAttr;
          if (typeof vAttr === "string") { try { vAttr = JSON.parse(vAttr); } catch { vAttr = {}; } }
          vAttr = vAttr || {};
          return codeVariants.map(c => vAttr[c]).filter(val => val != null && String(val).trim() !== "");
        })
      );

      const allProdVals = [...fromSpecs, ...fromVariants];
      const uniqueVals = Array.from(new Set(allProdVals.map(v => String(v).trim())));
      const mergedOptions = Array.from(new Set([...options, ...uniqueVals]));
      
      if (mergedOptions.length <= 1) return null;
      
      // Heuristic popularity score
      const fillRate = products.length > 0 ? Math.min(allProdVals.length / products.length, 1) : 0;
      const cardinalityMultiplier = mergedOptions.length > 10 ? 0.5 : 1.0;
      
      // Boost variant & required attributes (they're important product dimensions)
      const priorityBoost = (attr.isVariant ? 0.5 : 0) + (attr.isRequired ? 0.3 : 0);
      const score = fillRate * cardinalityMultiplier + priorityBoost;
      
      return {
        key: code,
        label: name,
        options: mergedOptions,
        score
      };
    }).filter(Boolean);

    // Sort by score descending (highest popularity/importance first)
    return scoredFilters.sort((a, b) => b.score - a.score);
  }, [categoryAttributes, products]);

  const activePricePreset = useMemo(
    () => PRICE_PRESETS.find((p) => p.min === minPrice && p.max === maxPrice) || null,
    [minPrice, maxPrice]
  );

  const activeFilterCount =
    selectedBrands.length +
    (onSale ? 1 : 0) +
    (minPrice > 0 || maxPrice < DEFAULT_MAX_PRICE ? 1 : 0) +
    Object.values(specFilters).reduce((sum, arr) => sum + arr.length, 0);

  useEffect(() => {
    productApi.listCategories().then(setCategoryTree).catch(() => setCategoryTree([]));
  }, []);

  useEffect(() => {
    if (!categorySlug && rootCategories.length > 0) {
      const preferred =
        rootCategories.find((c) => (c.slug || "").includes("laptop")) ||
        rootCategories[0];
      if (preferred?.slug) setCategory(preferred.slug);
    }
  }, [categorySlug, rootCategories, setCategory]);

  useEffect(() => {
    setPriceDraft({ min: minPrice, max: maxPrice });
  }, [minPrice, maxPrice]);

  useEffect(() => {
    if (
      debouncedPrice.min === minPrice &&
      debouncedPrice.max === maxPrice
    ) {
      return;
    }
    updateFilters(
      { minPrice: debouncedPrice.min, maxPrice: debouncedPrice.max },
      { resetPage: true }
    );
  }, [debouncedPrice, minPrice, maxPrice, updateFilters]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      setError("");
      try {
        let items = [];
        if (activeCategory?.id) {
          items = await fetchAllCategoryProducts(productApi, activeCategory.id);
        } else {
          items = await productApi.listProducts();
          if (categorySlug) {
            items = items.filter((p) => matchesLegacyCategory(p, categorySlug));
          }
        }
        if (!cancelled) setProducts(items);
      } catch (err) {
        if (!cancelled) setError(err.message || "Không thể tải sản phẩm");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => { cancelled = true; };
  }, [activeCategory?.id, categorySlug]);

  useEffect(() => {
    if (activeCategory?.id) {
      productApi
        .listBrandsByCategory(activeCategory.id)
        .then(setAvailableBrands)
        .catch(() => setAvailableBrands([]));

      productApi
        .getCategoryAttributes(activeCategory.id)
        .then((res) => setCategoryAttributes(Array.isArray(res) ? res : []))
        .catch(() => setCategoryAttributes([]));
    } else if (parentCategory?.id) {
      productApi
        .listBrandsByCategory(parentCategory.id)
        .then(setAvailableBrands)
        .catch(() => setAvailableBrands([]));

      productApi
        .getCategoryAttributes(parentCategory.id)
        .then((res) => setCategoryAttributes(Array.isArray(res) ? res : []))
        .catch(() => setCategoryAttributes([]));
    } else {
      productApi.listBrands().then(setAvailableBrands).catch(() => setAvailableBrands([]));
      setCategoryAttributes([]);
    }
  }, [activeCategory?.id, parentCategory?.id]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (selectedBrands.length > 0) {
        const brand = String(product.brand || "").toLowerCase();
        const name = String(product.name || "").toLowerCase();
        const matches = selectedBrands.some(
          (b) => brand.includes(b.toLowerCase()) || name.includes(b.toLowerCase())
        );
        if (!matches) return false;
      }

      if (onSale) {
        const isDiscounted = Number(product.oldPrice || 0) > Number(product.price || 0);
        if (!isDiscounted) return false;
      }

      const price = Number(product.price || 0);
      if (price < minPrice || price > maxPrice) return false;

      for (const [group, values] of Object.entries(specFilters)) {
        if (values.length === 0) continue;

        // Check product.attributes (static specs)
        const attrVal = product.attributes?.[group]
          || product.attributes?.[group.toLowerCase()]
          || product.attributes?.[group.toUpperCase()];

        // Also check product.variants[].variantAttr (variant axis: RAM, Storage, Color…)
        // A product "matches" if ANY of its variants has the selected value
        const matchesVariant = (product.variants || []).some(v => {
          let vAttr = v.variantAttr;
          if (typeof vAttr === "string") { try { vAttr = JSON.parse(vAttr); } catch { vAttr = {}; } }
          vAttr = vAttr || {};
          const varVal = vAttr[group] || vAttr[group.toLowerCase()] || vAttr[group.toUpperCase()];
          if (varVal == null) return false;
          return values.some(sel =>
            String(varVal).toLowerCase() === sel.toLowerCase() ||
            String(varVal).toLowerCase().includes(sel.toLowerCase())
          );
        });

        const matchesAttr = attrVal != null && values.some(v =>
          String(attrVal).toLowerCase() === v.toLowerCase() ||
          String(attrVal).toLowerCase().includes(v.toLowerCase())
        );

        const matchesFallback = attrVal == null && !matchesVariant && values.some(v => productMatchesSpec(product, v));

        if (!matchesAttr && !matchesVariant && !matchesFallback) return false;
      }

      return true;
    });
  }, [products, selectedBrands, onSale, minPrice, maxPrice, specFilters]);

  const sortedProducts = useMemo(() => {
    const items = [...filteredProducts];
    if (sort === "price_asc") {
      items.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sort === "price_desc") {
      items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sort === "rating_desc") {
      items.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    }
    return items;
  }, [filteredProducts, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return sortedProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedProducts, safePage]);

  const activePromotions =
    categoryPromotions[categorySlug] ||
    (isLaptopCategory(activeCategory) ? categoryPromotions.laptop : []) ||
    [];

  const subCategories = useMemo(() => {
    const parent = parentCategory || activeCategory;
    return parent?.children?.filter((c) => c.active !== false) || [];
  }, [parentCategory, activeCategory]);

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
    specFilters,
    onSpecToggle: toggleSpec,
    dynamicSpecFilters,
    onClearAll: clearAllFilters,
  };

  return (
    <div className="space-y-5 py-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 flex-wrap">
        <Link to="/" className="hover:text-[#D70018] transition-colors">Trang chủ</Link>
        <Icon name="chevron_right" className="text-base text-slate-300" />
        <span className="text-slate-800 dark:text-slate-200 font-semibold">Sản phẩm</span>
        {displayTitle && displayTitle !== "Sản phẩm" && (
          <>
            <Icon name="chevron_right" className="text-base text-slate-300" />
            <span className="text-[#D70018] font-semibold">{displayTitle}</span>
          </>
        )}
      </nav>

      {/* Category tabs from DB */}
      <CategoryTabs
        categories={rootCategories}
        activeSlug={categorySlug || activeCategory?.slug}
        onSelect={setCategory}
      />

      {/* Subcategory pills */}
      {subCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          <button
            type="button"
            onClick={() => updateFilters({ sub: null })}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border cursor-pointer transition-all ${
              !subSlug
                ? "border-[#D70018] bg-red-50 text-[#D70018]"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            Tất cả
          </button>
          {subCategories.map((sub) => {
            const slug = sub.slug || sub.name?.toLowerCase() || "";
            const isActive = subSlug === slug;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => updateFilters({ sub: slug, activeCategory: categorySlug || activeCategory?.slug })}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border cursor-pointer transition-all ${
                  isActive
                    ? "border-[#D70018] bg-red-50 text-[#D70018]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {formatCategoryName(sub.name)}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filter chips */}
      <ActiveFilterChips
        brands={selectedBrands}
        onSale={onSale}
        minPrice={minPrice}
        maxPrice={maxPrice}
        specFilters={specFilters}
        defaultMaxPrice={DEFAULT_MAX_PRICE}
        onRemoveBrand={toggleBrand}
        onRemoveSale={() => updateFilters({ sale: null })}
        onRemovePrice={() => {
          setPriceDraft({ min: 0, max: DEFAULT_MAX_PRICE });
          updateFilters({ minPrice: 0, maxPrice: DEFAULT_MAX_PRICE });
        }}
        onRemoveSpec={toggleSpec}
        onClearAll={clearAllFilters}
      />

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
            title={displayTitle}
            count={filteredProducts.length}
            sort={sort}
            onSortChange={(v) => updateFilters({ sort: v, page: null }, { resetPage: false })}
            brands={availableBrands}
            selectedBrands={selectedBrands}
            onBrandToggle={toggleBrand}
            onOpenFilters={() => setFilterDrawerOpen(true)}
            activeFilterCount={activeFilterCount}
          />

          {loading ? (
            <ProductGridSkeleton count={ITEMS_PER_PAGE} />
          ) : error ? (
            <div className="text-center py-16 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-2xl">
              <Icon name="error_outline" className="text-4xl text-red-400 mb-2" />
              <p className="text-red-600 font-semibold">{error}</p>
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
              <Icon name="inventory_2" className="text-5xl text-slate-300 mb-3" />
              <p className="text-slate-600 font-semibold mb-1">Không tìm thấy sản phẩm</p>
              <p className="text-sm text-slate-400 mb-4">Thử điều chỉnh bộ lọc hoặc chọn danh mục khác</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-5 py-2 rounded-lg bg-[#D70018] text-white text-sm font-bold border-none cursor-pointer"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
              {paginatedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Promotions */}
          {!loading && activePromotions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activePromotions.map((promo) => (
                <div
                  key={promo.id}
                  className={`bg-gradient-to-r ${promo.gradient} rounded-2xl p-5 text-white relative overflow-hidden min-h-[130px] flex flex-col justify-center`}
                >
                  {promo.badge && (
                    <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full w-max mb-2">
                      {promo.badge}
                    </span>
                  )}
                  <h3 className="text-lg font-bold max-w-[220px]">{promo.title}</h3>
                  {promo.description && <p className="text-xs text-white/80 mt-1">{promo.description}</p>}
                  {promo.cta && (
                    <Link to={promo.cta.to} className="mt-3 inline-block px-4 py-1.5 bg-white text-blue-700 rounded-lg text-xs font-bold w-max">
                      {promo.cta.label}
                    </Link>
                  )}
                  {promo.icon && (
                    <Icon name={promo.icon} className="absolute right-4 bottom-2 text-[100px] opacity-30" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1.5 pt-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => updateFilters({ page: safePage - 1 }, { resetPage: false })}
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer bg-white dark:bg-slate-900"
              >
                <Icon name="chevron_left" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) pageNum = i + 1;
                else if (safePage <= 4) pageNum = i + 1;
                else if (safePage >= totalPages - 3) pageNum = totalPages - 6 + i;
                else pageNum = safePage - 3 + i;

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => updateFilters({ page: pageNum }, { resetPage: false })}
                    className={`w-9 h-9 rounded-lg text-sm font-bold cursor-pointer ${
                      safePage === pageNum
                        ? "bg-[#D70018] text-white border-none"
                        : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => updateFilters({ page: safePage + 1 }, { resetPage: false })}
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 cursor-pointer bg-white dark:bg-slate-900"
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Trust badges */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-8 mt-4">
        {[
          { icon: "verified_user", title: "Cam kết chính hãng", desc: "Đền bù 200% nếu phát hiện hàng giả" },
          { icon: "security", title: "Bảo hành 1 đổi 1", desc: "Lỗi do NSX được đổi sản phẩm mới ngay" },
          { icon: "local_shipping", title: "Giao hàng siêu tốc", desc: "Nhận hàng trong 2 giờ tại TP lớn" },
        ].map((item) => (
          <div key={item.title} className="flex flex-col items-center text-center p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
            <Icon name={item.icon} className="text-3xl text-[#D70018] mb-2" />
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{item.title}</h4>
            <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
          </div>
        ))}
      </section>

      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        resultCount={filteredProducts.length}
        filterPanelProps={filterPanelProps}
      />
    </div>
  );
}
