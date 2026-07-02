import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [products, setProducts] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setSelectedBrands([]);
    productApi
      .searchProducts(query)
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))), [products]);
  const sortedProducts = useMemo(() => {
    const list = products.filter((product) => selectedBrands.length === 0 || selectedBrands.includes(product.brand));
    if (sortBy === "price-asc") return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === "price-desc") return [...list].sort((a, b) => b.price - a.price);
    if (sortBy === "rating") return [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return list;
  }, [products, selectedBrands, sortBy]);

  const handleBrandChange = (brand) => {
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  };

  return (
    <div className="max-w-container-max w-full mx-auto py-md px-md lg:px-lg min-h-screen text-on-background font-body-lg">
      <div className="mb-md">
        <h1 className="text-headline-md font-bold mb-xs">Kết quả tìm kiếm: <span className="text-primary">"{query}"</span></h1>
        <p className="font-body-sm text-secondary">Tìm thấy <strong>{sortedProducts.length}</strong> sản phẩm.</p>
      </div>

      {loading && <p className="admin-note">Đang tải kết quả tìm kiếm...</p>}
      {error && <p className="admin-error">{error}</p>}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-md items-start">
          <aside className="md:col-span-3 bg-surface-container-lowest p-md rounded-lg shadow-sm border border-surface-container-highest space-y-md">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wide border-b border-surface-container-highest pb-xs mb-sm flex items-center justify-between">
              <span>Hãng sản xuất</span>
              <Icon className="text-secondary text-[16px]" name="filter_alt" />
            </h3>
            {brands.map((brand) => (
              <label key={brand} className="flex items-center gap-sm font-body-sm cursor-pointer text-on-surface-variant hover:text-on-surface">
                <input type="checkbox" checked={selectedBrands.includes(brand)} onChange={() => handleBrandChange(brand)} />
                <span>{brand}</span>
              </label>
            ))}
          </aside>
          <section className="md:col-span-9 space-y-md">
            <div className="bg-surface-container-lowest p-sm px-md rounded-lg shadow-sm border border-surface-container-highest flex flex-col sm:flex-row items-center justify-between gap-sm">
              <span className="font-body-sm text-secondary">Sắp xếp</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="relevance">Liên quan nhất</option>
                <option value="price-asc">Giá tăng dần</option>
                <option value="price-desc">Giá giảm dần</option>
                <option value="rating">Đánh giá tốt nhất</option>
              </select>
            </div>
            {sortedProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
                {sortedProducts.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-xl text-center">
                <Icon className="text-[64px] text-secondary opacity-40" name="search_off" />
                <h3 className="font-bold text-headline-md text-on-surface">Không tìm thấy sản phẩm</h3>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
