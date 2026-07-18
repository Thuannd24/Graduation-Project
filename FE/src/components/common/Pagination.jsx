import React from "react";

function getPageList(current, total, siblingCount = 1) {
  const totalNumbers = siblingCount * 2 + 5;
  if (total <= totalNumbers) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);
  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < total - 1;

  const pages = [1];
  if (showLeftDots) pages.push("...");
  for (let i = Math.max(leftSibling, 2); i <= Math.min(rightSibling, total - 1); i++) {
    pages.push(i);
  }
  if (showRightDots) pages.push("...");
  pages.push(total);
  return pages;
}

/**
 * Thanh phân trang dùng chung cho các bảng admin.
 * Chỉ hiện tối đa ~7 nút (đầu/cuối + lân cận trang hiện tại + dấu "...") thay vì liệt kê hết mọi trang.
 */
export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = getPageList(currentPage, totalPages);

  return (
    <>
      <button
        onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        disabled={currentPage === 1}
        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        ← Trước
      </button>

      <div className="flex items-center gap-1">
        {pages.map((p, idx) =>
          p === "..." ? (
            <span key={`dots-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs font-bold text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                currentPage === p
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        Sau →
      </button>
    </>
  );
}
