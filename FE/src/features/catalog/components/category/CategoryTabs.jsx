import Icon from "../../../../components/common/Icon.jsx";
import { formatCategoryName } from "../../utils/categoryUtils.js";

const RED = "#D70018";

export default function CategoryTabs({ categories, activeSlug, onSelect }) {
  if (!categories.length) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="flex overflow-x-auto gap-1 p-2 hide-scrollbar">
        {categories.map((cat) => {
          const slug = cat.slug || cat.name?.toLowerCase() || "";
          const isActive =
            activeSlug === slug ||
            activeSlug?.toLowerCase() === cat.name?.toLowerCase();

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(slug)}
              className={`flex flex-col items-center gap-1.5 min-w-[76px] px-3 py-2.5 rounded-xl border-none cursor-pointer transition-all duration-200 shrink-0 ${
                isActive
                  ? "bg-red-50 dark:bg-red-950/30 text-[#D70018] shadow-sm"
                  : "bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700"
              }`}
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  isActive ? "bg-white dark:bg-slate-900 shadow-sm" : "bg-slate-50 dark:bg-slate-800"
                }`}
              >
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt={cat.name} className="w-7 h-7 object-contain" />
                ) : (
                  <Icon name={cat.icon || "category"} className="text-xl" style={{ color: isActive ? RED : undefined }} />
                )}
              </div>
              <span className={`text-[11px] leading-tight text-center ${isActive ? "font-bold" : "font-medium"}`}>
                {formatCategoryName(cat.name || cat.label || "")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
