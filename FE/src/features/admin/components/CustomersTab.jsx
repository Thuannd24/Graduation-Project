import React, { useState, useEffect, useMemo, useCallback } from "react";
import Icon from "../../../components/common/Icon.jsx";
import Pagination from "../../../components/common/Pagination.jsx";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { authApi } from "../../../services/authApi.ts";

const TIERS = ["MEMBER", "SILVER", "GOLD", "VIP"];
const TIER_COLORS = { MEMBER: "#94a3b8", SILVER: "#a8a29e", GOLD: "#f59e0b", VIP: "#8b5cf6" };
const ALL_ROLES = ["ROLE_CUSTOMER", "ROLE_STAFF", "ROLE_ADMIN"];

export default function CustomersTab({ orders = [] }) {
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerCurrentPage, setCustomerCurrentPage] = useState(1);
  const [filterTier, setFilterTier] = useState("");
  const [filterBlacklisted, setFilterBlacklisted] = useState("");
  const itemsPerPage = 8;

  const [backendUsers, setBackendUsers] = useState([]);
  const [backendTotalPages, setBackendTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserRoles, setSelectedUserRoles] = useState([]);
  const [allRoles, setAllRoles] = useState([]);

  // Stats from API
  const [userStats, setUserStats] = useState(null);

  // Form states
  const [addForm, setAddForm] = useState({ username: "", email: "", fullName: "", password: "", phoneNumber: "", customerTier: "MEMBER" });
  const [editForm, setEditForm] = useState({ fullName: "", email: "", phoneNumber: "", customerTier: "" });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });

  // Dữ liệu báo cáo khách hàng từ đơn hàng thực tế
  const customerReportData = useMemo(() => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    return dayNames.map((name, i) => {
      const dayOffset = (today.getDay() - i + 7) % 7;
      const dayStart = new Date(today);
      dayStart.setDate(today.getDate() - dayOffset);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const count = orders.filter(o => {
        if (!o.createdAt) return false;
        const d = new Date(o.createdAt);
        return d >= dayStart && d <= dayEnd;
      }).length;
      return { name, value: count > 0 ? count * 1000 : 0 };
    }).reverse();
  }, [orders]);

  // Lấy user stats
  const fetchUserStats = async () => {
    try {
      const result = await authApi.adminGetUserStats();
      setUserStats(result);
    } catch (err) {
      console.warn("Cannot fetch user stats:", err);
    }
  };

  const fetchUsers = useCallback(async (search, tier, blacklisted) => {
    try {
      setLoading(true);
      const params = { page: customerCurrentPage - 1, size: itemsPerPage, active: true };
      if (search) params.search = search;
      if (tier) params.tier = tier;
      if (blacklisted === "true" || blacklisted === "false") params.blacklisted = blacklisted === "true";
      
      const result = await authApi.adminSearchUsers(params);
      const formatted = result.content.map(user => ({
        id: user.id || user.userId,
        name: user.fullName || user.username || "Khách hàng",
        email: user.email || "—",
        phone: user.phoneNumber || "—",
        address: user.address || "Việt Nam",
        orderCount: user.orderCount || 0,
        totalSpend: user.totalSpend || "0",
        status: user.blacklisted ? "Blocked" : "Active",
        customerTier: user.customerTier || "MEMBER",
        regDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString("vi-VN") : "—",
        lastPurchase: "—",
        totalOrder: 0,
        completed: 0,
        canceled: 0,
        avatar: user.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120",
        blacklisted: !!user.blacklisted,
        active: user.active !== false
      }));
      formatted.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      setBackendUsers(formatted);
      setBackendTotalPages(result.totalPages || 1);
      
      if (!selectedCustomer && formatted.length > 0) {
        setSelectedCustomer(formatted[0]);
      }
    } catch (err) {
      console.warn("Failed to load users:", err);
      setBackendUsers([]);
    } finally {
      setLoading(false);
    }
  }, [customerCurrentPage, itemsPerPage, selectedCustomer]);

  const fetchAllRoles = async () => {
    try {
      const roles = await authApi.adminGetAllRoles();
      setAllRoles(roles);
    } catch (err) {
      setAllRoles(ALL_ROLES.map(r => ({ id: r, name: r })));
    }
  };

  useEffect(() => {
    fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
    fetchUserStats();
  }, [customerCurrentPage]);

  useEffect(() => {
    fetchAllRoles();
  }, []);

  // Bộ lọc
  const filteredCustomers = backendUsers;
  const totalPages = backendTotalPages || 1;

  // ────────────────────────────────────────────────────────
  // HANDLERS
  // ────────────────────────────────────────────────────────

  const handleSearch = () => {
    setCustomerCurrentPage(1);
    fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
  };

  const handleCopyEmail = (email) => {
    navigator.clipboard.writeText(email);
    alert("Đã sao chép email: " + email);
  };

  const handleToggleBlacklist = async (customer) => {
    const isLocking = !customer.blacklisted;
    if (!window.confirm(`Bạn có chắc chắn muốn ${isLocking ? "KHÓA" : "MỞ KHÓA"} tài khoản của ${customer.name}?`)) return;
    try {
      await authApi.adminToggleBlacklist(customer.id, isLocking);
      alert(`${isLocking ? "Khóa" : "Mở khóa"} tài khoản thành công!`);
      fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
      setSelectedCustomer(prev => prev && prev.id === customer.id ? { ...prev, blacklisted: isLocking, status: isLocking ? "Blocked" : "Active" } : prev);
      fetchUserStats();
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA tài khoản "${name}"? Hành động này không thể hoàn tác!`)) return;
    try {
      await authApi.adminDeleteUser(id);
      alert("Đã xóa người dùng thành công!");
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
      fetchUserStats();
    } catch (err) {
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  // Add User
  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await authApi.adminCreateUser(addForm);
      alert("Tạo người dùng thành công!");
      setShowAddModal(false);
      setAddForm({ username: "", email: "", fullName: "", password: "", phoneNumber: "", customerTier: "MEMBER" });
      fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
      fetchUserStats();
    } catch (err) {
      alert("Lỗi tạo user: " + err.message);
    }
  };

  // Edit User
  const handleOpenEdit = (customer) => {
    setEditForm({ 
      fullName: customer.name, 
      email: customer.email, 
      phoneNumber: customer.phone, 
      customerTier: customer.customerTier || "MEMBER" 
    });
    setShowEditModal(true);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await authApi.adminUpdateUser(selectedCustomer.id, editForm);
      alert("Cập nhật người dùng thành công!");
      setShowEditModal(false);
      fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
      fetchUserStats();
    } catch (err) {
      alert("Lỗi cập nhật: " + err.message);
    }
  };

  // Tier
  const handleUpdateTier = async (userId, tier) => {
    try {
      await authApi.adminUpdateTier(userId, tier);
      alert(`Đã cập nhật hạng thành viên thành ${tier}!`);
      fetchUsers(customerSearchQuery, filterTier, filterBlacklisted);
      setSelectedCustomer(prev => prev && prev.id === userId ? { ...prev, customerTier: tier } : prev);
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Roles
  const handleOpenRoles = async (customer) => {
    try {
      const roles = await authApi.adminGetUserRoles(customer.id);
      setSelectedUserRoles(roles);
      setShowRoleModal(true);
    } catch (err) {
      setSelectedUserRoles(["ROLE_CUSTOMER"]);
      setShowRoleModal(true);
    }
  };

  const handleSaveRoles = async () => {
    if (!selectedCustomer) return;
    try {
      await authApi.adminSetUserRoles(selectedCustomer.id, selectedUserRoles);
      alert("Cập nhật phân quyền thành công!");
      setShowRoleModal(false);
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  const toggleRole = (role) => {
    setSelectedUserRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("Mật khẩu xác nhận không khớp!");
      return;
    }
    if (!selectedCustomer) return;
    try {
      await authApi.adminResetPassword(selectedCustomer.id, passwordForm.newPassword);
      alert("Đặt lại mật khẩu thành công!");
      setShowPasswordModal(false);
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  // Pie chart data for tier distribution
  const tierPieData = useMemo(() => {
    if (!userStats?.tierDistribution) return [];
    return Object.entries(userStats.tierDistribution)
      .filter(([_, count]) => count > 0)
      .map(([name, value]) => ({ name, value, color: TIER_COLORS[name] || "#94a3b8" }));
  }, [userStats]);

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng số người dùng</h4>
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{(userStats?.totalUsers || backendUsers.length).toLocaleString()}</span>
              </div>
              <button className="p-1 rounded hover:bg-slate-50 text-slate-400">
                <Icon name="group" className="text-sm" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Mới trong tuần</span>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                +{userStats?.newUsersThisWeek || 0}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đang hoạt động</h4>
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight block mt-1">{((userStats?.totalUsers || 0) - (userStats?.blacklistedUsers || 0)).toLocaleString()}</span>
              </div>
              <button className="p-1 rounded hover:bg-slate-50 text-slate-400">
                <Icon name="check_circle" className="text-sm" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span>Bị khóa</span>
              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">
                {userStats?.blacklistedUsers || 0}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm relative flex flex-col justify-between hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân bố hạng</h4>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {TIERS.map(tier => (
                <div key={tier} className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-500">{tier}</span>
                  <span className="font-extrabold text-slate-800">{userStats?.tierDistribution?.[tier] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Biểu đồ */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng quan hoạt động</h4>
              <h3 className="text-lg font-extrabold text-slate-800 mt-1">Biểu đồ tương tác khách hàng</h3>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-lg font-extrabold text-slate-800 block">{userStats?.totalUsers || 0}</span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Tổng user</span>
            </div>
            <div>
              <span className="text-lg font-extrabold text-slate-800 block">{userStats?.newUsersThisWeek || 0}</span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Tuần này</span>
            </div>
            <div>
              <span className="text-lg font-extrabold text-slate-800 block">{userStats?.newUsersThisMonth || 0}</span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Tháng này</span>
            </div>
            <div>
              <span className="text-lg font-extrabold text-emerald-600 block">{userStats?.totalUsers ? ((userStats.totalUsers - userStats.blacklistedUsers) / userStats.totalUsers * 100).toFixed(1) : 0}%</span>
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Hoạt động</span>
            </div>
          </div>

          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={customerReportData}>
                <defs>
                  <linearGradient id="colorCustomer" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px", fontWeight: "700" }} labelStyle={{ color: "#94a3b8", fontWeight: "800" }} />
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCustomer)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`transition-all duration-300 ${selectedCustomer ? "lg:col-span-8" : "lg:col-span-12"} bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col justify-between`}>
          <div>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white flex-wrap gap-3">
              <h4 className="font-extrabold text-sm text-slate-800">Quản Lý Người Dùng</h4>
              
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Tier */}
                <select
                  value={filterTier}
                  onChange={(e) => { setFilterTier(e.target.value); setCustomerCurrentPage(1); }}
                  className="bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600"
                >
                  <option value="">Tất cả hạng</option>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {/* Filter Blacklist */}
                <select
                  value={filterBlacklisted}
                  onChange={(e) => { setFilterBlacklisted(e.target.value); setCustomerCurrentPage(1); }}
                  className="bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-600"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="false">Đang hoạt động</option>
                  <option value="true">Bị khóa</option>
                </select>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Tìm tên, email, SĐT..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="bg-slate-50 border border-slate-200/80 focus:ring-1 focus:ring-emerald-500 focus:bg-white rounded-lg px-3 py-1.5 pl-8 text-xs font-semibold text-slate-700 placeholder-slate-400 w-44 transition-all"
                  />
                  <Icon name="search" className="absolute left-2.5 top-2 text-slate-400 text-sm" />
                </div>

                <button
                  onClick={() => { setShowAddModal(true); }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm flex items-center gap-1"
                >
                  <Icon name="add" className="text-xs" />
                  <span>Thêm User</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 text-slate-400 border-b border-slate-100">
                    <th className="p-4 font-bold text-[10px] uppercase">Tên</th>
                    <th className="p-4 font-bold text-[10px] uppercase">Email</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-28">Điện thoại</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-20 text-center">Hạng</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-24">Trạng thái</th>
                    <th className="p-4 font-bold text-[10px] uppercase w-36 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCustomer(c)}
                      className={`hover:bg-slate-50/40 cursor-pointer transition-all ${selectedCustomer?.id === c.id ? "bg-slate-50/70" : ""}`}
                    >
                      <td className="p-4 font-extrabold text-slate-700">{c.name}</td>
                      <td className="p-4 text-slate-500 font-semibold">{c.email}</td>
                      <td className="p-4 text-slate-500 font-semibold">{c.phone}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold`} style={{ color: TIER_COLORS[c.customerTier] || "#94a3b8", backgroundColor: (TIER_COLORS[c.customerTier] || "#94a3b8") + "20" }}>
                          {c.customerTier}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                          c.blacklisted ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.blacklisted ? "bg-rose-500" : "bg-emerald-500"}`}></span>
                          {c.blacklisted ? "Đã khóa" : "Hoạt động"}
                        </span>
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <button onClick={() => { setSelectedCustomer(c); handleOpenEdit(c); }} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600" title="Sửa">
                            <Icon name="edit" className="text-sm" />
                          </button>
                          <button onClick={() => handleOpenRoles(c)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-purple-600" title="Phân quyền">
                            <Icon name="manage_accounts" className="text-sm" />
                          </button>
                          <button onClick={() => handleToggleBlacklist(c)} className={`p-1 hover:bg-slate-100 rounded ${c.blacklisted ? "text-emerald-400 hover:text-emerald-600" : "text-slate-400 hover:text-rose-600"}`} title={c.blacklisted ? "Mở khóa" : "Khóa"}>
                            <Icon name={c.blacklisted ? "lock_open" : "lock"} className="text-sm" />
                          </button>
                          <button onClick={() => handleDeleteUser(c.id, c.name)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600" title="Xóa">
                            <Icon name="delete" className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold text-xs">Không có người dùng nào</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white">
            <Pagination currentPage={customerCurrentPage} totalPages={totalPages} onPageChange={setCustomerCurrentPage} />
          </div>
        </div>

        {/* Detail Panel */}
        {selectedCustomer && (
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 flex flex-col justify-between space-y-5 animate-slideLeft">
            <div className="flex justify-between items-start">
              <span className="font-extrabold text-xs text-slate-400 uppercase tracking-widest">Chi Tiết Người Dùng</span>
              <button onClick={() => setSelectedCustomer(null)} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"><Icon name="close" className="text-lg" /></button>
            </div>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-20 h-20 rounded-full border border-slate-200 p-1 bg-slate-50">
                <img src={selectedCustomer.avatar} alt={selectedCustomer.name} className="w-full h-full object-cover rounded-full" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">{selectedCustomer.name}</h3>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 font-semibold mt-0.5">
                  <span>{selectedCustomer.email}</span>
                  <button onClick={() => handleCopyEmail(selectedCustomer.email)} className="p-0.5 hover:bg-slate-50 text-slate-400 hover:text-emerald-600 rounded transition-colors"><Icon name="content_copy" className="text-[11px]" /></button>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-600 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100/70 text-slate-800">
                <Icon name="phone" className="text-slate-400 text-sm" />
                <span>{selectedCustomer.phone}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100/70 text-slate-800">
                <Icon name="location_on" className="text-slate-400 text-sm" />
                <span>{selectedCustomer.address || "Việt Nam"}</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100/70 text-slate-800">
                <Icon name="stars" className="text-slate-400 text-sm" />
                <span>Hạng: <strong>{selectedCustomer.customerTier || "MEMBER"}</strong></span>
              </div>
            </div>

            {/* Tier selector */}
            <div className="border-t border-slate-100 pt-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider mb-2">Thay đổi hạng</span>
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map(tier => (
                  <button
                    key={tier}
                    onClick={() => handleUpdateTier(selectedCustomer.id, tier)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all ${
                      selectedCustomer.customerTier === tier
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <button onClick={() => handleOpenEdit(selectedCustomer)} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                <Icon name="edit" className="text-sm" /> Chỉnh sửa thông tin
              </button>
              <button onClick={() => handleOpenRoles(selectedCustomer)} className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                <Icon name="manage_accounts" className="text-sm" /> Phân quyền
              </button>
              <button onClick={() => setShowPasswordModal(true)} className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5">
                <Icon name="key" className="text-sm" /> Đặt lại mật khẩu
              </button>
              <button onClick={() => handleToggleBlacklist(selectedCustomer)} className={`w-full py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 ${selectedCustomer.blacklisted ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}`}>
                <Icon name={selectedCustomer.blacklisted ? "lock_open" : "lock"} className="text-sm" />
                {selectedCustomer.blacklisted ? "Mở khóa tài khoản" : "Khóa tài khoản"}
              </button>
              <button onClick={() => handleDeleteUser(selectedCustomer.id, selectedCustomer.name)} className="w-full py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5">
                <Icon name="delete" className="text-sm" /> Xóa tài khoản
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── ADD USER MODAL ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-sm text-slate-800">Thêm Người Dùng Mới</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><Icon name="close" className="text-lg" /></button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tên đăng nhập *</label>
                <input type="text" required value={addForm.username} onChange={e => setAddForm({...addForm, username: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="username" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email *</label>
                <input type="email" required value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="email@example.com" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Họ và tên *</label>
                <input type="text" required value={addForm.fullName} onChange={e => setAddForm({...addForm, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mật khẩu *</label>
                <input type="password" required value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="••••••••" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Số điện thoại</label>
                <input type="text" value={addForm.phoneNumber} onChange={e => setAddForm({...addForm, phoneNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="+84912345678" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Hạng thành viên</label>
                <select value={addForm.customerTier} onChange={e => setAddForm({...addForm, customerTier: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold">
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all">Tạo người dùng</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── EDIT USER MODAL ─── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-sm text-slate-800">Chỉnh sửa thông tin</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600"><Icon name="close" className="text-lg" /></button>
            </div>
            <form onSubmit={handleEditUser} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Họ và tên</label>
                <input type="text" value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Số điện thoại</label>
                <input type="text" value={editForm.phoneNumber} onChange={e => setEditForm({...editForm, phoneNumber: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Hạng thành viên</label>
                <select value={editForm.customerTier} onChange={e => setEditForm({...editForm, customerTier: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold">
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all">Lưu thay đổi</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ROLE MODAL ─── */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowRoleModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-sm text-slate-800">Phân Quyền Người Dùng</h3>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600"><Icon name="close" className="text-lg" /></button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mb-4">
              {selectedCustomer?.name} — Chọn vai trò cho người dùng này
            </p>
            <div className="space-y-2">
              {ALL_ROLES.map(role => (
                <label key={role} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedUserRoles.includes(role) ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    checked={selectedUserRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-extrabold text-xs text-slate-800 block">{role}</span>
                    <span className="text-[9px] text-slate-400">
                      {role === "ROLE_ADMIN" ? "Toàn quyền hệ thống" : role === "ROLE_STAFF" ? "Nhân viên vận hành" : "Khách hàng mua sắm"}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleSaveRoles} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all">Lưu phân quyền</button>
              <button onClick={() => setShowRoleModal(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PASSWORD MODAL ─── */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-sm text-slate-800">Đặt Lại Mật Khẩu</h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-600"><Icon name="close" className="text-lg" /></button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mb-4">Tạo mật khẩu mới cho {selectedCustomer?.name}</p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mật khẩu mới *</label>
                <input type="password" required value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="••••••••" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Xác nhận mật khẩu *</label>
                <input type="password" required value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold" placeholder="••••••••" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all">Đặt lại mật khẩu</button>
                <button type="button" onClick={() => setShowPasswordModal(false)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
