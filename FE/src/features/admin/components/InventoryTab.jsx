import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi.ts";
import { inventoryApi } from "../../../services/inventoryApi.ts";
import { hasAuthToken } from "../../../services/apiClient.ts";

const STOCK_COLORS = {
  healthy: "#10b981",
  low: "#f59e0b",
  out: "#ef4444",
  unknown: "#94a3b8"
};

function invKey(productId, variantId) {
  return `${productId}:${variantId ?? 0}`;
}

function getStockLevel(qty, threshold) {
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "healthy";
}

function stockLabel(level) {
  if (level === "out") return "Hết hàng";
  if (level === "low") return "Sắp hết";
  return "Ổn định";
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function buildRows(products, inventoryList, threshold) {
  const map = new Map();
  inventoryList.forEach(inv => map.set(invKey(inv.productId, inv.variantId ?? 0), inv));

  const rows = [];
  products.forEach(product => {
    const productId = Number(product.id);
    if (!productId) return;

    const variants = Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
      : [{ id: 0, sku: product.slug || "—", variantAttr: {} }];

    variants.forEach(variant => {
      const variantId = Number(variant.id ?? 0);
      const inv = map.get(invKey(productId, variantId)) || {
        productId,
        variantId,
        quantity: 0,
        lastUpdated: null
      };
      const level = getStockLevel(inv.quantity ?? 0, threshold);
      const attrLabel = variant.variantAttr && typeof variant.variantAttr === "object"
        ? Object.values(variant.variantAttr).join(" / ")
        : "";
      rows.push({
        productId,
        variantId,
        productName: product.name,
        productImage: product.image || product.imageUrl,
        sku: variant.sku || product.slug,
        variantLabel: attrLabel,
        quantity: inv.quantity ?? 0,
        lastUpdated: inv.lastUpdated,
        level,
        price: product.salePrice || product.price
      });
    });
  });
  return rows;
}

async function enrichProductsWithVariants(products) {
  const needsDetail = products.filter(
    p => p.id && (!Array.isArray(p.variants) || p.variants.length === 0)
  );
  if (!needsDetail.length) return products;

  const detailed = await Promise.all(
    needsDetail.map(p =>
      productApi.getProductDetail(p.id).catch(err => {
        console.warn(`Không tải chi tiết SP #${p.id}:`, err);
        return p;
      })
    )
  );
  const detailMap = new Map(detailed.map(d => [String(d.id), d]));
  return products.map(p => detailMap.get(String(p.id)) || p);
}

async function getBatchByProductIdsChunked(productIds, chunkSize = 300) {
  const chunks = [];
  for (let i = 0; i < productIds.length; i += chunkSize) {
    chunks.push(productIds.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(chunk => inventoryApi.getBatchByProductIds(chunk).catch(() => []))
  );
  return results.flat();
}

export default function InventoryTab() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockError, setLowStockError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const pageSize = 20;

  // Dữ liệu TOÀN BỘ danh mục (không giới hạn theo trang) — dùng riêng để tính thống kê & vẽ biểu đồ,
  // vì các con số này phải phản ánh cả kho hàng chứ không chỉ 20 SKU đang hiển thị ở trang hiện tại.
  const [globalRows, setGlobalRows] = useState([]);
  const [loadingGlobalStats, setLoadingGlobalStats] = useState(true);

  const [threshold, setThreshold] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const [modal, setModal] = useState(null);
  const [modalQty, setModalQty] = useState(0);
  const [restockQty, setRestockQty] = useState(10);
  const [restockNote, setRestockNote] = useState("");
  const [restockSupplier, setRestockSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  const loadLowStock = useCallback(async (t) => {
    if (!hasAuthToken()) {
      setLowStockItems([]);
      setLowStockError("Cần đăng nhập ADMIN/STAFF để xem cảnh báo tồn thấp.");
      return;
    }
    try {
      setLowStockError(null);
      const items = await inventoryApi.getLowStock(t);
      setLowStockItems(items);
    } catch (err) {
      console.error("Low stock load failed:", err);
      setLowStockItems([]);
      setLowStockError(err.message || "Không tải được danh sách tồn thấp.");
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let productResult;
      if (searchQuery.trim()) {
        productResult = await productApi.searchProducts(searchQuery.trim(), page, pageSize);
      } else {
        productResult = await productApi.listProductsPaged({ page: String(page), size: String(pageSize) });
      }

      let prods = await enrichProductsWithVariants(productResult.items || []);
      setProducts(prods);
      setHasNext(Boolean(productResult.hasNext));
      setHasPrevious(Boolean(productResult.hasPrevious));

      const productIds = prods.map(p => Number(p.id)).filter(id => id > 0);
      let inv = [];
      if (productIds.length) {
        try {
          inv = await inventoryApi.getBatchByProductIds(productIds);
        } catch (invErr) {
          console.warn("Batch inventory failed, hiển thị SP với tồn = 0:", invErr);
        }
      }
      setInventoryList(inv);
    } catch (err) {
      console.error("Inventory load failed:", err);
      setLoadError(err.message || "Không tải được dữ liệu sản phẩm/tồn kho.");
      setProducts([]);
      setInventoryList([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLowStock(threshold);
  }, [threshold, loadLowStock]);

  // Tải TOÀN BỘ sản phẩm + tồn kho một lần (không phụ thuộc trang đang xem) để thống kê/biểu đồ đúng trên cả kho hàng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGlobalStats(true);
      try {
        // Danh sách sản phẩm công khai đã trả kèm variants theo lô (xem ProductServiceImpl.convertToDtoList),
        // nên KHÔNG gọi enrichProductsWithVariants ở đây — tránh bắn hàng trăm/nghìn request chi tiết riêng lẻ
        // cho từng sản phẩm không có biến thể (buildRows đã tự fallback 1 SKU đơn cho trường hợp đó).
        const allProducts = await productApi.listAllProducts();
        const ids = allProducts.map(p => Number(p.id)).filter(id => id > 0);
        const inv = ids.length ? await getBatchByProductIdsChunked(ids) : [];
        if (!cancelled) {
          setGlobalRows(buildRows(allProducts, inv, threshold));
        }
      } catch (err) {
        console.error("Global inventory stats load failed:", err);
        if (!cancelled) setGlobalRows([]);
      } finally {
        if (!cancelled) setLoadingGlobalStats(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ngưỡng cảnh báo thay đổi thì chỉ cần tính lại mức tồn (level), không cần gọi lại API.
  const globalRowsWithThreshold = useMemo(
    () => globalRows.map(r => ({ ...r, level: getStockLevel(r.quantity, threshold) })),
    [globalRows, threshold]
  );

  const allRows = useMemo(
    () => buildRows(products, inventoryList, threshold),
    [products, inventoryList, threshold]
  );

  const filteredRows = useMemo(() => {
    if (stockFilter === "all") return allRows;
    return allRows.filter(r => r.level === stockFilter);
  }, [allRows, stockFilter]);

  const stats = useMemo(() => {
    const rows = globalRowsWithThreshold;
    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const low = rows.filter(r => r.level === "low").length;
    const out = rows.filter(r => r.level === "out").length;
    const healthy = rows.filter(r => r.level === "healthy").length;
    return { skuCount: rows.length, totalQty, low, out, healthy, alertCount: lowStockItems.length };
  }, [globalRowsWithThreshold, lowStockItems]);

  const chartHealth = useMemo(() => [
    { name: "Ổn định", value: stats.healthy, color: STOCK_COLORS.healthy },
    { name: "Sắp hết", value: stats.low, color: STOCK_COLORS.low },
    { name: "Hết hàng", value: stats.out, color: STOCK_COLORS.out }
  ].filter(d => d.value > 0), [stats]);

  const chartLowBar = useMemo(() => {
    return [...globalRowsWithThreshold]
      .filter(r => r.level !== "healthy")
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10)
      .reverse() // recharts vertical bar layout vẽ từ dưới lên, reverse để SKU thấp nhất nằm trên cùng
      .map(r => ({
        name: r.sku?.length > 16 ? r.sku.slice(0, 16) + "…" : r.sku,
        productName: r.productName,
        quantity: r.quantity,
        fill: r.level === "out" ? STOCK_COLORS.out : STOCK_COLORS.low
      }));
  }, [globalRowsWithThreshold]);

  const openAdjust = (row) => {
    setModal({ type: "adjust", row });
    setModalQty(row.quantity);
  };

  const openRestock = (row) => {
    setModal({ type: "restock", row });
    setRestockQty(10);
    setRestockNote("");
    setRestockSupplier("");
  };

  const openTransactions = async (row) => {
    if (!hasAuthToken()) {
      alert("Vui lòng đăng nhập tài khoản ADMIN/STAFF để xem lịch sử giao dịch.");
      return;
    }
    setModal({ type: "transactions", row });
    setTxLoading(true);
    try {
      const result = await inventoryApi.getTransactions(row.productId, {
        variantId: row.variantId,
        page: 0,
        size: 15
      });
      setTransactions(result.items);
    } catch (err) {
      alert("Không tải được lịch sử: " + err.message);
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const handleSaveAdjust = async () => {
    if (!modal?.row) return;
    if (!hasAuthToken()) {
      alert("Vui lòng đăng nhập tài khoản ADMIN/STAFF để chỉnh tồn kho.");
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.updateStock(modal.row.productId, modalQty, modal.row.variantId);
      alert("Cập nhật tồn kho thành công!");
      setModal(null);
      loadData();
      loadLowStock(threshold);
    } catch (err) {
      alert("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRestock = async () => {
    if (!modal?.row) return;
    if (!hasAuthToken()) {
      alert("Vui lòng đăng nhập tài khoản ADMIN/STAFF để nhập kho.");
      return;
    }
    if (!restockQty || restockQty < 1) {
      alert("Số lượng nhập phải ≥ 1.");
      return;
    }
    setSaving(true);
    try {
      await inventoryApi.restock(modal.row.productId, {
        quantity: restockQty,
        note: restockNote || undefined,
        supplier: restockSupplier || undefined
      }, modal.row.variantId);
      alert("Nhập kho thành công!");
      setModal(null);
      loadData();
      loadLowStock(threshold);
    } catch (err) {
      alert("Lỗi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncRedis = async () => {
    if (!hasAuthToken()) {
      alert("Vui lòng đăng nhập tài khoản ADMIN/STAFF để thực hiện đồng bộ.");
      return;
    }
    if (!window.confirm("Đồng bộ Redis từ Database?\nThao tác này sẽ ghi đè toàn bộ cache Redis bằng dữ liệu mới nhất từ DB. Tiến hành?")) return;
    setSyncing(true);
    try {
      await inventoryApi.syncRedis();
      alert("✅ Đồng bộ thành công! Redis đã được cập nhật từ Database.");
      loadData();
      loadLowStock(threshold);
    } catch (err) {
      alert("❌ Lỗi đồng bộ: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const card = "bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-sm";
  const input = "w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none";

  return (
    <div className="space-y-6 animate-fadeIn p-6 pb-10">
      {loadError && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex items-start gap-3">
          <Icon name="error" className="text-rose-600 text-xl shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Không tải được dữ liệu</p>
            <p className="text-xs text-rose-700/90 dark:text-rose-300/80 mt-1">{loadError}</p>
            <button type="button" onClick={loadData} className="mt-2 text-xs font-bold text-rose-600 hover:underline">
              Thử lại
            </button>
          </div>
        </div>
      )}

      {!hasAuthToken() && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center gap-3">
          <Icon name="lock" className="text-amber-600 text-xl" />
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Nhập kho, chỉnh tồn và xem lịch sử cần token ADMIN/STAFF. Đăng nhập lại nếu thao tác bị từ chối.
          </p>
        </div>
      )}

      {lowStockError && !loadError && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
          {lowStockError}
        </div>
      )}

      {/* Cảnh báo tồn kho thấp */}
      {lowStockItems.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
              <Icon name="warning" className="text-amber-600 text-2xl" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                Cảnh báo: {lowStockItems.length} SKU tồn kho thấp (≤ {threshold})
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-1 font-medium">
                Cần nhập hàng sớm để tránh hết hàng khi bán.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {lowStockItems.slice(0, 6).map(item => (
                  <span
                    key={invKey(item.productId, item.variantId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 border border-amber-200 dark:border-amber-700 text-[10px] font-bold text-amber-800 dark:text-amber-200"
                  >
                    #{item.productId}{item.variantId ? `:V${item.variantId}` : ""} · còn {item.quantity}
                  </span>
                ))}
                {lowStockItems.length > 6 && (
                  <span className="text-[10px] font-bold text-amber-600 self-center">+{lowStockItems.length - 6} SKU khác</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thống kê */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: "inventory_2", label: "SKU theo dõi", value: stats.skuCount, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-900/30" },
          { icon: "stacked_bar_chart", label: "Tổng tồn kho", value: stats.totalQty.toLocaleString("vi-VN"), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { icon: "trending_down", label: "Sắp hết hàng", value: stats.low, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/30" },
          { icon: "remove_shopping_cart", label: "Hết hàng", value: stats.out, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-900/30" }
        ].map(s => (
          <div key={s.label} className={`${card} p-5 flex items-center gap-4`}>
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

      {/* Biểu đồ — tính trên TOÀN BỘ kho hàng, không chỉ trang đang xem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Icon name="donut_large" className="text-teal-600" /> Phân bổ tình trạng tồn
            <span className="text-[9px] font-semibold text-slate-400 normal-case">(toàn bộ {stats.skuCount} SKU)</span>
          </p>
          {loadingGlobalStats ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-3 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : chartHealth.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-16">Chưa có dữ liệu tồn kho</p>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartHealth} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                    {chartHealth.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [`${v} SKU (${((v / stats.skuCount) * 100).toFixed(0)}%)`, name]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginBottom: 28 }}>
                <span className="text-2xl font-black text-slate-800 dark:text-white">{stats.skuCount}</span>
                <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">SKU</span>
              </div>
            </div>
          )}
        </div>
        <div className={`${card} p-5`}>
          <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide mb-4 flex items-center gap-2">
            <Icon name="bar_chart" className="text-amber-600" /> Top SKU cần nhập hàng gấp
          </p>
          {loadingGlobalStats ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-3 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : chartLowBar.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-16">Không có SKU nào sắp hết hoặc hết hàng 🎉</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(180, chartLowBar.length * 26)}>
                <BarChart data={chartLowBar} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barCategoryGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [`${v} sản phẩm`, "Tồn kho"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.productName || ""}
                  />
                  <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={14}>
                    {chartLowBar.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STOCK_COLORS.low }} /> Sắp hết
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STOCK_COLORS.out }} /> Hết hàng
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bộ lọc */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="tune" className="text-teal-600 text-lg" />
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase">Quản lý tồn kho SKU</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSyncRedis}
              disabled={syncing}
              title="Đọc lại toàn bộ tồn kho từ DB và ghi vào Redis, sửa trường hợp Redis bị lệch so với DB"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-50 transition-colors"
            >
              <Icon name={syncing ? "sync" : "sync"} className={`text-sm ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Đang đồng bộ..." : "Đồng bộ Redis từ DB"}
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Ngưỡng cảnh báo:</span>
              <input
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={(e) => { setThreshold(Number(e.target.value) || 10); setPage(0); }}
                className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-center font-bold"
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm sản phẩm theo tên..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className={`${input} pl-10`}
            />
          </div>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className={input}>
            <option value="all">Tất cả trạng thái</option>
            <option value="healthy">Ổn định</option>
            <option value="low">Sắp hết</option>
            <option value="out">Hết hàng</option>
          </select>
        </div>
      </div>

      {/* Bảng */}
      <div className={`${card} overflow-hidden`}>
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-400">Đang đồng bộ tồn kho...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center">
            <Icon name="inventory" className="text-5xl text-slate-300 mx-auto mb-3" />
            {products.length === 0 ? (
              <>
                <p className="text-sm font-bold text-slate-500">Chưa có sản phẩm nào</p>
                <p className="text-xs text-slate-400 mt-2">Thêm sản phẩm ở tab &quot;Thêm sản phẩm&quot; trước khi quản lý tồn kho.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-500">Không có SKU phù hợp bộ lọc</p>
                <p className="text-xs text-slate-400 mt-2">Thử đổi bộ lọc trạng thái hoặc xóa từ khóa tìm kiếm.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-900/50 text-slate-500 border-b border-slate-100 dark:border-slate-700">
                  <th className="p-4 font-bold text-[10px] uppercase">Sản phẩm / SKU</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Tồn kho</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Trạng thái</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-36">Cập nhật</th>
                  <th className="p-4 font-bold text-[10px] uppercase w-32 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredRows.map(row => {
                  const badgeCls = row.level === "healthy"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : row.level === "low"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
                  return (
                    <tr key={invKey(row.productId, row.variantId)} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/20">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-600 overflow-hidden shrink-0">
                            {row.productImage ? (
                              <img src={row.productImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300">
                                <Icon name="image" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-800 dark:text-slate-100">{row.productName}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{row.sku}</p>
                            {row.variantLabel && (
                              <p className="text-[10px] text-teal-600 dark:text-teal-400 font-bold mt-0.5">{row.variantLabel}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`text-lg font-black ${row.level === "out" ? "text-rose-600" : row.level === "low" ? "text-amber-600" : "text-slate-800 dark:text-white"}`}>
                          {row.quantity}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-bold ${badgeCls}`}>
                          {stockLabel(row.level)}
                        </span>
                      </td>
                      <td className="p-4 text-[10px] font-medium text-slate-500">{formatDate(row.lastUpdated)}</td>
                      <td className="p-4">
                        <div className="flex justify-center gap-1">
                          <button type="button" onClick={() => openRestock(row)} className="p-2 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 text-teal-600" title="Nhập kho">
                            <Icon name="add_box" className="text-base" />
                          </button>
                          <button type="button" onClick={() => openAdjust(row)} className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600" title="Chỉnh tồn">
                            <Icon name="edit" className="text-base" />
                          </button>
                          <button type="button" onClick={() => openTransactions(row)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500" title="Lịch sử">
                            <Icon name="history" className="text-base" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredRows.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
            <span className="text-[11px] font-semibold text-slate-500">Trang {page + 1}</span>
            <div className="flex gap-2">
              <button type="button" disabled={!hasPrevious} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-600 disabled:opacity-40">← Trước</button>
              <button type="button" disabled={!hasNext} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white disabled:opacity-40">Sau →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-600 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <span className="font-extrabold text-sm text-slate-800 dark:text-white">
                {modal.type === "adjust" && "Chỉnh tồn kho"}
                {modal.type === "restock" && "Nhập kho bổ sung"}
                {modal.type === "transactions" && "Lịch sử giao dịch"}
              </span>
              <button type="button" onClick={() => setModal(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <Icon name="close" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {modal.row && (
                <p className="text-xs font-semibold text-slate-500">
                  {modal.row.productName} · <span className="font-mono">{modal.row.sku}</span>
                </p>
              )}

              {modal.type === "adjust" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Số lượng tuyệt đối</label>
                    <input type="number" min={0} value={modalQty} onChange={(e) => setModalQty(Number(e.target.value))} className={input} />
                  </div>
                  <button type="button" disabled={saving} onClick={handleSaveAdjust} className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black uppercase disabled:opacity-60">
                    {saving ? "Đang lưu..." : "Cập nhật tồn"}
                  </button>
                </>
              )}

              {modal.type === "restock" && (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Số lượng nhập thêm *</label>
                    <input type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(Number(e.target.value))} className={input} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nhà cung cấp</label>
                    <input type="text" value={restockSupplier} onChange={(e) => setRestockSupplier(e.target.value)} className={input} placeholder="Tùy chọn" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ghi chú</label>
                    <textarea rows={2} value={restockNote} onChange={(e) => setRestockNote(e.target.value)} className={input} placeholder="Lý do nhập hàng..." />
                  </div>
                  <button type="button" disabled={saving} onClick={handleSaveRestock} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase disabled:opacity-60">
                    {saving ? "Đang nhập..." : "Xác nhận nhập kho"}
                  </button>
                </>
              )}

              {modal.type === "transactions" && (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {txLoading ? (
                    <p className="text-xs text-slate-400 text-center py-8">Đang tải...</p>
                  ) : transactions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">Chưa có giao dịch</p>
                  ) : (
                    transactions.map(tx => (
                      <div key={tx.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-teal-600">{tx.transactionType}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(tx.createdAt)}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">
                          {tx.quantityBefore} → {tx.quantityAfter}
                          <span className={tx.quantityChanged >= 0 ? " text-emerald-600" : " text-rose-600"}>
                            {" "}({tx.quantityChanged >= 0 ? "+" : ""}{tx.quantityChanged})
                          </span>
                        </p>
                        {tx.note && <p className="text-[10px] text-slate-500 mt-0.5">{tx.note}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
