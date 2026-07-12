import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const DEFAULT_MAX_PRICE = 50000000;

export function useCategoryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const categorySlug = searchParams.get("activeCategory") || searchParams.get("cat") || "";
  const subSlug = searchParams.get("sub") || "";
  const brands = useMemo(
    () => searchParams.get("brand")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const minPrice = Number(searchParams.get("minPrice") || 0);
  const maxPrice = Number(searchParams.get("maxPrice") || DEFAULT_MAX_PRICE);
  const onSale = searchParams.get("sale") === "1";
  const sort = searchParams.get("sort") || "featured";
  const page = Number(searchParams.get("page") || 1);

  const specFilters = useMemo(() => {
    const specs = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith("spec_")) {
        specs[key.slice(5)] = value.split(",").filter(Boolean);
      }
    });
    return specs;
  }, [searchParams]);

  const updateFilters = useCallback(
    (patch, { resetPage = true } = {}) => {
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

      if (resetPage) next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setCategory = useCallback(
    (slug) => {
      const next = new URLSearchParams();
      if (slug) next.set("activeCategory", slug);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const toggleBrand = useCallback(
    (brand) => {
      const nextBrands = brands.includes(brand)
        ? brands.filter((b) => b !== brand)
        : [...brands, brand];
      updateFilters({ brand: nextBrands });
    },
    [brands, updateFilters]
  );

  const toggleSpec = useCallback(
    (group, value) => {
      const current = specFilters[group] || [];
      const nextValues = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateFilters({ [`spec_${group}`]: nextValues });
    },
    [specFilters, updateFilters]
  );

  const clearAllFilters = useCallback(() => {
    const next = new URLSearchParams();
    if (categorySlug) next.set("activeCategory", categorySlug);
    if (subSlug) next.set("sub", subSlug);
    setSearchParams(next, { replace: true });
  }, [categorySlug, subSlug, setSearchParams]);

  const hasActiveFilters =
    brands.length > 0 ||
    onSale ||
    minPrice > 0 ||
    maxPrice < DEFAULT_MAX_PRICE ||
    Object.values(specFilters).some((v) => v.length > 0);

  return {
    categorySlug,
    subSlug,
    brands,
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
  };
}
