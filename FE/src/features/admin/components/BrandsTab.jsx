import React, { useState, useEffect } from "react";
import Icon from "../../../components/common/Icon.jsx";
import Pagination from "../../../components/common/Pagination.jsx";
import { productApi } from "../../../services/productApi.ts";

export default function BrandsTab() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [categories, setCategories] = useState([]);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);

  const [brandForm, setBrandForm] = useState({
    name: "",
    origin: "",
    logo: "",
    status: "Active",
    categoryIds: []
  });

  // Tải danh sách thương hiệu thực tế từ Backend
  const fetchBrands = async () => {
    try {
      setLoading(true);
      const data = await productApi.listAllBrandsForAdmin();
      // Chuyển đổi định dạng nếu cần
      const formatted = data.map(b => ({
        id: b.id,
        name: b.name,
        origin: b.description || "N/A", // Bản chất description lưu thông tin mô tả/xuất xứ
        status: b.active ? "Active" : "Inactive",
        logo: b.logoUrl || "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=100",
        categoryIds: b.categoryIds || []
      }));
      formatted.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      setBrands(formatted);
    } catch (err) {
      console.error("Failed to load brands:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await productApi.listCategories();
      const flat = [];
      const traverse = (nodes, level = 0) => {
        nodes.forEach(node => {
          flat.push({
            id: node.id,
            name: node.name,
            level: level,
            label: "—".repeat(level) + " " + node.name
          });
          if (node.children && node.children.length > 0) {
            traverse(node.children, level + 1);
          }
        });
      };
      traverse(data);
      setCategories(flat);
    } catch (err) {
      console.error("Failed to load categories in brand tab:", err);
    }
  };

  useEffect(() => {
    fetchBrands();
    fetchCategories();
  }, []);

  const handleToggleStatus = async (id) => {
    const brand = brands.find(b => b.id === id);
    if (!brand) return;
    try {
      const active = brand.status !== "Active";
      await productApi.updateBrand(id, {
        name: brand.name,
        description: brand.origin,
        logoUrl: brand.logo,
        active: active,
        categoryIds: brand.categoryIds || []
      });
      fetchBrands();
    } catch (err) {
      alert("Lỗi cập nhật trạng thái: " + err.message);
    }
  };

  const handleSaveBrand = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: brandForm.name,
        slug: brandForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: brandForm.origin,
        logoUrl: brandForm.logo,
        active: brandForm.status === "Active",
        categoryIds: brandForm.categoryIds || []
      };

      if (editingBrandId) {
        await productApi.updateBrand(editingBrandId, payload);
        alert("Cập nhật thương hiệu thành công!");
      } else {
        await productApi.createBrand(payload);
        alert("Thêm thương hiệu mới thành công!");
      }
      setShowBrandModal(false);
      setBrandForm({ name: "", origin: "", logo: "", status: "Active", categoryIds: [] });
      setEditingBrandId(null);
      fetchBrands();
    } catch (err) {
      alert("Lỗi lưu thương hiệu: " + err.message);
    }
  };

  const handleDeleteBrand = async (id) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa thương hiệu này?")) return;
    try {
      await productApi.deleteBrand(id);
      alert("Đã xóa thương hiệu thành công!");
      fetchBrands();
    } catch (err) {
      alert("Lỗi khi xóa thương hiệu: " + err.message);
    }
  };

  // Quốc gia xuất xứ xuất hiện nhiều nhất trong danh sách thương hiệu (mode, không phải alphabet)
  const topOrigin = (() => {
    const counts = {};
    brands.forEach(b => {
      const origin = (b.origin || "").trim();
      if (!origin || origin === "N/A") return;
      counts[origin] = (counts[origin] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || "—";
  })();

  // Lọc
  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.origin.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages = Math.ceil(filteredBrands.length / itemsPerPage) || 1;
  const paginatedBrands = filteredBrands.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-400">Đang tải danh sách thương hiệu...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      
      {/* Tiêu đề */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800">Quản Lý Thương Hiệu (Brand Hub)</h4>
          <span className="text-[10px] text-slate-400 font-medium">Quản lý các thương hiệu đối tác và quốc gia xuất xứ</span>
        </div>
        <button
          onClick={() => {
            setEditingBrandId(null);
            setBrandForm({ name: "", origin: "", logo: "", status: "Active", categoryIds: [] });
            setShowBrandModal(true);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
        >
          <Icon name="add" className="text-sm" />
          <span>Thêm Thương Hiệu Mới</span>
        </button>
      </div>

      {/* Grid 2 thẻ chỉ số thương hiệu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng số thương hiệu</h4>
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight block mt-1">{brands.length} thương hiệu</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400">
              <Icon name="bookmark" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Hoạt động</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg">
              {brands.filter(b => b.status === "Active").length} thương hiệu
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quốc gia xuất xứ phổ biến nhất</h4>
              <span className="text-2xl font-extrabold text-slate-800 tracking-tight block mt-1">{topOrigin}</span>
            </div>
            <div className="p-1 rounded bg-slate-50 border border-slate-100 text-slate-400">
              <Icon name="public" className="text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Tổng số đối tác</span>
            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-lg">
              {brands.length} hãng
            </span>
          </div>
        </div>
      </div>

      {/* Danh sách các thương hiệu dạng Card nổi bật */}
      <div className="space-y-2">
        <span className="font-bold text-slate-450 text-[10px] uppercase block tracking-wider">Logo thương hiệu đối tác</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {brands.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-slate-200/60 p-4 flex flex-col items-center justify-center space-y-2 text-center hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-full border border-slate-100 overflow-hidden flex items-center justify-center p-1 bg-slate-50">
                <img src={b.logo || "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=100"} alt={b.name} className="w-full h-full object-contain rounded-full" />
              </div>
              <div>
                <span className="font-extrabold text-xs text-slate-800 block">{b.name}</span>
                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{b.origin}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bảng quản lý và chỉnh sửa thương hiệu */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between">
        
        {/* Search */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <span className="font-extrabold text-xs text-slate-800">Danh Sách Đối Tác Thương Hiệu</span>
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm thương hiệu..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="bg-slate-55 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-700 placeholder-slate-400 w-52 transition-all"
            />
            <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-slate-400 border-b border-slate-100">
                <th className="p-4 font-bold text-[10px] uppercase w-12 text-center">STT</th>
                <th className="p-4 font-bold text-[10px] uppercase w-20">Logo</th>
                <th className="p-4 font-bold text-[10px] uppercase">Thương hiệu</th>
                <th className="p-4 font-bold text-[10px] uppercase w-48">Quốc gia xuất xứ</th>
                <th className="p-4 font-bold text-[10px] uppercase w-28 text-center">Trạng thái</th>
                <th className="p-4 font-bold text-[10px] uppercase w-24 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedBrands.map((b, idx) => (
                <tr key={b.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="p-4 text-center font-semibold text-slate-400">
                    {(currentPage - 1) * itemsPerPage + idx + 1}
                  </td>
                  <td className="p-4">
                    <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 p-0.5 flex items-center justify-center">
                      <img src={b.logo || "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=100"} alt={b.name} className="w-full h-full object-contain rounded-full" />
                    </div>
                  </td>
                  <td className="p-4 font-extrabold text-slate-750">{b.name}</td>
                  <td className="p-4 text-slate-500 font-semibold">{b.origin}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggleStatus(b.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        b.status === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${b.status === "Active" ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                      {b.status === "Active" ? "Đang chạy" : "Tạm dừng"}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingBrandId(b.id);
                          setBrandForm({
                            name: b.name,
                            origin: b.origin,
                            logo: b.logo || "",
                            status: b.status,
                            categoryIds: b.categoryIds || []
                          });
                          setShowBrandModal(true);
                        }}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-600"
                        title="Sửa thương hiệu"
                      >
                        <Icon name="edit" className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleDeleteBrand(b.id)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600"
                        title="Xóa thương hiệu"
                      >
                        <Icon name="delete" className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>

      </div>

      {/* Modal Thêm/Sửa thương hiệu */}
      {showBrandModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden animate-zoomIn">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <span className="font-extrabold text-sm text-slate-800">
                {editingBrandId ? "Cập Nhật Thương Hiệu" : "Thêm Thương Hiệu Mới"}
              </span>
              <button
                onClick={() => setShowBrandModal(false)}
                className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600"
              >
                <Icon name="close" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Tên thương hiệu *</label>
                <input
                  type="text"
                  required
                  value={brandForm.name}
                  onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                  placeholder="Apple, Samsung, Nike..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Quốc gia xuất xứ *</label>
                <input
                  type="text"
                  required
                  value={brandForm.origin}
                  onChange={(e) => setBrandForm({ ...brandForm, origin: e.target.value })}
                  placeholder="Hoa Kỳ (USA), Việt Nam..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Ảnh Logo thương hiệu</label>
                {brandForm.logo ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={brandForm.logo}
                      alt="Logo preview"
                      className="w-12 h-12 object-contain bg-white rounded border p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-slate-400 font-semibold truncate block">{brandForm.logo}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBrandForm({ ...brandForm, logo: "" })}
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
                          setUploadingBrandLogo(true);
                          const url = await productApi.uploadProductImage(file, "brands");
                          setBrandForm({ ...brandForm, logo: url });
                        } catch (err) {
                          alert("Lỗi tải ảnh: " + err.message);
                        } finally {
                          setUploadingBrandLogo(false);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      disabled={uploadingBrandLogo}
                    />
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Icon name={uploadingBrandLogo ? "hourglass_empty" : "upload_file"} className={`text-xl ${uploadingBrandLogo ? "animate-spin text-emerald-600" : "text-slate-400"}`} />
                      <span className="text-xs font-bold text-slate-600">
                        {uploadingBrandLogo ? "Đang tải logo..." : "Nhấp hoặc kéo thả ảnh logo để tải lên"}
                      </span>
                      <span className="text-[10px] text-slate-400">Định dạng JPG, PNG, WebP (Tải lên MinIO)</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Danh mục áp dụng (Chọn nhiều) *</label>
                <div className="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto bg-slate-50 space-y-1.5">
                  {categories.map((cat) => (
                    <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={brandForm.categoryIds?.includes(cat.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBrandForm(prev => {
                            const currentIds = prev.categoryIds || [];
                            const newIds = checked
                              ? [...currentIds, cat.id]
                              : currentIds.filter(id => id !== cat.id);
                            return { ...prev, categoryIds: newIds };
                          });
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                  {categories.length === 0 && (
                    <span className="text-[11px] text-slate-400 italic">Không tìm thấy danh mục nào.</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Trạng thái đối tác</label>
                <select
                  value={brandForm.status}
                  onChange={(e) => setBrandForm({ ...brandForm, status: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-850 outline-none"
                >
                  <option value="Active">Đang chạy (Active)</option>
                  <option value="Inactive">Tạm dừng (Inactive)</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBrandModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-extrabold text-slate-500 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                >
                  {editingBrandId ? "Cập Nhật" : "Thêm mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
