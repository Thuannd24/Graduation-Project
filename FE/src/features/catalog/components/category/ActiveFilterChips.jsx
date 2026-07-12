import Icon from "../../../../components/common/Icon.jsx";
import { formatVnd } from "../../../../utils/format.js";
import { LAPTOP_SPEC_FILTERS } from "../../utils/categoryUtils.js";

export default function ActiveFilterChips({
  brands,
  onSale,
  minPrice,
  maxPrice,
  specFilters,
  defaultMaxPrice,
  onRemoveBrand,
  onRemoveSale,
  onRemovePrice,
  onRemoveSpec,
  onClearAll,
}) {
  const chips = [];

  brands.forEach((b) => chips.push({ key: `brand-${b}`, label: b, onRemove: () => onRemoveBrand(b) }));
  if (onSale) chips.push({ key: "sale", label: "Đang giảm giá", onRemove: onRemoveSale });
  if (minPrice > 0 || maxPrice < defaultMaxPrice) {
    chips.push({
      key: "price",
      label: `${formatVnd(minPrice)} – ${formatVnd(maxPrice)}`,
      onRemove: onRemovePrice,
    });
  }
  Object.entries(specFilters).forEach(([group, values]) => {
    values.forEach((v) => {
      const groupLabel = LAPTOP_SPEC_FILTERS[group]?.label || group;
      chips.push({
        key: `spec-${group}-${v}`,
        label: `${groupLabel}: ${v}`,
        onRemove: () => onRemoveSpec(group, v),
      });
    });
  });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
      <span className="text-xs text-slate-500 font-semibold mr-1">Đang lọc:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="w-5 h-5 rounded-full hover:bg-red-100 hover:text-[#D70018] flex items-center justify-center border-none bg-transparent cursor-pointer"
            aria-label={`Xóa bộ lọc ${chip.label}`}
          >
            <Icon name="close" className="text-[14px]" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-semibold text-[#D70018] hover:underline border-none bg-transparent cursor-pointer ml-1"
      >
        Xóa tất cả
      </button>
    </div>
  );
}
