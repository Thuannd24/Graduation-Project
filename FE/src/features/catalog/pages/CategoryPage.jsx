import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard.jsx";
import { productApi } from "../../../services/productApi";
import Icon from "../../../components/common/Icon.jsx";
import { formatVnd } from "../../../utils/format.js";
import { getBrandLogo } from "../../../utils/brandLogo.jsx";

const categoryTabs = [
  { id: "mobile", label: "Mobile", icon: "smartphone" },
  { id: "laptop", label: "Laptop", icon: "laptop" },
  { id: "tablet", label: "Tablet", icon: "tablet_mac" },
  { id: "audio", label: "Audio", icon: "headset" },
  { id: "wearable", label: "Wearable", icon: "watch" },
  { id: "camera", label: "Camera", icon: "photo_camera" },
  { id: "gaming", label: "Gaming", icon: "sports_esports" },
  { id: "network", label: "Network", icon: "router" },
  { id: "accessories", label: "Accessories", icon: "cable" }
];

const categoryPromotions = {
  laptop: [
    {
      id: "laptop-flagship",
      badge: "SIÊU HOT",
      title: "Laptop Flagship Power",
      description: "Ưu đãi giảm thêm 2M VNĐ cho VIP Member",
      cta: {
        label: "Xem Ngay",
        to: "/search?q=laptop%20cao%20cap",
        buttonClassName: "bg-white text-blue-700"
      },
      gradient: "from-blue-600 to-indigo-700",
      icon: "laptop_mac"
    },
    {
      id: "accessories-upgrade",
      badge: "LIMITED DEAL",
      title: "Combo Phụ Kiện Cao Cấp",
      description: "Tiết kiệm 40% khi mua kèm laptop",
      cta: {
        label: "Khám Phá",
        to: "/search?q=phu%20kien%20laptop",
        buttonClassName: "bg-white text-red-650"
      },
      gradient: "from-red-650 to-amber-600",
      icon: "headset"
    }
  ]
};

