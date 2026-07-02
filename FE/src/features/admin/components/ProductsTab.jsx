import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi.ts";
import keycloak from "../../../services/keycloak.js";

function flattenCategoryTree(nodes, prefix = "", level = 0) {
  const result = [];
  if (!Array.isArray(nodes)) return result;
  for (const node of nodes) {
    const path = prefix ? `${prefix} › ${node.name}` : node.name;
    result.push({
      id: node.id,
      name: node.name,
      path,
      level
    });
    if (node.children?.length) {
      result.push(...flattenCategoryTree(node.children, path, level + 1));
    }
  }
  return result;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("vi-VN") + "đ";
}

function statusBadge(status, active) {
  if (active === false) {
    return { label: "Ngừng bán", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" };
  }
  switch (status) {
    case "PUBLISHED":
      return { label: "Đang bán", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    case "DRAFT":
      return { label: "Nháp", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
    case "OUT_OF_STOCK":
      return { label: "Hết hàng", cls: "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
    case "ARCHIVED":
      return { label: "Lưu trữ", cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" };
    default:
      return { label: status || "—", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" };
  }
}

export default function ProductsTab({ setActiveTab, setEditingProductId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const pageSize = 10;

  const [flatCategories, setFlatCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, published: 0, variants: 0 });

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterActive, setFilterActive] = useState("");

  const categoryMap = useMemo(() => {
    const map = new Map();
    flatCategories.forEach(c => map.set(Number(c.id), c.path));
    return map;
  }, [flatCategories]);

  const loadMeta = useCallback(async () => {
    try {
      const [catsTree, brandsList, statsPage] = await Promise.all([
        productApi.listCategories(),
        productApi.listBrands(),
        productApi.listProductsPaged({ page: "0", size: "500" })
      ]);
      setFlatCategories(flattenCategoryTree(catsTree));
      setBrands(brandsList || []);
      const items = statsPage.items || [];
      setStats({
        total: statsPage.hasNext ? `${items.length}+` : items.length,
        active: items.filter(p => p.active !== false).length,
        published: items.filter(p => p.status === "PUBLISHED").length,
        variants: items.reduce((sum, p) => sum + (Array.isArray(p.variants) ? p.variants.length : 0), 0)
      });
    } catch (err) {
      console.error("Load meta failed:", err);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      let result;
      if (searchQuery.trim()) {
        result = await productApi.searchProducts(searchQuery.trim(), page, pageSize);
      } else {
        const params = {
          page: String(page),
          size: String(pageSize)
        };
        if (filterActive !== "") params.active = filterActive;
        if (filterCategoryId) params.categoryId = filterCategoryId;
        result = await productApi.listProductsPaged(params);
      }

      let items = result.items.map(p => ({
        ...p,
        categoryPath: p.categoryId ? categoryMap.get(Number(p.categoryId)) || "—" : "—"
      }));
      items.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

      if (filterBrandId) {
        items = items.filter(p => String(p.brandId) === String(filterBrandId));
      }
      if (filterStatus) {
        items = items.filter(p => p.status === filterStatus);
      }

      setProducts(items);
      setHasNext(result.hasNext);
      setHasPrevious(result.hasPrevious);
    } catch (err) {
      console.error("Load products failed:", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filterCategoryId, filterBrandId, filterStatus, filterActive, categoryMap]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const resetFilters = () => {
    setSearchQuery("");
    setFilterCategoryId("");
    setFilterBrandId("");
    setFilterStatus("");
    setFilterActive("");
    setPage(0);
  };

  const openEdit = (productId) => {
    setEditingProductId(productId);
    setActiveTab("add-product");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa sản phẩm này?")) return;
    try {
      await productApi.deleteProduct(id);
      alert("Đã xóa sản phẩm.");
      loadProducts();
      loadMeta();
    } catch (err) {
      alert("Lỗi xóa: " + err.message);
    }
  };

  const cardCls = "bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-sm";
  const inputCls = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none transition-all";

  return (
    <div className="space-y-6 animate-fadeIn p-6 pb-10">
      {/* Thống kê */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: "inventory_2", label: "Tổng sản phẩm", value: stats.total, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
          { icon: "check_circle", label: "Đang kinh doanh", value: stats.active, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { icon: "storefront", label: "Đã xuất bản", value: stats.published, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/30" },
          { icon: "layers", label: "Tổng biến thể SKU", value: stats.variants, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/30" }
        ].map((s) => (
          <div key={s.label} className={`${cardCls} p-5 flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-2xl ${s.bg} flex items-center justify-center shrink-0`}>
              <Icon name={s.icon} className={`text-2xl ${s.color}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header + nút thêm */}
      <div className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div>
          <h4 className="text-base font-extrabold text-slate-800 dark:text-white">Danh Sách Sản Phẩm Trong Kho</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Dữ liệu thật từ hệ thống — quản lý giá, danh mục cha-con, biến thể và trạng thái
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab?.("add-product")}
          className="shrink-0 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
        >
          <Icon name="add" className="text-base" />
          Thêm sản phẩm mới
        </button>
      </div>

      {/* Bộ lọc */}
      <div className={`${cardCls} p-5 space-y-4`}>
        <div className="flex items-center gap-2">
          <Icon name="filter_list" className="text-emerald-600 text-lg" />
          <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Lọc sản phẩm</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
            <input
              type="text"
              placeholder="Tìm theo tên, mô tả..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className={`${inputCls} pl-10`}
            />
          </div>
          <select
            value={filterCategoryId}
            onChange={(e) => { setFilterCategoryId(e.target.value); setPage(0); }}
            className={inputCls}
          >
            <option value="">Tất cả danh mục</option>
            {flatCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {"—".repeat(cat.level)}{cat.level > 0 ? " " : ""}{cat.path}
              </option>
            ))}
          </select>
          <select
            value={filterBrandId}
            onChange={(e) => { setFilterBrandId(e.target.value); setPage(0); }}
            className={inputCls}
          >
            <option value="">Tất cả thương hiệu</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
              className={`${inputCls} flex-1`}
            >
              <option value="">Trạng thái</option>
              <option value="PUBLISHED">Đang bán</option>
              <option value="DRAFT">Nháp</option>
              <option value="OUT_OF_STOCK">Hết hàng</option>
              <option value="ARCHIVED">Lưu trữ</option>
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Xóa bộ lọc"
            >
              <Icon name="refresh" className="text-lg" />
            </button>
          </div>
        </div>
      </div>

      {/* Bảng */}
      <div className={`${cardCls} overflow-hidden`}>
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-400">Đang tải sản phẩm...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Icon name="inventory" className="text-5xl text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Không có sản phẩm nào phù hợp</p>
            <button
              type="button"
              onClick={() => setActiveTab?.("add-product")}
              className="text-xs font-bold text-emerald-600 hover:underline"
            >
              + Thêm sản phẩm đầu tiên
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="p-4 font-bold text-[10px] uppercase w-12 text-center">STT</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-16">Ảnh</th>
                  <th className="p-4 font-bold text-[10px] uppercase min-w-[180px]">Sản phẩm</th>
                  <th className="p-4 font-bold text-[10px] uppercase min-w-[160px]">Danh mục</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28">Thương hiệu</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28 text-right">Giá bán</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-20 text-center">SKU</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-24 text-center">Trạng thái</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-24 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {products.map((p, idx) => {
                  const badge = statusBadge(p.status, p.active);
                  const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 text-center font-semibold text-slate-400">{page * pageSize + idx + 1}</td>
                      <td className="p-4">
                        <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-600 p-0.5 overflow-hidden">
                          {p.image ? (
                            <img src={p.image} alt="" className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Icon name="image" className="text-lg" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-extrabold text-slate-800 dark:text-slate-100 leading-snug">{p.name}</p>
                        {p.slug && (
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{p.slug}</p>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed max-w-[200px]">
                          {p.categoryPath || "—"}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-600 dark:text-slate-300">{p.brand || "—"}</td>
                      <td className="p-4 text-right">
                        <p className="font-extrabold text-slate-800 dark:text-white">{formatPrice(p.salePrice || p.price)}</p>
                        {p.costPrice > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Vốn: {formatPrice(p.costPrice)}</p>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-black">
                          {variantCount || "—"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(p.id)}
                            className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg text-emerald-600 transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Icon name="edit" className="text-base" />
                          </button>
                          {keycloak.hasRealmRole("ROLE_ADMIN") && (
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id)}
                              className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg text-rose-600 transition-colors"
                              title="Xóa"
                            >
                              <Icon name="delete" className="text-base" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        {!loading && products.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Trang {page + 1} · {products.length} sản phẩm/trang
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPrevious}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                ← Trước
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition-colors"
              >
                Sau →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
