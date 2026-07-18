import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { authApi } from "../../../services/authApi.ts";
import keycloak from "../../../services/keycloak.js";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150";

export default function AdminRoleTab() {
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    avatarUrl: DEFAULT_AVATAR,
    customerTier: "",
    roles: []
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isEditable, setIsEditable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setLoadError("");
      const user = await authApi.me();
      setProfile({
        fullName: user.fullName || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        avatarUrl: user.avatarUrl || DEFAULT_AVATAR,
        customerTier: user.customerTier || "",
        roles: keycloak.tokenParsed?.realm_access?.roles || []
      });
    } catch (err) {
      console.error("Không thể tải thông tin admin:", err);
      setLoadError(err.message || "Không thể tải thông tin tài khoản.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(profile.email);
    alert("Đã sao chép email: " + profile.email);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await authApi.updateProfile({
        fullName: profile.fullName,
        phoneNumber: profile.phoneNumber
      });
      setIsEditable(false);
      alert("Cập nhật thông tin tài khoản thành công!");
    } catch (err) {
      alert("Lỗi cập nhật thông tin: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingAvatar(true);
      const updated = await authApi.uploadAvatar(file);
      setProfile((prev) => ({ ...prev, avatarUrl: updated.avatarUrl || prev.avatarUrl }));
      alert("Đã cập nhật ảnh đại diện!");
    } catch (err) {
      alert("Lỗi tải ảnh đại diện: " + err.message);
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const goToKeycloakAccount = () => {
    const url = keycloak.createAccountUrl
      ? keycloak.createAccountUrl()
      : null;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      alert("Không thể mở trang quản lý tài khoản Keycloak.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-400">Đang tải thông tin tài khoản...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6">

      {/* Tiêu đề */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800">Cấu Hình Tài Khoản Quản Trị</h4>
          <span className="text-[10px] text-slate-400 font-medium">Thông tin tài khoản thật từ hệ thống — cập nhật họ tên, số điện thoại và ảnh đại diện</span>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center justify-between">
          <span>Lỗi tải thông tin: {loadError}</span>
          <button type="button" onClick={fetchProfile} className="font-bold underline">Thử lại</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* CỘT TRÁI: Thẻ Avatar + Bảo mật (4 cột) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Thẻ Avatar hồ sơ */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col items-center text-center space-y-4">
            <span className="font-bold text-slate-400 text-[10px] uppercase block tracking-wider self-start">Hồ Sơ Tài Khoản</span>

            <div className="w-24 h-24 rounded-full border border-slate-200 p-1 bg-slate-50 relative">
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover rounded-full"
              />
              <span className="absolute bottom-1 right-1 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-white"></span>
            </div>

            <div>
              <h3 className="font-extrabold text-slate-800 text-base">{profile.fullName || "Chưa đặt tên"}</h3>
              <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 font-semibold mt-0.5">
                <span>{profile.email}</span>
                <button
                  onClick={handleCopyEmail}
                  className="p-0.5 hover:bg-slate-50 text-slate-400 hover:text-emerald-650 rounded transition-colors"
                >
                  <Icon name="content_copy" className="text-[11px]" />
                </button>
              </div>
              {profile.roles.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {profile.roles
                    .filter((r) => r.startsWith("ROLE_") || ["ADMIN", "STAFF", "CUSTOMER"].includes(r))
                    .map((r) => (
                      <span key={r} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {r.replace("ROLE_", "")}
                      </span>
                    ))}
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleAvatarFileChange}
              className="hidden"
              disabled={uploadingAvatar}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon name={uploadingAvatar ? "hourglass_empty" : "upload_file"} className={`text-sm ${uploadingAvatar ? "animate-spin" : ""}`} />
              {uploadingAvatar ? "Đang tải lên..." : "Đổi ảnh đại diện"}
            </button>
          </div>

          {/* Bảo mật tài khoản */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <span className="font-extrabold text-xs text-slate-850 uppercase tracking-widest block">Bảo mật tài khoản</span>
            <p className="text-xs text-slate-500 leading-relaxed">
              Mật khẩu và phương thức đăng nhập được quản lý tập trung qua Keycloak. Nhấn nút dưới để mở trang quản lý tài khoản Keycloak và đổi mật khẩu an toàn.
            </p>
            <button
              type="button"
              onClick={goToKeycloakAccount}
              className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              <Icon name="lock" className="text-sm" />
              Đổi mật khẩu trên Keycloak
            </button>
          </div>
        </div>

        {/* CỘT PHẢI: Form Cập nhật hồ sơ (8 cột) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between space-y-6">

          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <span className="font-extrabold text-xs text-slate-850 uppercase tracking-widest">Cập nhật hồ sơ</span>
            <button
              type="button"
              onClick={() => setIsEditable(!isEditable)}
              className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1 transition-colors"
            >
              <Icon name="edit" className="text-sm" />
              <span>{isEditable ? "Xem hồ sơ" : "Chỉnh sửa"}</span>
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Họ và tên</label>
              <input
                type="text"
                disabled={!isEditable}
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">E-mail (Keycloak)</label>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500"
                />
                <span className="text-[9px] text-slate-400">Email do Keycloak quản lý, không thể sửa tại đây.</span>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Số điện thoại</label>
                <input
                  type="text"
                  disabled={!isEditable}
                  value={profile.phoneNumber}
                  onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                  placeholder="0912345678"
                  className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-75"
                />
              </div>
            </div>

            {isEditable && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
                >
                  {saving ? "Đang lưu..." : "Lưu Thông Tin"}
                </button>
              </div>
            )}
          </form>

        </div>

      </div>

    </div>
  );
}