export default function CategoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  const categoryParam = searchParams.get("activeCategory");
  const brandParam = searchParams.get("brand");

  // Filtering states
  const [activeCategory, setActiveCategory] = useState(categoryParam || "laptop");
  const [selectedBrands, setSelectedBrands] = useState(brandParam ? [brandParam] : []);
  const [discountOnly, setDiscountOnly] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 50000000 });
  const [selectedRam, setSelectedRam] = useState([]);
  const [selectedProcessor, setSelectedProcessor] = useState([]);
  const [selectedCpuBrand, setSelectedCpuBrand] = useState([]);
  const [selectedDriveSize, setSelectedDriveSize] = useState([]);
  const [sortBy, setSortBy] = useState("featured");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Chat window state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLog, setChatLog] = useState([
    { sender: "bot", text: "Xin chào! AuraTech có thể giúp gì cho bạn hôm nay?" }
  ]);

  const [dbCategories, setDbCategories] = useState([]);
  const [availableBrands, setAvailableBrands] = useState([]);
  const activePromotions = categoryPromotions[activeCategory] || [];

  // Update activeCategory and selectedBrands if search params change
  useEffect(() => {
    if (categoryParam) {
      setActiveCategory(categoryParam);
    }
    if (brandParam) {
      setSelectedBrands([brandParam]);
    } else {
      // Only clear selected brands if we changed the category
      // or if brandParam is explicitly absent while categoryParam is present
      setSelectedBrands([]);
    }
  }, [categoryParam, brandParam]);

  // Load products
  useEffect(() => {
    productApi
      .listProducts()
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load categories tree
  useEffect(() => {
    productApi.listCategories()
      .then(res => {
        const flat = [];
        const traverse = (nodes) => {
          nodes.forEach(n => {
            flat.push(n);
            if (n.children) traverse(n.children);
          });
        };
        traverse(res);
        setDbCategories(flat);
      })
      .catch(console.error);
  }, []);

  // Load brands for current category dynamically
  useEffect(() => {
    const matched = dbCategories.find(c =>
      c.slug === activeCategory ||
      c.name?.toLowerCase() === activeCategory.toLowerCase()
    );

    if (matched) {
      productApi.listBrandsByCategory(matched.id)
        .then(setAvailableBrands)
        .catch(err => {
          console.error("Failed to load brands by category:", err);
          setAvailableBrands([]);
        });
    } else {
      productApi.listBrands()
        .then(setAvailableBrands)
        .catch(err => {
          console.error("Failed to load all brands:", err);
          setAvailableBrands([]);
        });
    }
  }, [activeCategory, dbCategories]);

  // Filter products locally
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Category Filter
      const cat = String(product.category || "").toLowerCase();
      const name = String(product.name || "").toLowerCase();

      let matchesCat = false;
      if (activeCategory === "mobile") {
        matchesCat = cat.includes("phone") || cat.includes("điện thoại") || name.includes("iphone") || name.includes("samsung");
      } else if (activeCategory === "laptop") {
        matchesCat = cat.includes("laptop") || cat.includes("macbook") || name.includes("laptop") || name.includes("macbook");
      } else if (activeCategory === "tablet") {
        matchesCat = cat.includes("tablet") || cat.includes("ipad") || name.includes("ipad") || name.includes("tab");
      } else if (activeCategory === "audio") {
        matchesCat = cat.includes("audio") || cat.includes("âm thanh") || cat.includes("tai nghe") || cat.includes("loa");
      } else if (activeCategory === "wearable") {
        matchesCat = cat.includes("wearable") || cat.includes("đồng hồ") || name.includes("watch");
      } else if (activeCategory === "camera") {
        matchesCat = cat.includes("camera") || name.includes("camera") || name.includes("webcam");
      } else if (activeCategory === "gaming") {
        matchesCat = cat.includes("gaming") || name.includes("gaming") || name.includes("chuột gaming");
      } else if (activeCategory === "network") {
        matchesCat = cat.includes("network") || cat.includes("wifi") || name.includes("router");
      } else if (activeCategory === "accessories") {
        matchesCat = cat.includes("accessory") || cat.includes("phụ kiện") || cat.includes("cáp") || cat.includes("sạc");
      } else {
        matchesCat = true;
      }
      if (!matchesCat) return false;

      // 2. Brand Filter
      if (selectedBrands.length > 0) {
        const brand = String(product.brand || "").toLowerCase();
        const matchesBrand = selectedBrands.some(b => brand.includes(b.toLowerCase()) || name.includes(b.toLowerCase()));
        if (!matchesBrand) return false;
      }

      // 3. Discount Filter
      if (discountOnly) {
        const isDiscounted = Number(product.oldPrice || 0) > Number(product.price || 0);
        if (!isDiscounted) return false;
      }

      // 4. Price range Filter
      const price = Number(product.price || 0);
      if (price < priceRange.min || price > priceRange.max) return false;

      // 5. RAM Filter
      if (selectedRam.length > 0) {
        const matchesRam = selectedRam.some(ram => name.includes(ram.toLowerCase()) || (product.specs && product.specs.some(s => s.toLowerCase().includes(ram.toLowerCase()))));
        if (!matchesRam) return false;
      }

      // 6. Processor Filter
      if (selectedProcessor.length > 0) {
        const matchesProcessor = selectedProcessor.some(proc => name.includes(proc.toLowerCase()) || (product.specs && product.specs.some(s => s.toLowerCase().includes(proc.toLowerCase()))));
        if (!matchesProcessor) return false;
      }

      // 7. CPU Brand Filter
      if (selectedCpuBrand.length > 0) {
        const matchesCpuBrand = selectedCpuBrand.some(cb => name.includes(cb.toLowerCase()) || (product.specs && product.specs.some(s => s.toLowerCase().includes(cb.toLowerCase()))));
        if (!matchesCpuBrand) return false;
      }

      // 8. Drive Size Filter
      if (selectedDriveSize.length > 0) {
        const matchesDrive = selectedDriveSize.some(drive => name.includes(drive.toLowerCase()) || (product.specs && product.specs.some(s => s.toLowerCase().includes(drive.toLowerCase()))));
        if (!matchesDrive) return false;
      }

      return true;
    });
  }, [products, activeCategory, selectedBrands, discountOnly, priceRange, selectedRam, selectedProcessor, selectedCpuBrand, selectedDriveSize]);

  // Sort products
  const sortedProducts = useMemo(() => {
    const items = [...filteredProducts];
    if (sortBy === "price_asc") {
      items.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === "price_desc") {
      items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortBy === "rating_desc") {
      items.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    }
    return items;
  }, [filteredProducts, sortBy]);

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(startIdx, startIdx + itemsPerPage);
  }, [sortedProducts, currentPage]);

  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);

  // Toggle helpers
  const handleBrandChange = (brand) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
    setCurrentPage(1);
  };

  const handleRamChange = (ram) => {
    setSelectedRam(prev =>
      prev.includes(ram) ? prev.filter(r => r !== ram) : [...prev, ram]
    );
    setCurrentPage(1);
  };

  const handleProcessorChange = (proc) => {
    setSelectedProcessor(prev =>
      prev.includes(proc) ? prev.filter(p => p !== proc) : [...prev, proc]
    );
    setCurrentPage(1);
  };

  const handleCpuBrandChange = (cb) => {
    setSelectedCpuBrand(prev =>
      prev.includes(cb) ? prev.filter(c => c !== cb) : [...prev, cb]
    );
    setCurrentPage(1);
  };

  const handleDriveSizeChange = (drive) => {
    setSelectedDriveSize(prev =>
      prev.includes(drive) ? prev.filter(d => d !== drive) : [...prev, drive]
    );
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setSelectedBrands([]);
    setDiscountOnly(false);
    setPriceRange({ min: 0, max: 50000000 });
    setSelectedRam([]);
    setSelectedProcessor([]);
    setSelectedCpuBrand([]);
    setSelectedDriveSize([]);
    setCurrentPage(1);
  };

  // Build active filter chips
  const activeChips = useMemo(() => {
    const chips = [];
    selectedBrands.forEach(b => chips.push({ type: "brand", label: b }));
    if (discountOnly) chips.push({ type: "discount", label: "Đang giảm giá" });
    if (priceRange.min > 0 || priceRange.max < 50000000) {
      chips.push({ type: "price", label: `${formatVnd(priceRange.min)} - ${formatVnd(priceRange.max)}` });
    }
    selectedRam.forEach(r => chips.push({ type: "ram", label: `RAM: ${r}` }));
    selectedProcessor.forEach(p => chips.push({ type: "processor", label: p }));
    selectedCpuBrand.forEach(c => chips.push({ type: "cpuBrand", label: c }));
    selectedDriveSize.forEach(d => chips.push({ type: "drive", label: `SSD/HDD: ${d}` }));
    return chips;
  }, [selectedBrands, discountOnly, priceRange, selectedRam, selectedProcessor, selectedCpuBrand, selectedDriveSize]);

  const handleRemoveChip = (chip) => {
    if (chip.type === "brand") handleBrandChange(chip.label);
    if (chip.type === "discount") setDiscountOnly(false);
    if (chip.type === "price") setPriceRange({ min: 0, max: 50000000 });
    if (chip.type === "ram") handleRamChange(chip.label.replace("RAM: ", ""));
    if (chip.type === "processor") handleProcessorChange(chip.label);
    if (chip.type === "cpuBrand") handleCpuBrandChange(chip.label);
    if (chip.type === "drive") handleDriveSizeChange(chip.label.replace("SSD/HDD: ", ""));
  };

  // Chat message submit
  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setChatLog(prev => [...prev, { sender: "user", text: chatMessage }]);
    const currentMsg = chatMessage;
    setChatMessage("");
    setTimeout(() => {
      setChatLog(prev => [...prev, {
        sender: "bot",
        text: `Cảm ơn bạn đã hỏi về "${currentMsg}". Đội ngũ hỗ trợ của AuraTech sẽ phản hồi bạn trong 1-2 phút.`
      }]);
    }, 1000);
  };

  return (
    <div className="space-y-6 py-4 relative">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-on-secondary-fixed-variant font-body-sm text-body-sm mb-2">
        <a className="hover:text-primary transition-colors" href="/">Trang chủ</a>
        <Icon className="text-[16px]" name="chevron_right" />
        <span className="text-primary font-bold">Sản phẩm</span>
        {activeCategory && (
          <>
            <Icon className="text-[16px]" name="chevron_right" />
            <span className="text-primary font-bold capitalize">{activeCategory}</span>
          </>
        )}
      </nav>

      {/* Category Icons at Top */}
      <div className="flex overflow-x-auto gap-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 shadow-sm hide-scrollbar">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setSearchParams({ activeCategory: tab.id });
              setCurrentPage(1);
            }}
            className={`flex flex-col items-center gap-1.5 min-w-[70px] cursor-pointer border-none bg-transparent transition-all duration-300 ${activeCategory === tab.id
                ? "text-primary scale-110 font-bold"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            type="button"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${activeCategory === tab.id ? "bg-red-50 text-primary dark:bg-red-950/30" : "bg-slate-50 dark:bg-slate-800"
              }`}>
              <Icon name={tab.icon} className="text-xl" />
            </div>
            <span className="text-[11px] uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Filter Chips Bar */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-150/50 dark:border-slate-800/40">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider mr-2">Bộ lọc:</span>
          {activeChips.map((chip, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-semibold text-slate-650 dark:text-slate-350 shadow-sm"
            >
              {chip.label}
              <button
                onClick={() => handleRemoveChip(chip)}
                className="w-4 h-4 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center border-none cursor-pointer text-[10px]"
                type="button"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Two Column Layout: Sidebar & Products Grid */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Filter Sidebar */}
        <aside className="w-full lg:w-[264px] shrink-0 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="filter_alt" className="text-sm" />
                Bộ lọc
              </h3>
              <button
                onClick={handleClearAllFilters}
                className="text-xs font-bold text-primary hover:underline border-none bg-transparent cursor-pointer"
                type="button"
              >
                Xóa tất cả
              </button>
            </div>

            {/* Brand Checkboxes */}
            <div className="space-y-2.5">
              <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Hãng sản xuất</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {availableBrands.map((brandObj) => {
                  const brand = brandObj.name;
                  return (
                    <label key={brandObj.id} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(brand)}
                        onChange={() => handleBrandChange(brand)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      {brandObj.logoUrl && (
                        <img src={brandObj.logoUrl} alt={brand} className="w-5.5 h-4 object-contain rounded bg-white border border-slate-100 p-0.5" />
                      )}
                      <span>{brand}</span>
                    </label>
                  );
                })}
                {availableBrands.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">Không có hãng tương ứng.</span>
                )}
              </div>
            </div>

            {/* Discount Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-b border-slate-50 dark:border-slate-800">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Chỉ sản phẩm giảm giá</span>
              <button
                onClick={() => setDiscountOnly(!discountOnly)}
                className={`w-9 h-5 rounded-full p-0.5 border-none cursor-pointer transition-colors duration-250 ${discountOnly ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
                  }`}
                type="button"
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-250 ${discountOnly ? "translate-x-4" : "translate-x-0"
                  }`} />
              </button>
            </div>

            {/* Price Filter range */}
            <div className="space-y-3">
              <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Khoảng giá</h4>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceRange.min}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, min: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-center"
                />
                <span className="text-slate-400 self-center">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={priceRange.max}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, max: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-center"
                />
              </div>
            </div>

            {/* RAM Filter */}
            {activeCategory === "laptop" && (
              <div className="space-y-2 border-t border-slate-50 dark:border-slate-800 pt-3">
                <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Dung lượng RAM</h4>
                <div className="space-y-2">
                  {["8 GB", "12 GB", "16 GB", "32 GB"].map((ram) => (
                    <label key={ram} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350">
                      <input
                        type="checkbox"
                        checked={selectedRam.includes(ram)}
                        onChange={() => handleRamChange(ram)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <span>{ram}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Processor Filter */}
            {activeCategory === "laptop" && (
              <div className="space-y-2 border-t border-slate-50 dark:border-slate-800 pt-3">
                <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Vi xử lý</h4>
                <div className="space-y-2">
                  {["Intel Core i5", "Intel Core i7", "Intel Core i9", "AMD Ryzen 9"].map((proc) => (
                    <label key={proc} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350">
                      <input
                        type="checkbox"
                        checked={selectedProcessor.includes(proc)}
                        onChange={() => handleProcessorChange(proc)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <span>{proc}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* CPU Brand Filter */}
            {activeCategory === "laptop" && (
              <div className="space-y-2 border-t border-slate-50 dark:border-slate-800 pt-3">
                <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">Thương hiệu CPU</h4>
                <div className="space-y-2">
                  {["Intel", "AMD", "Apple", "NVIDIA"].map((cb) => (
                    <label key={cb} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350">
                      <input
                        type="checkbox"
                        checked={selectedCpuBrand.includes(cb)}
                        onChange={() => handleCpuBrandChange(cb)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <span>{cb}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Drive Size Filter */}
            {activeCategory === "laptop" && (
              <div className="space-y-2 border-t border-slate-50 dark:border-slate-800 pt-3">
                <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">Dung lượng ổ cứng</h4>
                <div className="space-y-2">
                  {["64GB", "128GB", "256GB", "512GB"].map((drive) => (
                    <label key={drive} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-350">
                      <input
                        type="checkbox"
                        checked={selectedDriveSize.includes(drive)}
                        onChange={() => handleDriveSizeChange(drive)}
                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                      />
                      <span>{drive}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Products Section */}
        <section className="flex-1 space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
            <h1 className="text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {activeCategory} <span className="text-slate-450 font-semibold text-xs ml-1 font-sans italic">({filteredProducts.length} sản phẩm)</span>
            </h1>

            {/* Sort Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sắp xếp:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 py-1.5 px-3 focus:outline-none cursor-pointer"
              >
                <option value="featured">Nổi bật</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
                <option value="rating_desc">Đánh giá cao</option>
              </select>
            </div>
          </div>

          {/* Brand Quick Filter Pill Row */}
          {(availableBrands || []).length > 0 && (
            <div className="flex flex-wrap gap-2 py-1 items-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mr-1">Thương hiệu:</span>
              {(availableBrands || []).filter(Boolean).map((brandObj) => {
                const brandName = brandObj.name;
                const isSelected = selectedBrands.includes(brandName);
                const officialLogo = getBrandLogo(brandName);

                return (
                  <button
                    key={brandObj.id}
                    onClick={() => handleBrandChange(brandName)}
                    type="button"
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 hover:scale-[1.02] cursor-pointer shadow-sm min-h-[30px] ${
                      isSelected
                        ? "border-red-500 bg-red-50/50 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-extrabold"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {brandObj.logoUrl ? (
                      <img src={brandObj.logoUrl} alt={brandName} className="h-3.5 object-contain rounded" />
                    ) : officialLogo ? (
                      officialLogo
                    ) : (
                      <span className="capitalize">{brandName}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Products Grid */}
          {loading ? (
            <div className="flex flex-col items-center py-20">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 text-xs mt-3 font-semibold">Đang tải sản phẩm...</p>
            </div>
          ) : error ? (
            <p className="text-red-500 font-semibold text-center py-10 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl">{error}</p>
          ) : paginatedProducts.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-xl shadow-sm">
              <Icon name="inventory_2" className="text-5xl text-slate-350 dark:text-slate-700 mb-2" />
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Không tìm thấy sản phẩm nào khớp với bộ lọc của bạn.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedProducts.map((product) => (
                <ProductCard product={product} key={product.id} />
              ))}
            </div>
          )}

          {/* Mixed In Promotions Banner */}
          {!loading && activePromotions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
              {activePromotions.map((promotion) => (
                <div
                  key={promotion.id}
                  className={`bg-gradient-to-r ${promotion.gradient} rounded-xl p-5 text-white flex justify-between items-center relative overflow-hidden group shadow-md min-h-[140px]`}
                >
                  <div className="space-y-1.5 z-10">
                    {promotion.badge && (
                      <span className="bg-white/20 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full w-max uppercase tracking-wider">
                        {promotion.badge}
                      </span>
                    )}
                    <h3 className="text-lg font-black leading-tight uppercase max-w-[200px]">
                      {promotion.title}
                    </h3>
                    {promotion.description && (
                      <p className="text-xs text-slate-200">{promotion.description}</p>
                    )}
                    {promotion.cta?.to && promotion.cta?.label && (
                      <Link
                        to={promotion.cta.to}
                        className={`inline-block mt-2 px-4 py-1.5 font-extrabold text-[10px] rounded uppercase hover:bg-slate-100 transition-colors ${promotion.cta.buttonClassName}`}
                      >
                        {promotion.cta.label}
                      </Link>
                    )}
                  </div>
                  {promotion.icon && (
                    <div className="absolute right-4 bottom-0 top-0 w-32 flex items-center justify-center z-0 opacity-40 group-hover:scale-105 transition-transform duration-300">
                      <Icon name={promotion.icon} className="text-[120px]" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-4">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center cursor-pointer"
                type="button"
              >
                <Icon name="chevron_left" />
              </button>
              {Array.from({ length: totalPages }, (_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index + 1)}
                  className={`w-8 h-8 rounded-lg font-bold text-xs ${currentPage === index + 1
                      ? "bg-primary text-white"
                      : "border border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"
                    } cursor-pointer`}
                  type="button"
                >
                  {index + 1}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-800 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center cursor-pointer"
                type="button"
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Trust Badges */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-100 dark:border-slate-800/80 pt-8 mt-10">
        <div className="flex flex-col items-center text-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
          <Icon name="verified_user" className="text-3xl text-primary mb-2" />
          <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">Cam kết chính hãng</h4>
          <p className="text-xs text-slate-500 mt-1">Đền bù 200% nếu phát hiện hàng giả, hàng nhái</p>
        </div>
        <div className="flex flex-col items-center text-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
          <Icon name="security" className="text-3xl text-emerald-600 mb-2" />
          <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">Bảo hành 1 đổi 1</h4>
          <p className="text-xs text-slate-500 mt-1">Lỗi do NSX được đổi sản phẩm mới ngay lập tức</p>
        </div>
        <div className="flex flex-col items-center text-center p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
          <Icon name="local_shipping" className="text-3xl text-blue-600 mb-2" />
          <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">Giao hàng siêu tốc</h4>
          <p className="text-xs text-slate-500 mt-1">Nhận hàng trong vòng 2 giờ tại các TP lớn</p>
        </div>
      </section>

      {/* Floating Chat Bubble widget */}
      <div className="fixed bottom-6 right-6 z-55 flex flex-col items-end">
        {chatOpen && (
          <div className="w-[320px] h-[400px] bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden mb-3 animate-fade-in">
            {/* Chat header */}
            <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="support_agent" />
                <div>
                  <h4 className="font-extrabold text-xs">Tech Helm Online chat</h4>
                  <span className="text-[10px] text-green-300 flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping inline-block"></span>
                    Hoạt động
                  </span>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="bg-transparent border-none text-white hover:text-slate-200 cursor-pointer flex items-center"
                type="button"
              >
                <Icon name="close" className="text-lg" />
              </button>
            </div>

            {/* Chat message body */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-50 dark:bg-slate-950 font-sans text-xs">
              {chatLog.map((log, idx) => (
                <div key={idx} className={`flex ${log.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${log.sender === "user"
                      ? "bg-primary text-white rounded-tr-none"
                      : "bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-200 border border-slate-150 dark:border-slate-800 rounded-tl-none shadow-sm"
                    }`}>
                    <p className="leading-relaxed">{log.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat footer input form */}
            <form onSubmit={handleChatSubmit} className="p-2 border-t border-slate-100 dark:border-slate-800 flex gap-1.5 bg-white dark:bg-slate-900">
              <input
                type="text"
                placeholder="Nhập tin nhắn..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="submit"
                className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center border-none cursor-pointer hover:bg-red-700 transition-colors shrink-0"
              >
                <Icon name="send" className="text-sm" />
              </button>
            </form>
          </div>
        )}

        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 hover:bg-red-700 transition-all border-none cursor-pointer"
          type="button"
          aria-label="Toggle Online Chat"
        >
          <Icon name={chatOpen ? "chat_bubble_outline" : "chat"} className="text-2xl" />
        </button>
      </div>
    </div>
  );
}
