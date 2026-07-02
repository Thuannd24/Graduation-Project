import React, { useState, useEffect, useMemo } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi.ts";

export default function CategoriesTab({ onNavigateToAddProduct }) {
  // Main Navigation Tab
  const [activeSubTab, setActiveSubTab] = useState("categories-eav"); // 'categories-eav' | 'products-list'

  // Dynamic Data Lists
  const [categories, setCategories] = useState([]);
  const [flatCategories, setFlatCategories] = useState([]); // flattened categories with hierarchy label
  const [products, setProducts] = useState([]);
  const [globalAttributes, setGlobalAttributes] = useState([]);
  const [linkedAttributes, setLinkedAttributes] = useState([]);
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  // Selection states
  const [selectedCategoryCard, setSelectedCategoryCard] = useState("all"); // Filter for product listing
  const [selectedCategoryConfigId, setSelectedCategoryConfigId] = useState(""); // Selected category for EAV mapping
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPill, setFilterPill] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Category Modal Form State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    slug: "",
    description: "",
    parentId: "",
    active: true,
    imageUrl: ""
  });
  const [uploadingCategoryImg, setUploadingCategoryImg] = useState(false);


  // Global Attribute Modal Form State
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [attributeForm, setAttributeForm] = useState({
    code: "",
    name: "",
    valueType: "text",
    allowedValues: ""
  });
  const [attributeOptions, setAttributeOptions] = useState([]);
  const [isColorAttr, setIsColorAttr] = useState(false);
  const [editingAttributeId, setEditingAttributeId] = useState(null);
  const [isEditingAssign, setIsEditingAssign] = useState(false);

  // Category Attribute Mapping Form State
  const [assignForm, setAssignForm] = useState({
    attributeId: "",
    isVariant: false,
    isRequired: false
  });

  // Fetch all initial data
  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [catsTree, prodsList, attrsList] = await Promise.all([
        productApi.listCategories(),
        productApi.listProducts(),
        productApi.listAttributes()
      ]);

      // Flatten category tree for select lists & cards mapping
      const flat = [];
      function flatten(node, prefix = "", level = 0) {
        const label = prefix ? `${prefix} > ${node.name}` : node.name;
        flat.push({ ...node, label, level });
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => flatten(child, label, level + 1));
        }
      }
      catsTree.forEach(root => flatten(root));

      setCategories(catsTree);
      setFlatCategories(flat);
      setProducts(prodsList);
      setGlobalAttributes(attrsList ? [...attrsList].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)) : []);

      // Pre-select first category for configuration if none selected
      if (flat.length > 0 && !selectedCategoryConfigId) {
        setSelectedCategoryConfigId(flat[0].id);
      }
    } catch (err) {
      console.error("Failed to load initial data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Fetch linked attributes whenever selected category configuration changes
  useEffect(() => {
    if (!selectedCategoryConfigId) {
      setLinkedAttributes([]);
      return;
    }

    async function loadLinkedAttributes() {
      try {
        setLoadingSpecs(true);
        const attrs = await productApi.getCategoryAttributes(selectedCategoryConfigId);
        setLinkedAttributes(attrs);
      } catch (err) {
        console.error("Failed to load category attributes", err);
      } finally {
        setLoadingSpecs(false);
      }
    }
    loadLinkedAttributes();
  }, [selectedCategoryConfigId]);

  // Handle Category Submit (Create/Update)
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: categoryForm.name,
        slug: categoryForm.slug || categoryForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: categoryForm.description,
        parentId: categoryForm.parentId ? Number(categoryForm.parentId) : null,
        active: categoryForm.active,
        imageUrl: categoryForm.imageUrl || ""
      };

      if (editingCategoryId) {
        await productApi.updateCategory(editingCategoryId, payload);
        alert("Cập nhật danh mục thành công!");
      } else {
        await productApi.createCategory(payload);
        alert("Thêm danh mục mới thành công!");
      }

      setShowCategoryModal(false);
      setCategoryForm({ name: "", slug: "", description: "", parentId: "", active: true, imageUrl: "" });
      setEditingCategoryId(null);
      loadInitialData();
    } catch (err) {
      alert("Lỗi lưu danh mục: " + err.message);
    }
  };

  // Handle Category Delete
  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa danh mục này? Tất cả các danh mục con và sản phẩm có thể bị ảnh hưởng.")) return;
    try {
      await productApi.deleteCategory(id);
      alert("Đã xóa danh mục thành công!");
      if (selectedCategoryConfigId === id) {
        setSelectedCategoryConfigId("");
      }
      loadInitialData();
    } catch (err) {
      alert("Lỗi xóa danh mục: " + err.message);
    }
  };

  // Nạp nhanh 20 màu sắc phổ biến
  const loadCommonColorsPreset = () => {
    const commonColors = [
      { name: "Đen", hex: "#000000", image: "" },
      { name: "Trắng", hex: "#ffffff", image: "" },
      { name: "Đỏ", hex: "#ef4444", image: "" },
      { name: "Xanh Dương", hex: "#3b82f6", image: "" },
      { name: "Hồng", hex: "#ec4899", image: "" },
      { name: "Xanh Lá", hex: "#10b981", image: "" },
      { name: "Vàng Gold", hex: "#d97706", image: "" },
      { name: "Bạc", hex: "#e5e7eb", image: "" },
      { name: "Xám Titan", hex: "#a8a29e", image: "" },
      { name: "Vàng", hex: "#fbbf24", image: "" },
      { name: "Cam", hex: "#f97316", image: "" },
      { name: "Tím", hex: "#8b5cf6", image: "" },
      { name: "Nâu", hex: "#78350f", image: "" },
      { name: "Xám", hex: "#6b7280", image: "" },
      { name: "Vàng Hồng", hex: "#b76e79", image: "" },
      { name: "Titan Sa Mạc", hex: "#c2b280", image: "" },
      { name: "Xanh Sierra", hex: "#88a9c3", image: "" },
      { name: "Đen Midnight", hex: "#1d2935", image: "" },
      { name: "Ánh Sao (Starlight)", hex: "#f2efe9", image: "" },
      { name: "Xám Không Gian", hex: "#343d46", image: "" }
    ];
    setAttributeOptions(commonColors);
  };

  const handleCloseAttributeModal = () => {
    setShowAttributeModal(false);
    setEditingAttributeId(null);
    setAttributeForm({ code: "", name: "", valueType: "text", allowedValues: "" });
    setAttributeOptions([]);
    setIsColorAttr(false);
  };

  // Handle Global Attribute Submit (Create)
  const handleSaveAttribute = async (e) => {
    e.preventDefault();
    try {
      let allowedValuesStr = "";
      if (attributeForm.valueType === "select") {
        const validOptions = attributeOptions
          .filter(o => o.name.trim() !== "")
          .map(o => {
            if (isColorAttr) {
              let hexVal = o.hex ? o.hex.trim() : "";
              if (/^[A-Fa-f0-9]{3}$/.test(hexVal) || /^[A-Fa-f0-9]{6}$/.test(hexVal)) {
                hexVal = "#" + hexVal;
              }
              return { name: o.name.trim(), hex: hexVal };
            } else {
              return { name: o.name.trim() };
            }
          });

        if (validOptions.length === 0) {
          alert("Vui lòng nhập ít nhất 1 giá trị lựa chọn!");
          return;
        }

        // Validate color entries on Front-End
        if (isColorAttr) {
          for (let i = 0; i < validOptions.length; i++) {
            const opt = validOptions[i];
            const hasHex = opt.hex !== "";

            if (!hasHex) {
              alert(`Dòng ${i + 1} (${opt.name}): Vui lòng nhập mã màu (ví dụ: #ff0000)!`);
              return;
            }

            const s = new Option().style;
            s.color = opt.hex;
            if (s.color === "") {
              alert(`Dòng ${i + 1} (${opt.name}): Mã màu "${opt.hex}" không đúng định dạng màu CSS hợp lệ (ví dụ: #ff0000, rgb(255,0,0) hoặc tên màu tiếng Anh)!`);
              return;
            }
          }
        }

        allowedValuesStr = JSON.stringify(validOptions);
      }

      const payload = {
        code: attributeForm.code.trim().toLowerCase(),
        name: attributeForm.name.trim(),
        valueType: attributeForm.valueType,
        allowedValues: attributeForm.valueType === "select" ? allowedValuesStr : null,
        isColor: isColorAttr
      };

      if (editingAttributeId) {
        await productApi.updateAttribute(editingAttributeId, payload);
        alert("Cập nhật thuộc tính thành công!");
      } else {
        await productApi.createAttribute(payload);
        alert("Tạo thuộc tính thành công!");
      }
      setShowAttributeModal(false);
      setAttributeForm({ code: "", name: "", valueType: "text", allowedValues: "" });
      setAttributeOptions([]);
      setIsColorAttr(false);
      setEditingAttributeId(null);
      loadInitialData();
    } catch (err) {
      alert("Lỗi lưu thuộc tính: " + err.message);
    }
  };

  // Handle Global Attribute Delete
  const handleDeleteAttribute = async (id) => {
    if (!window.confirm("Xóa thuộc tính này sẽ gỡ bỏ nó khỏi tất cả danh mục đã gán. Bạn chắc chắn?")) return;
    try {
      await productApi.deleteAttribute(id);
      alert("Đã xóa thuộc tính hệ thống!");
      loadInitialData();
    } catch (err) {
      alert("Lỗi xóa thuộc tính: " + err.message);
    }
  };

  // Handle Assign Attribute to Category
  const handleAssignAttribute = async (e) => {
    e.preventDefault();
    if (!assignForm.attributeId) {
      alert("Vui lòng chọn thuộc tính.");
      return;
    }
    if (!selectedCategoryConfigId) {
      alert("Vui lòng chọn một danh mục cấu hình.");
      return;
    }

    try {
      const payload = {
        attributeId: Number(assignForm.attributeId),
        isVariant: assignForm.isVariant,
        isRequired: assignForm.isRequired
      };

      await productApi.assignAttributeToCategory(selectedCategoryConfigId, payload);
      alert(isEditingAssign ? "Cập nhật cấu hình thuộc tính thành công!" : "Gán thuộc tính vào danh mục thành công!");
      setAssignForm({ attributeId: "", isVariant: false, isRequired: false });
      setIsEditingAssign(false);
      
      // Refresh category attribute mapping list
      const attrs = await productApi.getCategoryAttributes(selectedCategoryConfigId);
      setLinkedAttributes(attrs);
    } catch (err) {
      alert("Lỗi khi gán thuộc tính: " + err.message);
    }
  };

  // Handle Remove Attribute Mapping from Category
  const handleUnassignAttribute = async (attributeId) => {
    if (!window.confirm("Bạn có muốn gỡ thuộc tính này khỏi danh mục? Dữ liệu thông số của sản phẩm cũ vẫn sẽ được giữ lại.")) return;
    try {
      await productApi.removeAttributeFromCategory(selectedCategoryConfigId, attributeId);
      alert("Gỡ thuộc tính khỏi danh mục thành công!");
      
      // Refresh category attribute mapping list
      const attrs = await productApi.getCategoryAttributes(selectedCategoryConfigId);
      setLinkedAttributes(attrs);
    } catch (err) {
      alert("Lỗi khi gỡ thuộc tính: " + err.message);
    }
  };

  // Filter Products for Tab 2
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategoryCard === "all" || Number(p.categoryId) === Number(selectedCategoryCard);
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }, [filteredProducts]);

  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage) || 1;
  const paginatedProducts = useMemo(() => {
    return sortedProducts.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [sortedProducts, currentPage]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-400">Đang tải danh mục & thuộc tính...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      
      {/* Dynamic Header */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800">Cấu Hình Danh Mục & EAV</h4>
          <span className="text-[10px] text-slate-400 font-medium">Thiết lập cấu trúc danh mục, định nghĩa thuộc tính và gán quy tắc cho sản phẩm</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingCategoryId(null);
              setCategoryForm({ name: "", slug: "", description: "", parentId: "", active: true, imageUrl: "" });
              setShowCategoryModal(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Icon name="add" className="text-sm" />
            <span>Thêm Danh Mục</span>
          </button>
          <button
            onClick={() => setShowAttributeModal(true)}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
          >
            <Icon name="settings" className="text-sm text-slate-500" />
            <span>Định nghĩa thuộc tính</span>
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveSubTab("categories-eav")}
          className={`pb-3 text-xs font-bold relative transition-colors ${
            activeSubTab === "categories-eav" ? "text-emerald-700 border-b-2 border-emerald-600" : "text-slate-400 hover:text-slate-700"
          }`}
        >
          Phân Cấu Trúc Ngành Hàng & EAV
        </button>
        <button
          onClick={() => setActiveSubTab("products-list")}
          className={`pb-3 text-xs font-bold relative transition-colors ${
            activeSubTab === "products-list" ? "text-emerald-700 border-b-2 border-emerald-600" : "text-slate-400 hover:text-slate-700"
          }`}
        >
          Xem Sản Phẩm Theo Danh Mục ({products.length})
        </button>
      </div>

      {/* SUBTAB 1: Categories & EAV Configurations */}
      {activeSubTab === "categories-eav" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
          
          {/* Column Left: Category Hierarchy Tree (4/12) */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
              <Icon name="folder_open" className="text-emerald-600 text-sm" /> Sơ đồ Danh mục
            </span>

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {flatCategories.map((cat) => {
                const isSelected = selectedCategoryConfigId === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategoryConfigId(cat.id)}
                    style={{ paddingLeft: `${cat.level * 16}px` }}
                    className={`group flex justify-between items-center px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? "bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Icon
                        name={cat.level === 0 ? "folder" : "subdirectory_arrow_right"}
                        className={`text-sm ${isSelected ? "text-emerald-700" : "text-slate-400"}`}
                      />
                      <span className="text-xs font-bold truncate">{cat.name}</span>
                    </div>

                    {/* Actions on hover */}
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategoryId(cat.id);
                          setCategoryForm({
                            name: cat.name,
                            slug: cat.slug || "",
                            description: cat.description || "",
                            parentId: cat.parentId || "",
                            active: cat.active ?? true,
                            imageUrl: cat.imageUrl || ""
                          });
                          setShowCategoryModal(true);
                        }}
                        className="p-0.5 hover:bg-white rounded text-slate-400 hover:text-emerald-600"
                        title="Sửa"
                      >
                        <Icon name="edit" className="text-xs" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(cat.id);
                        }}
                        className="p-0.5 hover:bg-white rounded text-slate-400 hover:text-rose-600"
                        title="Xóa"
                      >
                        <Icon name="delete" className="text-xs" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {flatCategories.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">Chưa có danh mục nào. Hãy nhấn Thêm danh mục.</div>
              )}
            </div>
          </div>

          {/* Column Right: Linked Attributes / EAV mapping (8/12) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Box 1: EAV Attributes mapping list */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                    <Icon name="hub" className="text-emerald-600 text-sm" /> Thuộc Tính Kỹ Thuật Đã Gán
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Danh mục: <strong className="text-slate-700">{flatCategories.find(c => c.id === selectedCategoryConfigId)?.name || "Chưa chọn"}</strong>
                  </span>
                </div>
                <span className="bg-slate-100 text-[10px] text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  {linkedAttributes.length} thuộc tính
                </span>
              </div>

              {loadingSpecs ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50 text-[9px] font-bold text-slate-450 uppercase">
                      <tr>
                        <th className="px-4 py-3">Mã Code</th>
                        <th className="px-4 py-3">Tên Thuộc Tính</th>
                        <th className="px-4 py-3 text-center">Kiểu Thuộc Tính</th>
                        <th className="px-4 py-3 text-center">Bắt Buộc Nhập</th>
                        <th className="px-4 py-3 text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                      {linkedAttributes.map((attr) => (
                        <tr key={attr.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">{attr.attributeCode}</td>
                          <td className="px-4 py-3.5 font-bold text-slate-800">{attr.attributeName}</td>
                          
                          {/* isVariant badge */}
                          <td className="px-4 py-3.5 text-center">
                            {attr.isVariant ? (
                              <span className="bg-purple-50 text-purple-700 text-[9px] px-2 py-0.5 rounded-full font-bold">Trục biến thể (SKU)</span>
                            ) : (
                              <span className="bg-blue-50 text-blue-700 text-[9px] px-2 py-0.5 rounded-full font-bold">Thông số tĩnh</span>
                            )}
                          </td>
 
                          {/* isRequired badge */}
                          <td className="px-4 py-3.5 text-center">
                            {attr.isRequired ? (
                              <span className="text-red-600 font-extrabold text-[10px]">Có</span>
                            ) : (
                              <span className="text-slate-400 font-medium text-[10px]">Không</span>
                            )}
                          </td>
 
                          {/* Actions */}
                          <td className="px-4 py-3.5 text-center flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAssignForm({
                                  attributeId: attr.attributeId,
                                  isVariant: !!attr.isVariant,
                                  isRequired: !!attr.isRequired
                                });
                                setIsEditingAssign(true);
                              }}
                              className="p-1 hover:bg-slate-100 text-slate-450 hover:text-emerald-600 rounded transition-colors"
                              title="Chỉnh sửa cấu hình thuộc tính"
                            >
                              <Icon name="edit" className="text-sm" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUnassignAttribute(attr.attributeId)}
                              className="p-1 hover:bg-slate-100 text-slate-450 hover:text-rose-600 rounded transition-colors"
                              title="Gỡ thuộc tính khỏi danh mục"
                            >
                              <Icon name="link_off" className="text-sm" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {linkedAttributes.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-slate-400 italic text-[11px]">
                            Danh mục này chưa được gán bất kỳ thông số kỹ thuật nào.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Box 2: Form to Link/Assign Attribute */}
            {selectedCategoryConfigId && (
              <form onSubmit={handleAssignAttribute} className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                  <Icon name={isEditingAssign ? "edit_note" : "add_link"} className="text-emerald-600 text-sm" />
                  {isEditingAssign ? "Cập Nhật Cấu Hình Thuộc Tính" : "Gán Thuộc Tính Vào Danh Mục"}
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Chọn Thuộc tính</label>
                    <select
                      required
                      disabled={isEditingAssign}
                      value={assignForm.attributeId}
                      onChange={(e) => setAssignForm({ ...assignForm, attributeId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="">Chọn thuộc tính hệ thống</option>
                      {globalAttributes
                        .filter(gAttr => gAttr.id === Number(assignForm.attributeId) || !linkedAttributes.some(la => la.attributeCode === gAttr.code))
                        .map(gAttr => (
                          <option key={gAttr.id} value={gAttr.id}>{gAttr.name} ({gAttr.code})</option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Kiểu hiển thị *</label>
                    <select
                      value={assignForm.isVariant ? "variant" : "static"}
                      onChange={(e) => setAssignForm({ ...assignForm, isVariant: e.target.value === "variant" })}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                    >
                      <option value="static">Thông số tĩnh (Static Specs)</option>
                      <option value="variant">Biến thể bán hàng (Variant Axis)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Bắt buộc nhập</label>
                    <div className="flex items-center h-10">
                      <input
                        type="checkbox"
                        id="isRequired"
                        checked={assignForm.isRequired}
                        onChange={(e) => setAssignForm({ ...assignForm, isRequired: e.target.checked })}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="isRequired" className="text-xs text-slate-700 ml-2 font-bold cursor-pointer select-none">Bắt buộc nhập</label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  {isEditingAssign && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignForm({ attributeId: "", isVariant: false, isRequired: false });
                        setIsEditingAssign(false);
                      }}
                      className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Hủy bỏ
                    </button>
                  )}
                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Icon name={isEditingAssign ? "save" : "link"} className="text-sm" />
                    {isEditingAssign ? "Cập nhật cấu hình" : "Liên kết ngay"}
                  </button>
                </div>
              </form>
            )}

            {/* Box 3: Global System Attributes definition list */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                  <Icon name="dns" className="text-emerald-600 text-sm" /> Bộ Thuộc Tính Hệ Thống (Global Attributes)
                </span>
                <button
                  type="button"
                  onClick={() => {
                  setShowAttributeModal(true);
                  setAttributeOptions([{ name: "", hex: "#3b82f6", image: "" }]);
                  setIsColorAttr(false);
                }}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                >
                  <Icon name="add" className="text-sm" /> Tạo Thuộc Tính
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="min-w-full divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50 text-[9px] font-bold text-slate-450 uppercase">
                    <tr>
                      <th className="px-4 py-3">Mã Code</th>
                      <th className="px-4 py-3">Tên hiển thị</th>
                      <th className="px-4 py-3 text-center">Loại dữ liệu</th>
                      <th className="px-4 py-3 text-center">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {globalAttributes.map((attr) => (
                      <tr key={attr.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{attr.code}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{attr.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-slate-100 text-slate-655 text-[9px] px-2 py-0.5 rounded-full font-bold">
                            {attr.valueType === "select" ? "Danh sách chọn (select)" : "Văn bản thường (text)"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAttributeId(attr.id);
                              setAttributeForm({
                                code: attr.code,
                                name: attr.name,
                                valueType: attr.valueType,
                                allowedValues: attr.allowedValues || ""
                              });
                              setIsColorAttr(attr.isColor || false);
                              
                              if (attr.valueType === "select" && attr.allowedValues) {
                                try {
                                  setAttributeOptions(JSON.parse(attr.allowedValues));
                                } catch (e) {
                                  setAttributeOptions([]);
                                }
                              } else {
                                setAttributeOptions([]);
                              }
                              setShowAttributeModal(true);
                            }}
                            className="p-1 text-slate-450 hover:text-emerald-600 rounded transition-colors"
                            title="Chỉnh sửa thuộc tính hệ thống"
                          >
                            <Icon name="edit" className="text-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttribute(attr.id)}
                            className="p-1 text-slate-450 hover:text-rose-650 rounded transition-colors"
                            title="Xóa vĩnh viễn thuộc tính sàn"
                          >
                            <Icon name="delete" className="text-sm" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {globalAttributes.length === 0 && (
                      <tr>
                        <td colSpan="4" className="text-center py-8 text-slate-400 italic text-[11px]">
                          Chưa có thuộc tính hệ thống nào được định nghĩa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SUBTAB 2: Products Listing by Category */}
      {activeSubTab === "products-list" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Grid Category Cards (Discover) */}
          <div className="space-y-2">
            <span className="font-bold text-slate-450 text-[10px] uppercase block tracking-wider">Chọn danh mục</span>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {/* Card ALL */}
              <div
                onClick={() => {
                  setSelectedCategoryCard("all");
                  setCurrentPage(1);
                }}
                className={`bg-white rounded-xl border p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                  selectedCategoryCard === "all" ? "border-emerald-600 ring-2 ring-emerald-50" : "border-slate-200/70"
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mb-2">
                  <Icon name="grid_view" className="text-2xl text-slate-500" />
                </div>
                <span className="font-extrabold text-[11px] text-slate-700 block">Tất cả ngành hàng</span>
                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{products.length} sản phẩm</span>
              </div>

              {/* Cards from database */}
              {categories.map((cat) => {
                const isSelected = String(selectedCategoryCard) === String(cat.id);
                const count = products.filter(p => p.categoryId === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategoryCard(isSelected ? "all" : cat.id);
                      setCurrentPage(1);
                    }}
                    className={`bg-white rounded-xl border p-3 flex flex-col items-center justify-between text-center cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                      isSelected ? "border-emerald-600 ring-2 ring-emerald-50" : "border-slate-200/70"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center mb-2">
                      <img src={cat.imageUrl || "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=120"} alt={cat.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-center">
                      <span className="font-extrabold text-[11px] text-slate-700 block tracking-tight leading-tight">{cat.name}</span>
                      <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{count} sản phẩm</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table List Products */}
          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between">
            {/* Table Filters */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
              <div className="flex flex-wrap gap-1 bg-slate-100/70 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setFilterPill("all")}
                  className={`text-xs px-3.5 py-1.5 font-bold rounded-lg transition-all ${
                    filterPill === "all" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Tất cả ({filteredProducts.length})
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Tìm sản phẩm..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-700 placeholder-slate-400 w-48 transition-all"
                  />
                  <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
                </div>
              </div>
            </div>

            {/* Bảng sản phẩm */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-55/40 text-slate-400 border-b border-slate-100">
                    <th className="p-4 font-bold text-[10px] uppercase w-12 text-center">STT</th>
                    <th className="p-4 font-bold text-[10px] uppercase">Sản phẩm</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-32">Giá bán</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Đánh giá</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-24 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 text-center font-semibold text-slate-400">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded bg-slate-50 border border-slate-150 p-1 flex items-center justify-center">
                            <img src={p.image} alt={p.name} className="w-full h-full object-contain rounded" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-700 block truncate max-w-[200px]">{p.name}</span>
                            <span className="text-[9px] text-slate-400 font-bold uppercase block mt-0.5">
                              Danh mục: {flatCategories.find(c => c.id === p.categoryId)?.name || "Chưa phân loại"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-emerald-700 font-bold">
                        {p.price ? `${p.price.toLocaleString("vi-VN")} đ` : "Liên hệ"}
                      </td>
                      <td className="p-4 text-slate-550 font-bold text-center">
                        {p.rating ? `${p.rating} ⭐` : "Chưa có"}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button
                            onClick={() => alert("Hãy mở tab danh sách sản phẩm chính để thực hiện chỉnh sửa.")}
                            className="p-1 hover:bg-slate-100 rounded text-slate-450 hover:text-emerald-600"
                          >
                            <Icon name="edit" className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedProducts.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-8 text-slate-400 italic">Không tìm thấy sản phẩm nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Phân trang */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                ← Trước
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      currentPage === page
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Create/Edit Category */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <span className="font-extrabold text-sm text-slate-800">
                {editingCategoryId ? "Cập Nhật Danh Mục" : "Thêm Danh Mục Mới"}
              </span>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Tên danh mục *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/([^a-z0-9\s-]|_)+/g, "").trim().replace(/\s+/g, "-");
                    setCategoryForm({ ...categoryForm, name, slug });
                  }}
                  placeholder="Ví dụ: Thiết bị di động"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Slug đường dẫn *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                  placeholder="thiet-bi-di-dong"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Danh mục cha (Parent Category)</label>
                <select
                  value={categoryForm.parentId}
                  onChange={(e) => setCategoryForm({ ...categoryForm, parentId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                >
                  <option value="">Làm danh mục gốc (Root Category)</option>
                  {flatCategories
                    .filter(c => c.id !== editingCategoryId)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Mô tả danh mục</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Mô tả tóm tắt ngành hàng..."
                  rows="3"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Ảnh Logo / Biểu tượng danh mục</label>
                {categoryForm.imageUrl ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={categoryForm.imageUrl}
                      alt="Logo preview"
                      className="w-12 h-12 object-contain bg-white rounded border p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-slate-400 font-semibold truncate block">{categoryForm.imageUrl}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCategoryForm({ ...categoryForm, imageUrl: "" })}
                      className="p-1 hover:bg-slate-200 text-rose-600 hover:text-rose-700 rounded-lg transition-colors"
                      title="Gỡ ảnh"
                    >
                      <Icon name="delete" className="text-sm" />
                    </button>
                  </div>
                ) : (
                  <div className="relative border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-slate-50/50 rounded-xl p-4 transition-all text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setUploadingCategoryImg(true);
                          const url = await productApi.uploadProductImage(file, "categories");
                          setCategoryForm({ ...categoryForm, imageUrl: url });
                        } catch (err) {
                          alert("Lỗi tải ảnh: " + err.message);
                        } finally {
                          setUploadingCategoryImg(false);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={uploadingCategoryImg}
                    />
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Icon name={uploadingCategoryImg ? "hourglass_empty" : "upload_file"} className={`text-xl ${uploadingCategoryImg ? "animate-spin text-emerald-600" : "text-slate-400"}`} />
                      <span className="text-xs font-bold text-slate-600">
                        {uploadingCategoryImg ? "Đang tải ảnh lên..." : "Nhấp hoặc kéo thả ảnh logo để tải lên"}
                      </span>
                      <span className="text-[10px] text-slate-400">Định dạng JPG, PNG, WebP (Tỉ lệ 1:1 khuyến nghị)</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Trạng thái hoạt động</label>
                <select
                  value={categoryForm.active ? "true" : "false"}
                  onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.value === "true" })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                >
                  <option value="true">Đang kích hoạt (Active)</option>
                  <option value="false">Tạm khóa (Inactive)</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-extrabold text-slate-500 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                >
                  {editingCategoryId ? "Cập Nhật" : "Thêm mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Attribute */}
      {showAttributeModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <span className="font-extrabold text-sm text-slate-800">Định Nghĩa Thuộc Tính Mới</span>
              <button
                onClick={() => setShowAttributeModal(false)}
                className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSaveAttribute} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Mã Code Thuộc tính *</label>
                <input
                  type="text"
                  required
                  value={attributeForm.code}
                  onChange={(e) => {
                    const code = e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "");
                    setAttributeForm({ ...attributeForm, code });
                  }}
                  placeholder="Ví dụ: screen_size, ram, cpu, storage"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
                <span className="text-[10px] text-slate-400 font-bold block mt-1">Chỉ sử dụng chữ thường không dấu, số và dấu gạch dưới</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Tên Thuộc Tính Hiển Thị *</label>
                <input
                  type="text"
                  required
                  value={attributeForm.name}
                  onChange={(e) => setAttributeForm({ ...attributeForm, name: e.target.value })}
                  placeholder="Ví dụ: Kích thước màn hình"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Loại dữ liệu nhập</label>
                <select
                  value={attributeForm.valueType}
                  onChange={(e) => setAttributeForm({ ...attributeForm, valueType: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                >
                  <option value="text">Văn bản tự do (text - thích hợp cho CPU, Kích thước)</option>
                  <option value="select">Hộp lựa chọn danh sách (select - thích hợp cho RAM, Storage, Color)</option>
                </select>
              </div>

              {attributeForm.valueType === "select" && (
                <div className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 rounded-xl border border-slate-250/50">
                  <input
                    type="checkbox"
                    id="isColorAttrCheckbox"
                    checked={isColorAttr}
                    onChange={(e) => setIsColorAttr(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="isColorAttrCheckbox" className="text-xs text-slate-700 font-bold cursor-pointer select-none">
                    Đây là thuộc tính màu sắc (để hiển thị bảng màu & tải ảnh vân màu swatch)
                  </label>
                </div>
              )}

              {attributeForm.valueType === "select" && (
                <div className="space-y-3 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      Định nghĩa các lựa chọn (Options) *
                    </label>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-2 border border-slate-100 p-2.5 rounded-xl bg-slate-50/50">
                    {attributeOptions.map((opt, idx) => {
                      const checkColorValid = (val) => {
                        if (!val) return true;
                        let testVal = val.trim();
                        if (/^[A-Fa-f0-9]{3}$/.test(testVal) || /^[A-Fa-f0-9]{6}$/.test(testVal)) {
                          testVal = "#" + testVal;
                        }
                        const s = new Option().style;
                        s.color = testVal;
                        return s.color !== "";
                      };

                      const isInvalid = isColorAttr && !checkColorValid(opt.hex);

                      const getPreviewStyle = () => {
                        let val = opt.hex ? opt.hex.trim() : "";
                        if (val) {
                          if (/^[A-Fa-f0-9]{3}$/.test(val) || /^[A-Fa-f0-9]{6}$/.test(val)) {
                            val = "#" + val;
                          }
                          const s = new Option().style;
                          s.color = val;
                          if (s.color !== '') {
                            return { backgroundColor: val };
                          }
                        }
                        return { backgroundColor: '#e2e8f0' };
                      };

                      return (
                        <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/60 shadow-sm">
                          {isColorAttr && (
                            <div 
                              className="w-7 h-7 rounded-full border border-slate-350 shadow-inner flex-shrink-0 transition-all duration-200"
                              style={getPreviewStyle()}
                              title="Màu xem trước"
                            />
                          )}

                          <input
                            type="text"
                            required
                            placeholder={isColorAttr ? "Tên màu (Đen, Đỏ...)" : "Giá trị (8GB, S...)"}
                            value={opt.name}
                            onChange={(e) => {
                              const newList = [...attributeOptions];
                              newList[idx].name = e.target.value;
                              setAttributeOptions(newList);
                            }}
                            className="flex-1 min-w-[80px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none"
                          />

                          {isColorAttr && (
                            <input
                              type="text"
                              placeholder="Mã màu (#ff0000, red...)"
                              value={opt.hex || ""}
                              onChange={(e) => {
                                const newList = [...attributeOptions];
                                newList[idx].hex = e.target.value;
                                setAttributeOptions(newList);
                              }}
                              className={`w-32 bg-slate-50 focus:bg-white border focus:ring-1 rounded-lg px-2 py-1 text-xs font-mono outline-none transition-colors ${
                                isInvalid 
                                  ? "border-rose-550 focus:border-rose-600 focus:ring-rose-500/20" 
                                  : "border-slate-200 focus:border-emerald-600 focus:ring-emerald-500"
                              }`}
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setAttributeOptions(attributeOptions.filter((_, i) => i !== idx));
                            }}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Icon name="close" className="text-sm" />
                          </button>
                        </div>
                      );
                    })}

                    {attributeOptions.length === 0 && (
                      <p className="text-[11px] text-slate-450 italic text-center py-2">Chưa thêm giá trị nào.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAttributeOptions([...attributeOptions, { name: "", hex: "", image: "" }])}
                    className="w-full py-1.5 border border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 text-slate-500 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Icon name="add" className="text-sm" /> Thêm giá trị lựa chọn
                  </button>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAttributeModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-extrabold text-slate-500 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                >
                  Tạo thuộc tính
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
