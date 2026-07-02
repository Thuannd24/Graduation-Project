import { Link } from "react-router-dom";
import { getBrandLogo } from "../../../utils/brandLogo";
import Icon from "../../../components/common/Icon";

export default function CategoryShowcaseSection({ category, brands = [] }) {
  if (!category) return null;

  const catBrands = brands
    .filter((b) => b.categoryIds?.includes(Number(category.id)))
    .slice(0, 5);

  const children = (category.children || []).slice(0, 15);
  const half = Math.ceil(children.length / 2);
  const leftChildren = children.slice(0, half);
  const rightChildren = children.slice(half);

  const SubGrid = ({ items, colKey }) => (
    <div className="grid grid-cols-4 gap-2">
      {items.map((sub) => (
        <Link
          key={sub.id}
          to={`/category?activeCategory=${encodeURIComponent(sub.slug || sub.name || "")}`}
          className="flex flex-col items-center gap-1.5 p-2 rounded-xl border border-slate-100 hover:border-red-400 hover:shadow-sm transition-all group bg-white dark:bg-slate-800 dark:border-slate-700"
        >
          <div className="w-12 h-12 flex items-center justify-center">
            {sub.imageUrl ? (
              <img src={sub.imageUrl} alt={sub.name} className="w-10 h-10 object-contain" />
            ) : (
              <Icon
                name={sub.icon || "category"}
                className="text-2xl text-slate-500 group-hover:text-red-600 transition-colors"
              />
            )}
          </div>
          <span className="text-[10px] text-center text-slate-600 dark:text-slate-300 font-medium leading-tight line-clamp-2">
            {sub.name}
          </span>
        </Link>
      ))}
      <Link
        to={`/category?activeCategory=${encodeURIComponent(category.slug || category.name || "")}`}
        className="flex flex-col items-center gap-1.5 p-2 rounded-xl border border-dashed border-slate-200 hover:border-red-400 transition-all group bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-500 transition-colors">
            <Icon name="chevron_right" className="text-lg text-red-600 group-hover:text-white" />
          </div>
        </div>
        <span className="text-[10px] text-center text-red-500 font-bold">Xem tất cả</span>
      </Link>
    </div>
  );

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-tight shrink-0">
          {category.name}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {catBrands.map((brand) => {
            const logo = getBrandLogo(brand.name);
            return (
              <Link
                key={brand.id}
                to={`/category?activeCategory=${encodeURIComponent(category.slug || category.name || "")}&brand=${encodeURIComponent(brand.name)}`}
                className="flex items-center gap-1 px-3 py-1 border border-slate-200 rounded-full text-xs font-bold text-slate-700 hover:border-red-500 hover:text-red-600 transition-all bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              >
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={brand.name} className="h-3.5 object-contain" />
                ) : logo ? (
                  <span className="[&>svg]:h-[12px] [&>svg]:w-auto">{logo}</span>
                ) : (
                  brand.name
                )}
              </Link>
            );
          })}
        </div>
        <Link
          to={`/category?activeCategory=${encodeURIComponent(category.slug || category.name || "")}`}
          className="ml-auto text-xs text-red-500 font-bold hover:underline flex items-center gap-0.5 shrink-0"
        >
          Xem tất cả <Icon name="chevron_right" className="text-sm" />
        </Link>
      </div>

      {/* 2-column sub grid */}
      {children.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          <SubGrid items={leftChildren} colKey="left" />
          <SubGrid items={rightChildren} colKey="right" />
        </div>
      ) : (
        <div className="text-center py-8 text-slate-400 text-sm">
          Chưa có danh mục con
        </div>
      )}
    </section>
  );
}
