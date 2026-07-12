import Icon from "../../../../components/common/Icon.jsx";
import { getBrandLogo } from "../../../../utils/brandLogo.jsx";

export default function ProductToolbar({
  title,
  count,
  sort,
  onSortChange,
  brands = [],
  selectedBrands = [],
  onBrandToggle,
  onOpenFilters,
  activeFilterCount = 0,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{count} sản phẩm</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFilters}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 cursor-pointer"
          >
            <Icon name="tune" className="text-lg" />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D70018] text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Sắp xếp</span>
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer"
            >
              <option value="featured">Nổi bật</option>
              <option value="price_asc">Giá thấp → cao</option>
              <option value="price_desc">Giá cao → thấp</option>
              <option value="rating_desc">Đánh giá cao</option>
            </select>
          </div>
        </div>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {brands.map((brandObj) => {
            const brandName = brandObj.name;
            const isSelected = selectedBrands.includes(brandName);
            const officialLogo = getBrandLogo(brandName);

            return (
              <button
                key={brandObj.id}
                type="button"
                onClick={() => onBrandToggle(brandName)}
                className={`shrink-0 px-4 py-2 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[40px] ${
                  isSelected
                    ? "border-[#D70018] bg-red-50 text-[#D70018] shadow-sm"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 hover:border-slate-300"
                }`}
              >
                {brandObj.logoUrl ? (
                  <img src={brandObj.logoUrl} alt={brandName} className="h-4 object-contain" />
                ) : officialLogo ? (
                  <span className="[&>svg]:h-4 [&>svg]:w-auto flex items-center">{officialLogo}</span>
                ) : (
                  <span>{brandName}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
