import React, { useState, useEffect } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { authApi } from "../../../services/authApi.ts";

export default function AdminRoleTab() {
  const [profile, setProfile] = useState({
    firstName: "Admin",
    lastName: "User",
    email: "",
    phone: "",
    dob: "",
    location: "",
    creditCard: "",
    bio: "",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const user = await authApi.me();
        setProfile(prev => ({
          ...prev,
          firstName: user.fullName?.split(" ").slice(0, -1).join(" ") || user.name || user.username || "Admin",
          lastName: user.fullName?.split(" ").slice(-1)[0] || "",
          email: user.email || "",
          avatar: user.avatarUrl || prev.avatar,
        }));
      } catch (err) {
        console.warn("Không thể tải thông tin admin:", err);
      }
    };
    fetchProfile();
  }, []);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [isEditable, setIsEditable] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(profile.email);
    alert("Đã sao chép email quản trị: " + profile.email);
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    setIsEditable(false);
    alert("Cập nhật thông tin tài khoản admin thành công!");
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("Mật khẩu xác nhận không khớp!");
      return;
    }
    alert("Đổi mật khẩu tài khoản quản trị thành công!");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };

  return (
    <div className="space-y-6 animate-fadeIn p-6">
      
      {/* Tiêu đề */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800">Cấu Hình Tài Khoản Quản Trị</h4>
          <span className="text-[10px] text-slate-400 font-medium">Thiết lập thông tin cá nhân, cập nhật mật khẩu bảo mật và liên kết thanh toán</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CỘT TRÁI: Thẻ Avatar + Thay đổi mật khẩu (4 cột) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Thẻ Avatar hồ sơ */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col items-center text-center space-y-4">
            <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider self-start">Hồ Sơ Admin</span>
            
            <div className="w-24 h-24 rounded-full border border-slate-200 p-1 bg-slate-50 relative">
              <img
                src={profile.avatar}
                alt="Admin Avatar"
                className="w-full h-full object-cover rounded-full"
              />
              <span className="absolute bottom-1 right-1 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-white"></span>
            </div>

            <div>
              <h3 className="font-extrabold text-slate-800 text-base">{profile.firstName} {profile.lastName}</h3>
              <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 font-semibold mt-0.5">
                <span>{profile.email}</span>
                <button
                  onClick={handleCopyEmail}
                  className="p-0.5 hover:bg-slate-50 text-slate-400 hover:text-emerald-650 rounded transition-colors"
                >
                  <Icon name="content_copy" className="text-[11px]" />
                </button>
              </div>
            </div>

            {/* Mạng xã hội */}
            <div className="space-y-2 w-full border-t border-slate-100 pt-4 text-left">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Mạng xã hội liên kết</span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-650">
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-600">G</span> Google
                  </span>
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Đã liên kết</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-650">
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-700">f</span> Facebook
                  </span>
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Đã liên kết</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-650">
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-805">X</span> Twitter
                  </span>
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Đã liên kết</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => alert("Chức năng thêm liên kết mạng xã hội đang được triển khai.")}
                className="w-full mt-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Icon name="add" className="text-xs" />
                <span>Liên kết mạng xã hội</span>
              </button>
            </div>
          </div>

          {/* Đổi mật khẩu */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-xs text-slate-850 uppercase tracking-widest">Đổi mật khẩu</span>
              <button className="text-slate-400 hover:text-slate-600">
                <Icon name="help_outline" className="text-sm" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Xác nhận mật khẩu</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm mt-3"
              >
                Lưu Thay Đổi
              </button>
            </form>
          </div>
        </div>

        {/* CỘT PHẢI: Form Cập nhật hồ sơ (8 cột) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between space-y-6">
          
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <span className="font-extrabold text-xs text-slate-850 uppercase tracking-widest">Cập nhật hồ sơ</span>
            <button
              onClick={() => setIsEditable(!isEditable)}
              className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 transition-colors"
            >
              <Icon name="edit" className="text-sm" />
              <span>{isEditable ? "Xem hồ sơ" : "Chỉnh sửa"}</span>
            </button>
          </div>

          {/* Thay ảnh đại diện */}
          <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <div className="w-16 h-16 rounded-full border border-slate-200 p-0.5 bg-white">
              <img src={profile.avatar} alt={profile.firstName} className="w-full h-full object-cover rounded-full" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const url = prompt("Nhập link avatar mới của bạn:", profile.avatar);
                  if (url) setProfile({ ...profile, avatar: url });
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                Tải ảnh mới
              </button>
              <button
                onClick={() => setProfile({ ...profile, avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120" })}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-650 rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                Xóa ảnh
              </button>
            </div>
          </div>

          {/* Form cập nhật thông tin */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tên hiển thị</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Họ của bạn</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mật khẩu tài khoản</label>
                <input
                  type="password"
                  disabled
                  value="••••••••••••"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Số điện thoại</label>
                <div className="relative">
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 pl-10 disabled:opacity-75"
                  />
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    🇺🇸
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">E-mail liên hệ</label>
                <input
                  type="email"
                  disabled={!isEditable}
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ngày sinh</label>
                <input
                  type="date"
                  disabled={!isEditable}
                  value={profile.dob}
                  onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Địa chỉ cơ quan</label>
              <input
                type="text"
                disabled={!isEditable}
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-850 disabled:opacity-75"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Thẻ nhận doanh thu (Credit Card)</label>
              <div className="relative">
                <input
                  type="text"
                  disabled={!isEditable}
                  value={profile.creditCard}
                  onChange={(e) => setProfile({ ...profile, creditCard: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-850 pl-10 disabled:opacity-75"
                />
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                  🔴🟡
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tiểu sử cá nhân</label>
              <textarea
                rows="4"
                disabled={!isEditable}
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-850 disabled:opacity-75 leading-relaxed"
              />
            </div>

            {isEditable && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
                >
                  Lưu Thông Tin
                </button>
              </div>
            )}
          </form>

        </div>

      </div>

    </div>
  );
}
