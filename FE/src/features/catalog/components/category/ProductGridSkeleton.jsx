export default function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-slate-100 dark:bg-slate-800" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
