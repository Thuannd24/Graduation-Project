import React, { useState } from "react";
import Icon from "../../../../components/common/Icon.jsx";
import { formatVnd } from "../../../../utils/format.js";
import { LAPTOP_SPEC_FILTERS, PRICE_PRESETS } from "../../utils/categoryUtils.js";

function FilterSection({ title, defaultOpen = true, children }) {
  return (
    <details open={defaultOpen} className="group border-t border-slate-100 dark:border-slate-800 first:border-t-0 pt-4 first:pt-0">
      <summary className="flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden mb-3">
        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{title}</h4>
        <Icon name="expand_more" className="text-slate-400 transition-transform group-open:rotate-180 text-lg" />
      </summary>
      {children}
    </details>
  );
}

export default function FilterPanel({
  brands = [],
  selectedBrands = [],
  onBrandToggle,
  onSale,
  onSaleChange,
  minPrice,
  maxPrice,
  onPriceChange,
  pricePreset,
  onPricePreset,
  specFilters = {},
  onSpecToggle,
  dynamicSpecFilters = [],
  onClearAll,
  showHeader = true,
}) {
  const [showAllFilters, setShowAllFilters] = useState(false);
  const visibleFilters = showAllFilters ? dynamicSpecFilters : dynamicSpecFilters.slice(0, 4);

  return (
    <div className="space-y-1">
      {showHeader && (
        <div className="flex items-center justify-between pb-3 mb-1 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Icon name="tune" className="text-lg text-[#D70018]" />
            Bộ lọc
          </h3>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-semibold text-[#D70018] hover:underline border-none bg-transparent cursor-pointer"
          >
            Xóa tất cả
          </button>
        </div>
      )}

      <FilterSection title="Thương hiệu">
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {brands.map((brandObj) => {
            const brand = brandObj.name;
            const checked = selectedBrands.includes(brand);
            return (
              <label
                key={brandObj.id}
                className={`flex items-center gap-2.5 cursor-pointer text-sm px-2 py-1.5 rounded-lg transition-colors ${
                  checked ? "bg-red-50 dark:bg-red-950/20 text-[#D70018]" : "text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onBrandToggle(brand)}
                  className="w-4 h-4 accent-[#D70018] rounded cursor-pointer"
                />
                {brandObj.logoUrl && (
                  <img src={brandObj.logoUrl} alt={brand} className="w-5 h-4 object-contain" />
                )}
                <span className="font-medium">{brand}</span>
              </label>
            );
          })}
          {brands.length === 0 && (
            <p className="text-xs text-slate-400 italic px-2">Không có thương hiệu</p>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Khoảng giá">
        <div className="flex flex-wrap gap-2 mb-3">
          {PRICE_PRESETS.map((preset) => {
            const isActive =
              pricePreset?.min === preset.min && pricePreset?.max === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onPricePreset(preset)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all ${
                  isActive
                    ? "border-[#D70018] bg-red-50 text-[#D70018] dark:bg-red-950/20"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-300"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Từ"
            value={minPrice || ""}
            onChange={(e) => onPriceChange({ min: Number(e.target.value) || 0, max: maxPrice })}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
          />
          <span className="text-slate-400 shrink-0">—</span>
          <input
            type="number"
            placeholder="Đến"
            value={maxPrice >= 50000000 ? "" : maxPrice}
            onChange={(e) =>
              onPriceChange({ min: minPrice, max: Number(e.target.value) || 50000000 })
            }
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs"
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          {formatVnd(minPrice)} – {formatVnd(maxPrice)}
        </p>
      </FilterSection>

      {visibleFilters &&
        visibleFilters.map((filter) => (
          <FilterSection key={filter.key} title={filter.label} defaultOpen={false}>
            <div className="flex flex-wrap gap-2">
              {filter.options.map((opt) => {
                const selected = (specFilters[filter.key] || []).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSpecToggle(filter.key, opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                      selected
                        ? "border-[#D70018] bg-red-50 text-[#D70018] dark:bg-red-950/20 dark:border-red-900/50"
                        : "border-slate-200 dark:border-slate-850 text-slate-600 hover:border-slate-300 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </FilterSection>
        ))}

      {dynamicSpecFilters.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAllFilters(!showAllFilters)}
          className="w-full py-2.5 mt-3 text-xs font-bold text-[#D70018] bg-red-50/50 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-slate-750 rounded-xl border border-dashed border-red-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-1 transition-all"
        >
          <Icon name={showAllFilters ? "keyboard_arrow_up" : "keyboard_arrow_down"} className="text-base" />
          {showAllFilters ? "Thu gọn bộ lọc" : `Xem thêm bộ lọc (+${dynamicSpecFilters.length - 4})`}
        </button>
      )}
    </div>
  );
}
