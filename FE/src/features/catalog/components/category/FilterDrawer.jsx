import Icon from "../../../../components/common/Icon.jsx";
import FilterPanel from "./FilterPanel.jsx";

export default function FilterDrawer({
  open,
  onClose,
  resultCount,
  filterPanelProps,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl flex flex-col" style={{ animation: "filterDrawerUp 0.25s ease-out" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">Bộ lọc sản phẩm</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-none cursor-pointer"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterPanel {...filterPanelProps} showHeader={false} />
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[#D70018] text-white font-bold text-sm border-none cursor-pointer hover:bg-red-700 transition-colors"
          >
            Xem {resultCount} sản phẩm
          </button>
        </div>
      </div>
    </div>
  );
}
