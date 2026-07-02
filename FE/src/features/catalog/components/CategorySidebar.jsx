import { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";
import { getBrandLogo } from "../../../utils/brandLogo.jsx";

function formatCategoryName(name) {
  if (!name) return "";
  const cleaned = name.trim();
  const isMixedCase = /[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned);
  if (isMixedCase) return cleaned;
  if (cleaned !== cleaned.toUpperCase()) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned.toLowerCase().split(/\s+/)
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : "")
    .join(" ");
}

export default function CategorySidebar({ withFilters = false, isDropdown = false }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [suggestedProducts, setSuggestedProducts] = useState([]);

  useEffect(() => {
    productApi.listCategories().then(setCategories).catch(() => setCategories([]));
    productApi.listBrands().then(setAllBrands).catch(() => setAllBrands([]));
    if (withFilters) {
      productApi.listProducts().then(setProducts).catch(() => setProducts([]));
    }
  }, [withFilters]);

  useEffect(() => {
    if (!withFilters && activeCategory?.id) {
      productApi.listProducts({ categoryId: activeCategory.id.toString() })
        .then(res => {
          const sorted = [...res].sort((a, b) => String(b.id).localeCompare(String(a.id)));
          setSuggestedProducts(sorted.slice(0, 5));
        })
        .catch(() => setSuggestedProducts([]));
    } else {
      setSuggestedProducts([]);
    }
  }, [activeCategory, withFilters]);

  const filterBrands = useMemo(() =>
    Array.from(new Set(products.map(p => p.brand).filter(Boolean))).slice(0, 8),
    [products]
  );

  const categoryItems = categories.map(cat => ({
    id: cat.id,
    icon: cat.icon || "category",
    label: cat.label || cat.name || "",
    raw: cat
  }));

  // ------- withFilters (CategoryPage sidebar) -------
  if (withFilters) {
    return (
      <aside className="w-full lg:w-64 flex-shrink-0">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
          <h2 className="text-[15px] font-bold text-red-600 mb-3">Danh mục</h2>
          <nav className="space-y-0.5">
            {categoryItems.map((cat, index) => (
              <NavLink
                key={cat.id}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${index === 0 || isActive
                    ? "bg-red-50 text-red-600 font-bold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-red-600"
                  }`
                }
                to={`/category?activeCategory=${cat.raw.slug || cat.raw.name?.toLowerCase()}`}
              >
                {cat.raw?.imageUrl ? (
                  <img src={cat.raw.imageUrl} alt={cat.label} className="w-5 h-5 object-contain shrink-0" />
                ) : (
                  <Icon name={cat.icon} className="text-[18px] shrink-0" />
                )}
                <span>{formatCategoryName(cat.label)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-5">
            <section>
              <h3 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 mb-2">Thương hiệu</h3>
              <div className="space-y-1.5">
                {filterBrands.map((brand, i) => (
                  <label key={brand} className="flex items-center gap-2 cursor-pointer group">
                    <input className="rounded border-slate-300 text-red-600 focus:ring-red-500 h-4 w-4" type="checkbox" defaultChecked={i === 1} />
                    <span className="text-[13px] text-slate-600 group-hover:text-red-600 transition-colors">{brand}</span>
                  </label>
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 mb-2">Khoảng giá (VNĐ)</h3>
              <input className="w-full accent-red-600" type="range" min="0" max="50000000" step="1000000" defaultValue="26000000" />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium mt-1">
                <span>0đ</span><span>50.000.000đ</span>
              </div>
            </section>
          </div>
        </div>
      </aside>
    );
  }

  // ------- isDropdown (Navbar mega-menu dropdown) -------
  if (isDropdown) {
    const dropdownMegaWidth = "min(680px, calc(100vw - 260px))";
    return (
      <div
        className="relative flex z-50"
        onMouseLeave={() => setActiveCategory(null)}
      >
        {/* Category list panel */}
        <div className="w-[220px] flex flex-col bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <nav className="flex flex-col overflow-y-auto no-scrollbar py-1">
            {categoryItems.map(cat => {
              const isActive = activeCategory?.id === cat.id;
              return (
                <NavLink
                  key={cat.id}
                  to={`/category?activeCategory=${cat.raw.slug || encodeURIComponent(cat.raw.name || "")}`}
                  onMouseEnter={() => setActiveCategory(cat.raw)}
                  className={`flex items-center gap-3 px-4 py-[8px] transition-colors group ${isActive ? "bg-red-50" : "hover:bg-slate-50"
                    }`}
                >
                  {cat.raw?.imageUrl ? (
                    <img src={cat.raw.imageUrl} alt={cat.label} className="w-[20px] h-[20px] object-contain shrink-0" />
                  ) : (
                    <Icon name={cat.icon} className={`text-[20px] shrink-0 transition-colors ${isActive ? "text-red-600" : "text-slate-500 group-hover:text-red-600"}`} />
                  )}
                  <span className={`text-[13px] leading-tight font-medium transition-colors ${isActive ? "text-red-600 font-bold" : "text-slate-700 group-hover:text-red-600"
                    }`}>
                    {formatCategoryName(cat.label)}
                  </span>
                  <Icon name="chevron_right" className={`ml-auto text-[16px] shrink-0 ${isActive ? "text-red-600" : "text-slate-400"}`} />
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Mega menu panel — dính sát, có cầu nối hover */}
        {activeCategory && (
          <div className="absolute top-0 left-full flex z-50 items-stretch">
            <div className="w-2 shrink-0 self-stretch" aria-hidden="true" />
            <div
              className="bg-white rounded-xl border border-slate-200 shadow-[0_8px_40px_rgba(0,0,0,0.15)] p-5 flex gap-4"
              style={{ width: dropdownMegaWidth }}
            >
            <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar">
              {activeCategory.children && activeCategory.children.length > 0 ? (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
                  {activeCategory.children.map(sub => {
                    const brandsForSub = allBrands.filter(b =>
                      b.categoryIds && b.categoryIds.includes(Number(sub.id))
                    );
                    return (
                      <div key={sub.id}>
                        <h3 className="text-[13px] font-bold text-slate-800 mb-2">
                          Chọn hãng {(sub.name || "").toLowerCase()}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {brandsForSub.slice(0, 6).map(brand => {
                            const officialLogo = getBrandLogo(brand.name);
                            return (
                              <Link key={brand.id}
                                to={`/category?activeCategory=${activeCategory.slug || encodeURIComponent(activeCategory.name || "")}&brand=${encodeURIComponent(brand.name)}`}
                                className="flex items-center justify-center h-12 border border-slate-200 rounded-lg hover:border-red-500 hover:shadow-md bg-white transition-all px-3 overflow-hidden"
                              >
                                {brand.logoUrl ? (
                                  <img src={brand.logoUrl} alt={brand.name} className="max-h-7 max-w-full object-contain" />
                                ) : officialLogo ? (
                                  <span className="[&>svg]:h-[22px] [&>svg]:w-auto flex items-center">{officialLogo}</span>
                                ) : (
                                  <span className="text-[12px] font-bold text-slate-700 text-center">{brand.name}</span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                        {brandsForSub.length > 0 && (
                          <Link to={`/category?activeCategory=${encodeURIComponent(sub.name || "")}`}
                            className="inline-flex items-center gap-1 text-[12px] text-red-600 font-medium mt-2 hover:underline">
                            → Xem tất cả {(sub.name || "").toLowerCase()}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <h3 className="text-[13px] font-bold text-slate-800 mb-3">
                    Chọn hãng {(activeCategory.name || "").toLowerCase()}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {allBrands.filter(b => b.categoryIds && b.categoryIds.includes(Number(activeCategory.id))).slice(0, 9).map(brand => {
                      const officialLogo = getBrandLogo(brand.name);
                      return (
                        <Link key={brand.id}
                          to={`/category?activeCategory=${activeCategory.slug || encodeURIComponent(activeCategory.name || "")}&brand=${encodeURIComponent(brand.name)}`}
                          className="flex items-center justify-center h-12 border border-slate-200 rounded-lg hover:border-red-500 hover:shadow-md bg-white transition-all px-3 overflow-hidden"
                        >
                          {brand.logoUrl ? (
                            <img src={brand.logoUrl} alt={brand.name} className="max-h-7 max-w-full object-contain" />
                          ) : officialLogo ? (
                            <span className="[&>svg]:h-[22px] [&>svg]:w-auto flex items-center">{officialLogo}</span>
                          ) : (
                            <span className="text-[12px] font-bold text-slate-700 text-center">{brand.name}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* Hot Products */}
            <div className="w-[220px] shrink-0 border-l border-slate-100 pl-4">
              <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-1">
                Sản phẩm nổi bật <span className="text-red-500">⚡</span>
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {suggestedProducts.map((product, idx) => (
                  <Link key={product.id} to={`/product/${product.id}`}
                    className="group flex flex-col items-center gap-1.5 p-2 border border-slate-100 rounded-lg hover:border-red-400 hover:shadow-sm transition-all bg-white"
                  >
                    <div className="relative w-full aspect-square bg-slate-50 rounded-md overflow-hidden flex items-center justify-center">
                      {idx === 0 && <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded z-10">Hot</span>}
                      <img src={product.imageUrl} alt={product.name} className="w-[80%] h-[80%] object-contain group-hover:scale-110 transition-transform duration-200" />
                    </div>
                    <p className="text-[11px] text-slate-700 font-medium line-clamp-2 leading-tight text-center group-hover:text-red-600 transition-colors w-full">
                      {product.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ------- Homepage mega-menu sidebar -------
  const megaWidth = "min(936px, calc(100vw - 272px))";

  return (
    <aside className="relative hidden lg:flex flex-col self-stretch w-[240px] shrink-0 z-40">
      <div
        className="relative flex-1 flex flex-col h-full"
        onMouseLeave={() => setActiveCategory(null)}
      >
        {/* Sidebar panel */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-md border border-[#dddad8] overflow-hidden">
        <nav className="flex flex-col overflow-y-auto h-full no-scrollbar py-1">
          {categoryItems.map(cat => {
            const isActive = activeCategory?.id === cat.id;
            return (
              <NavLink
                key={cat.id}
                to={`/category?activeCategory=${cat.raw.slug || encodeURIComponent(cat.raw.name || "")}`}
                onMouseEnter={() => setActiveCategory(cat.raw)}
                className={`flex items-center gap-3 px-4 py-[9px] transition-colors group ${isActive
                  ? "bg-red-50 dark:bg-red-900/20"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
              >
                {cat.raw?.imageUrl ? (
                  <img src={cat.raw.imageUrl} alt={cat.label} className="w-[26px] h-[26px] object-contain shrink-0" />
                ) : (
                  <Icon
                    name={cat.icon}
                    className={`text-[26px] shrink-0 transition-colors ${isActive ? "text-red-600" : "text-slate-500 group-hover:text-red-600"}`}
                  />
                )}
                <span className={`text-[13px] leading-tight transition-colors ${isActive ? "text-red-600 font-bold" : "text-slate-700 dark:text-slate-300 font-medium group-hover:text-red-600"}`}>
                  {formatCategoryName(cat.label)}
                </span>
                <Icon name="chevron_right" className={`ml-auto text-[20px] shrink-0 ${isActive ? "text-red-600" : "text-slate-400"}`} />
              </NavLink>
            );
          })}
        </nav>
        </div>

        {/* Mega Menu — dính sát sidebar, không gap hover */}
        {activeCategory && (
          <div className="absolute top-0 left-full z-50 flex items-stretch">
            {/* Cầu nối vô hình để chuột không rơi vào khoảng trống */}
            <div className="w-2 shrink-0 self-stretch" aria-hidden="true" />
            <div
              className="bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-[0_8px_40px_rgba(0,0,0,0.18)] p-5 flex gap-4"
              style={{ width: megaWidth }}
            >
              {/* Left: brands */}
              <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar">
            {/* If category has children, group brands per child */}
            {activeCategory.children && activeCategory.children.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {activeCategory.children.map(sub => {
                  const brandsForSub = allBrands.filter(b =>
                    b.categoryIds && b.categoryIds.includes(Number(sub.id))
                  );
                  return (
                    <div key={sub.id}>
                      {/* Section Title */}
                      <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100 mb-2">
                        Chọn hãng {(sub.name || "").toLowerCase()}
                      </h3>
                      {/* Brand logo grid — 2 cols inside narrow subcategory block */}
                      <div className="grid grid-cols-2 gap-2">
                        {brandsForSub.slice(0, 6).map(brand => {
                          const officialLogo = getBrandLogo(brand.name);
                          return (
                            <Link
                              key={brand.id}
                              to={`/category?activeCategory=${activeCategory.slug || encodeURIComponent(activeCategory.name || "")}&brand=${encodeURIComponent(brand.name)}`}
                              className="flex items-center justify-center h-12 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-red-500 hover:shadow-md bg-white dark:bg-slate-800 transition-all px-3 overflow-hidden"
                            >
                              {brand.logoUrl ? (
                                <img src={brand.logoUrl} alt={brand.name} className="max-h-7 max-w-full object-contain" />
                              ) : officialLogo ? (
                                <span className="[&>svg]:h-[22px] [&>svg]:w-auto flex items-center">{officialLogo}</span>
                              ) : (
                                <span className="text-[12px] font-bold text-slate-700 text-center leading-tight">{brand.name}</span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                      {/* Xem tất cả */}
                      <Link
                        to={`/category?activeCategory=${activeCategory.slug || encodeURIComponent(activeCategory.name || "")}&sub=${sub.slug || encodeURIComponent(sub.name || "")}`}
                        className="mt-1.5 flex items-center gap-1 text-[12px] text-red-600 hover:text-red-700 font-medium group"
                      >
                        <Icon name="arrow_forward" className="text-[14px] group-hover:translate-x-0.5 transition-transform" />
                        Xem tất cả {(sub.name || "").toLowerCase()}
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* No children: show brands for the parent category directly — 3 cols, tall cards */
              <div>
                <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100 mb-3">
                  Chọn hãng {(activeCategory.name || "").toLowerCase()}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {allBrands
                    .filter(b => b.categoryIds && b.categoryIds.includes(Number(activeCategory.id)))
                    .slice(0, 9)
                    .map(brand => {
                      const officialLogo = getBrandLogo(brand.name);
                      return (
                        <Link
                          key={brand.id}
                          to={`/category?activeCategory=${activeCategory.slug || encodeURIComponent(activeCategory.name || "")}&brand=${encodeURIComponent(brand.name)}`}
                          className="flex items-center justify-center h-12 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-red-500 hover:shadow-md bg-white dark:bg-slate-800 transition-all px-3 overflow-hidden"
                        >
                          {brand.logoUrl ? (
                            <img src={brand.logoUrl} alt={brand.name} className="max-h-7 max-w-full object-contain" />
                          ) : officialLogo ? (
                            <span className="[&>svg]:h-[22px] [&>svg]:w-auto flex items-center">{officialLogo}</span>
                          ) : (
                            <span className="text-[12px] font-bold text-slate-700 text-center leading-tight">{brand.name}</span>
                          )}
                        </Link>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Hot Products */}
          <div className="w-[240px] shrink-0 border-l border-slate-100 pl-4">
            <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-1">
              Sản phẩm nổi bật <span className="text-red-500">⚡</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {suggestedProducts.map((product, idx) => (
                <Link
                  key={product.id}
                  to={`/product/${product.id}`}
                  className="group flex flex-col items-center gap-1.5 p-2 border border-slate-100 rounded-lg hover:border-red-400 hover:shadow-sm transition-all bg-white"
                >
                  <div className="relative w-full aspect-square bg-slate-50 rounded-md overflow-hidden flex items-center justify-center">
                    {idx === 0 && <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded z-10">Hot</span>}
                    {idx === 1 && <span className="absolute top-0.5 right-0.5 bg-blue-500 text-white text-[8px] font-bold px-1 py-0.5 rounded z-10">Mới</span>}
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-[80%] h-[80%] object-contain group-hover:scale-110 transition-transform duration-200"
                    />
                  </div>
                  <p className="text-[11px] text-slate-700 font-medium line-clamp-2 leading-tight text-center group-hover:text-red-600 transition-colors w-full">
                    {product.name}
                  </p>
                </Link>
              ))}
              {suggestedProducts.length === 0 && (
                <p className="col-span-3 text-[12px] text-slate-400 italic">Đang tải...</p>
              )}
            </div>
          </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
