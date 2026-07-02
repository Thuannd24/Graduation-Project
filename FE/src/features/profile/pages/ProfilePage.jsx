import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { formatVnd } from "../../../utils/format.js";
import keycloak from "../../../services/keycloak.js";
import { orderApi } from "../../../services/orderApi";
import { authApi } from "../../../services/authApi";

const defaultAvatar =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD79xXNOGSw680ZnmFoOr1Dy_SKGF_l02zJLxZZKU1yIZZ0XXuoAI8EJ35l9EI_NLBz_9QJrDdAsEhoX8cJO5u-MnRglpZLEKi4dIRY6CLav92GAkIR4MIgBQu7FklRpruD-BLGpy9KSshBB2tca62rHg-dDiHBevjyQESC8KrI4sgR3re5rjnFSulz_w0Z8_Hy8wyX4Y4R6REXHZ6okF12RRsarQbbK7gDat-8ipJnuQrdhISQFBGRRkDRATBXhRshAIzycAvxymM";

const emptyAddressForm = {
  recipientName: "",
  phoneNumber: "",
  province: "",
  districtWard: "",
  detailAddress: "",
  isDefault: false
};

function normalizeProfile(data) {
  return {
    id: data?.id || data?.userId || "",
    username: data?.username || keycloak.tokenParsed?.preferred_username || "",
    name: data?.fullName || data?.name || keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || "Khách hàng",
    email: data?.email || keycloak.tokenParsed?.email || "",
    phone: data?.phoneNumber || data?.phone || "",
    tier: data?.customerTier || data?.tier || data?.role || "S-MEMBER",
    avatarUrl: data?.avatarUrl || defaultAvatar
  };
}
function normalizeDefaultAddressList(addresses) {
  let hasDefault = false;
  return addresses.map((address) => {
    if (!address?.isDefault) return address;
    if (hasDefault) {
      return {
        ...address,
        isDefault: false
      };
    }
    hasDefault = true;
    return address;
  });
}

function normalizeAddresses(data) {
  const addresses = Array.isArray(data)
    ? data
    : Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.items)
        ? data.items
        : [];

  return normalizeDefaultAddressList(addresses);
}

function getStatusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "PENDING":
      return "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40";
    case "AWAITING_PAYMENT":
      return "bg-blue-50 text-blue-600 dark:bg-blue-955/20 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/40";
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-750 dark:bg-emerald-955/20 dark:text-emerald-400 border-emerald-250/60 dark:border-emerald-900/40";
    case "SHIPPED":
      return "bg-indigo-50 text-indigo-755 dark:bg-indigo-955/20 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-900/40";
    case "DELIVERED":
    case "COMPLETED":
      return "bg-teal-50 text-teal-700 dark:bg-teal-955/20 dark:text-teal-400 border-teal-200/60 dark:border-teal-900/40";
    case "CANCELLED":
      return "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40";
    default:
      return "bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200/60 dark:border-slate-850/40";
  }
}

function getStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "PENDING":
      return "Chờ xác nhận";
    case "AWAITING_PAYMENT":
      return "Chờ thanh toán";
    case "CONFIRMED":
      return "Đã xác nhận";
    case "SHIPPED":
      return "Đang giao hàng";
    case "DELIVERED":
    case "COMPLETED":
      return "Đã giao hàng";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return s || "Đang xử lý";
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [userProfile, setUserProfile] = useState(() => normalizeProfile({}));
  const [profileForm, setProfileForm] = useState({ fullName: "", phoneNumber: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const getCancelTimeLeft = (createdAt) => {
    if (!createdAt) return 0;
    const limitMs = 2 * 60 * 60 * 1000;
    const elapsedMs = new Date().getTime() - new Date(createdAt).getTime();
    return Math.max(0, limitMs - elapsedMs);
  };

  const isOrderCancelable = (ord) => {
    if (!ord) return false;
    const status = String(ord.status || "").toUpperCase();
    if (!["PENDING", "AWAITING_PAYMENT", "CONFIRMED"].includes(status)) {
      return false;
    }
    const timeLeft = getCancelTimeLeft(ord.createdAt);
    return timeLeft > 0;
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy đơn hàng này không?")) return;
    try {
      await orderApi.cancelOrder(orderId);
      alert("Hủy đơn hàng thành công!");
      const data = await orderApi.listOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      alert("Lỗi khi hủy đơn hàng: " + err.message);
    }
  };
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const totalSpent = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.finalAmount || order.totalAmount || 0), 0),
    [orders]
  );

  useEffect(() => {
    if (!keycloak.authenticated) {
      keycloak.login({
        redirectUri: window.location.origin + "/profile"
      });
      return;
    }

    authApi.me()
      .then((data) => {
        const profile = normalizeProfile(data);
        setUserProfile(profile);
        setProfileForm({
          fullName: profile.name,
          phoneNumber: profile.phone
        });
      })
      .catch((err) => {
        console.error("Failed to load user profile from service", err);
      });

    setLoadingOrders(true);
    orderApi.listOrders()
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load orders", err);
      })
      .finally(() => {
        setLoadingOrders(false);
      });

    setLoadingProvinces(true);
    authApi.getProvinces()
      .then((data) => {
        setProvinces(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load provinces", err);
        setAddressError(err instanceof Error ? err.message : "Không thể tải danh sách tỉnh/thành phố.");
      })
      .finally(() => {
        setLoadingProvinces(false);
      });

    setLoadingAddresses(true);
    authApi.getAddresses()
      .then((data) => {
        setAddresses(normalizeAddresses(data));
      })
      .catch((err) => {
        console.error("Failed to load addresses", err);
        setAddressError(err instanceof Error ? err.message : "Không thể tải sổ địa chỉ.");
      })
      .finally(() => {
        setLoadingAddresses(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedProvinceCode) {
      setWards([]);
      setSelectedWardCode("");
      setAddressForm((current) => ({
        ...current,
        province: "",
        districtWard: ""
      }));
      return;
    }

    const province = provinces.find((item) => String(item.code) === String(selectedProvinceCode));
    setAddressForm((current) => ({
      ...current,
      province: province?.name || "",
      districtWard: ""
    }));
    setSelectedWardCode("");
    setLoadingWards(true);

    authApi.getWards(selectedProvinceCode)
      .then((data) => {
        setWards(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("Failed to load wards", err);
        setAddressError(err instanceof Error ? err.message : "Không thể tải danh sách phường/xã.");
      })
      .finally(() => {
        setLoadingWards(false);
      });
  }, [selectedProvinceCode, provinces]);

  useEffect(() => {
    if (!selectedWardCode) {
      setAddressForm((current) => ({
        ...current,
        districtWard: ""
      }));
      return;
    }

    const ward = wards.find((item) => String(item.code) === String(selectedWardCode));
    setAddressForm((current) => ({
      ...current,
      districtWard: ward?.name || ""
    }));
  }, [selectedWardCode, wards]);

  const handleLogout = (e) => {
    e.preventDefault();
    keycloak.logout({
      redirectUri: window.location.origin + "/"
    });
  };

  const navItems = [
    { id: "overview", label: "Tổng quan", icon: "home" },
    { id: "orders", label: "Lịch sử mua hàng", icon: "receipt_long" },
    { id: "addresses", label: "Sổ địa chỉ", icon: "location_on" },
    { id: "warranty", label: "Tra cứu bảo hành", icon: "verified_user" },
    { id: "membership", label: "Hạng thành viên và ưu đãi", icon: "workspace_premium" },
    { id: "business", label: "Ưu đãi và đơn hàng S-Business", icon: "business_center" },
    { id: "account", label: "Thông tin tài khoản", icon: "manage_accounts" },
    { id: "policy", label: "Chính sách bảo hành", icon: "policy" },
    { id: "feedback", label: "Góp ý - Phản hồi - Hỗ trợ", icon: "chat" },
    { id: "terms", label: "Điều khoản sử dụng", icon: "description" }
  ];

  const handleNavClick = (itemId) => {
    if (itemId === "warranty" || itemId === "policy") {
      navigate("/warranty");
      return;
    }
    setActiveTab(itemId);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");
    setSavingProfile(true);

    try {
      const data = await authApi.updateProfile({
        fullName: profileForm.fullName.trim(),
        phoneNumber: profileForm.phoneNumber.trim()
      });
      const profile = normalizeProfile(data);
      setUserProfile(profile);
      setProfileForm({
        fullName: profile.name,
        phoneNumber: profile.phone
      });
      setProfileMessage("Cập nhật hồ sơ thành công.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddressChange = (field, value) => {
    setAddressForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleAddressSubmit = async (e) => {
    e.preventDefault();
    setAddressError("");
    setSavingAddress(true);

    try {
      const created = await authApi.addAddress({
        ...addressForm,
        recipientName: addressForm.recipientName.trim(),
        phoneNumber: addressForm.phoneNumber.trim(),
        province: addressForm.province.trim(),
        districtWard: addressForm.districtWard.trim(),
        detailAddress: addressForm.detailAddress.trim()
      });
      setAddresses((current) => {
        const nextAddresses = created?.isDefault
          ? [created, ...current.map((address) => ({ ...address, isDefault: false }))]
          : [created, ...current];

        return normalizeDefaultAddressList(nextAddresses);
      });
      setAddressForm(emptyAddressForm);
      setSelectedProvinceCode("");
      setSelectedWardCode("");
      setWards([]);
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Không thể thêm địa chỉ.");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId) => {
    if (!addressId) return;
    setAddressError("");

    try {
      await authApi.deleteAddress(addressId);
      setAddresses((current) => normalizeDefaultAddressList(current.filter((address) => address.id !== addressId)));
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Không thể xóa địa chỉ.");
    }
  };

  return (
    <div className="bg-surface-container-low text-on-background font-body-lg min-h-screen py-md px-md lg:px-lg">
      <main className="w-full max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-12 gap-md">
        <aside className="md:col-span-3">
          <div className="bg-surface-container-lowest rounded-lg shadow-sm flex flex-col w-full py-md overflow-hidden">
            <nav className="flex flex-col">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center px-lg py-3 font-body-sm text-body-sm transition-colors border-t border-surface-container-highest first:border-t-0 ${
                    activeTab === item.id
                      ? "text-primary font-bold bg-surface-container-low"
                      : "text-on-surface hover:bg-surface-container-low"
                  }`}
                  type="button"
                >
                  <Icon className="mr-3 text-[20px]" name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
              <a
                href="/"
                onClick={handleLogout}
                className="flex items-center px-lg py-3 text-on-surface font-body-sm text-body-sm hover:bg-surface-container-low transition-colors border-t border-surface-container-highest"
              >
                <Icon className="mr-3 text-[20px]" name="logout" />
                <span>Đăng xuất</span>
              </a>
            </nav>
          </div>
        </aside>

        <section className="md:col-span-9 space-y-md">
          <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md flex flex-col md:flex-row items-center justify-between gap-md">
            <div className="flex items-center gap-md">
              <div className="w-[80px] h-[80px] rounded-full overflow-hidden bg-surface-container-high border-2 border-surface-container-lowest shrink-0">
                <img alt="Ảnh đại diện" className="w-full h-full object-cover" src={userProfile.avatarUrl} />
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{userProfile.name}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                  {userProfile.phone || "Chưa cập nhật SĐT"}
                  <button
                    className="text-primary hover:opacity-85 inline-flex items-center"
                    onClick={() => setActiveTab("account")}
                    title="Chỉnh sửa số điện thoại"
                    type="button"
                  >
                    <Icon className="text-[16px] align-middle" name="edit" />
                  </button>
                </p>
                <div className="inline-block bg-surface-container-low text-on-surface font-label-caps text-[10px] px-2 py-1 rounded-sm mt-1">
                  {userProfile.tier}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-md border-l-0 md:border-l border-surface-container-highest pl-0 md:pl-md">
              <div className="flex items-center gap-sm">
                <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                  <Icon name="shopping_cart" />
                </div>
                <div>
                  <p className="font-headline-md text-[20px] font-bold text-on-surface">{orders.length}</p>
                  <p className="font-body-sm text-[12px] text-secondary">Tổng số đơn hàng đã mua</p>
                </div>
              </div>
              <div className="flex items-center gap-sm border-l-0 md:border-l border-surface-container-highest pl-0 md:pl-md">
                <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                  <Icon name="receipt" />
                </div>
                <div>
                  <p className="font-headline-md text-[20px] font-bold text-on-surface">{formatVnd(totalSpent)}</p>
                  <p className="font-body-sm text-[12px] text-secondary">Tổng tiền chi tiêu tích lũy</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-lg shadow-sm p-sm flex overflow-x-auto hide-scrollbar gap-sm">
            {[
              { id: "overview", label: "Tổng quan", icon: "workspace_premium" },
              { id: "orders", label: "Lịch sử mua hàng", icon: "receipt_long" },
              { id: "addresses", label: "Sổ địa chỉ", icon: "location_on" },
              { id: "account", label: "Thông tin tài khoản", icon: "manage_accounts" }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 border border-surface-container-highest rounded-full whitespace-nowrap hover:bg-surface-container-low transition-colors text-left ${
                  activeTab === item.id ? "bg-surface-container-low text-primary font-bold" : "bg-surface-container-lowest text-on-surface"
                }`}
                type="button"
              >
                <Icon className="text-[18px] text-secondary" name={item.icon} />
                <span className="font-body-sm text-body-sm">{item.label}</span>
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md flex flex-col min-h-[250px]">
                <h3 className="font-headline-md text-[16px] font-bold text-on-surface mb-auto">Đơn hàng gần đây</h3>

                {loadingOrders ? (
                  <p className="text-center py-lg text-secondary">Đang tải...</p>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 py-lg">
                    <Icon className="text-[56px] text-secondary opacity-40 mb-3" name="receipt_long" />
                    <p className="font-body-sm text-[13px] text-secondary text-center">
                      Bạn chưa có đơn hàng nào gần đây.{" "}
                      <Link className="text-primary hover:underline font-semibold" to="/">
                        Mua sắm ngay
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 py-xs divide-y divide-surface-container-highest">
                    {orders.slice(0, 3).map((order) => (
                      <div key={order.id} className="py-2 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-primary">#{order.id}</span>
                          <span className="text-secondary ml-xs">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString("vi-VN") : ""}
                          </span>
                        </div>
                        <span className="font-bold">{formatVnd(Number(order.finalAmount || order.totalAmount || 0))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md flex flex-col min-h-[250px]">
                <h3 className="font-headline-md text-[16px] font-bold text-on-surface mb-auto">Thông tin hồ sơ</h3>
                <div className="flex flex-col justify-center flex-1 gap-sm text-sm">
                  <div className="flex justify-between gap-md">
                    <span className="text-secondary">Email</span>
                    <span className="font-semibold text-on-surface text-right">{userProfile.email || "Chưa có"}</span>
                  </div>
                  <div className="flex justify-between gap-md">
                    <span className="text-secondary">Số điện thoại</span>
                    <span className="font-semibold text-on-surface text-right">{userProfile.phone || "Chưa cập nhật"}</span>
                  </div>
                  <div className="flex justify-between gap-md">
                    <span className="text-secondary">Địa chỉ</span>
                    <span className="font-semibold text-on-surface text-right">{addresses.length} địa chỉ</span>
                  </div>
                  <button
                    onClick={() => setActiveTab("account")}
                    className="mt-sm bg-primary text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm w-fit"
                    type="button"
                  >
                    CẬP NHẬT HỒ SƠ
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="bg-surface-container-lowest rounded-lg shadow-sm p-md space-y-md border border-surface-container-highest">
              <div className="border-b border-surface-container-highest pb-xs mb-sm flex justify-between items-center">
                <h3 className="font-bold text-headline-md text-on-surface">Lịch sử đơn hàng của bạn</h3>
                <Icon className="text-primary text-[24px]" name="receipt_long" />
              </div>

              {loadingOrders ? (
                <p className="text-center py-lg text-secondary">Đang tải lịch sử đơn hàng...</p>
              ) : orders.length === 0 ? (
                <div className="text-center py-lg space-y-sm">
                  <Icon className="text-[48px] text-secondary opacity-40 animate-pulse" name="receipt_long" />
                  <p className="text-secondary text-sm">Bạn chưa có đơn hàng nào.</p>
                  <Link to="/" className="inline-block bg-primary text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm">
                    MUA SẮM NGAY
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-surface-container-highest">
                  {orders.map((order) => {
                    const productNames = (order.items || []).map((item) => item.productName).join(", ");
                    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Đang xử lý";
                    return (
                      <div key={order.id} className="py-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-md">
                        <div>
                          <h4 className="font-bold text-body-sm text-primary">Mã đơn hàng: #{order.id}</h4>
                          <p className="text-xs text-secondary mt-1">Ngày đặt: {dateStr}</p>
                          <p className="text-xs text-on-surface mt-1">Sản phẩm: {productNames || "Không rõ sản phẩm"}</p>
                        </div>
                        <div className="flex sm:flex-col items-end gap-sm sm:gap-xs text-right">
                          <span className="font-black text-body-sm text-on-surface">
                            {formatVnd(Number(order.finalAmount || order.totalAmount || 0))}
                          </span>
                          <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded-full border shrink-0 ${getStatusBadgeClass(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                          <div className="flex gap-2 items-center mt-1 justify-end">
                            <Link to={`/order/${order.id}`} className="text-primary hover:underline text-xs font-semibold">
                              Xem chi tiết
                            </Link>
                            {isOrderCancelable(order) && (
                              <button
                                onClick={() => handleCancelOrder(order.id)}
                                className="text-rose-600 hover:underline text-xs font-semibold border-l border-slate-200 pl-2"
                                type="button"
                              >
                                Hủy đơn
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "account" && (
            <form onSubmit={handleProfileSubmit} className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-md space-y-md">
              <div className="border-b border-surface-container-highest pb-xs">
                <h3 className="font-bold text-headline-md text-on-surface">Thông tin tài khoản</h3>
                <p className="text-xs text-secondary mt-1">Bạn chỉ có thể cập nhật họ tên và số điện thoại. Email, username và hạng thành viên được đồng bộ từ hệ thống.</p>
              </div>

              {profileMessage && <p className="text-sm text-green-600 font-semibold">{profileMessage}</p>}
              {profileError && <p className="text-sm text-primary font-semibold">{profileError}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md text-sm">
                <label className="space-y-1">
                  <strong className="text-secondary block">Họ tên</strong>
                  <input
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm((current) => ({ ...current, fullName: e.target.value }))}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Số điện thoại</strong>
                  <input
                    value={profileForm.phoneNumber}
                    onChange={(e) => setProfileForm((current) => ({ ...current, phoneNumber: e.target.value }))}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Nhập số điện thoại"
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Email</strong>
                  <input
                    value={userProfile.email}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-low px-3 py-2 text-secondary"
                    disabled
                    readOnly
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Username</strong>
                  <input
                    value={userProfile.username}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-low px-3 py-2 text-secondary"
                    disabled
                    readOnly
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Hạng thành viên</strong>
                  <input
                    value={userProfile.tier}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-low px-3 py-2 text-secondary"
                    disabled
                    readOnly
                  />
                </label>
              </div>

              <button
                className="bg-primary hover:bg-primary/95 text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-60"
                disabled={savingProfile}
                type="submit"
              >
                {savingProfile ? "ĐANG LƯU..." : "LƯU THAY ĐỔI"}
              </button>
            </form>
          )}

          {activeTab === "addresses" && (
            <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-md space-y-md">
              <div className="border-b border-surface-container-highest pb-xs flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-headline-md text-on-surface">Sổ địa chỉ</h3>
                  <p className="text-xs text-secondary mt-1">Thêm địa chỉ giao hàng để dùng khi thanh toán.</p>
                </div>
                <Icon className="text-primary text-[24px]" name="location_on" />
              </div>

              {addressError && <p className="text-sm text-primary font-semibold">{addressError}</p>}

              <form onSubmit={handleAddressSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-md text-sm">
                <label className="space-y-1">
                  <strong className="text-secondary block">Người nhận</strong>
                  <input
                    value={addressForm.recipientName}
                    onChange={(e) => handleAddressChange("recipientName", e.target.value)}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Số điện thoại</strong>
                  <input
                    value={addressForm.phoneNumber}
                    onChange={(e) => handleAddressChange("phoneNumber", e.target.value)}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Tỉnh/Thành phố</strong>
                  <select
                    value={selectedProvinceCode}
                    onChange={(e) => setSelectedProvinceCode(e.target.value)}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={loadingProvinces}
                    required
                  >
                    <option value="">{loadingProvinces ? "Đang tải tỉnh/thành phố..." : "Chọn tỉnh/thành phố"}</option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code}>{province.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <strong className="text-secondary block">Quận/Huyện, Phường/Xã</strong>
                  <select
                    value={selectedWardCode}
                    onChange={(e) => setSelectedWardCode(e.target.value)}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-surface-container-low disabled:text-secondary"
                    disabled={!selectedProvinceCode || loadingWards}
                    required
                  >
                    <option value="">
                      {!selectedProvinceCode ? "Chọn tỉnh/thành phố trước" : loadingWards ? "Đang tải phường/xã..." : "Chọn quận/huyện, phường/xã"}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.code} value={ward.code}>{ward.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <strong className="text-secondary block">Địa chỉ chi tiết</strong>
                  <input
                    value={addressForm.detailAddress}
                    onChange={(e) => handleAddressChange("detailAddress", e.target.value)}
                    className="w-full rounded-md border border-surface-container-highest bg-surface-container-lowest px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </label>
                <label className="flex items-center gap-2 text-on-surface sm:col-span-2">
                  <input
                    checked={addressForm.isDefault}
                    onChange={(e) => handleAddressChange("isDefault", e.target.checked)}
                    type="checkbox"
                  />
                  Đặt làm địa chỉ mặc định
                </label>
                <div className="sm:col-span-2">
                  <button
                    className="bg-primary hover:bg-primary/95 text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-60"
                    disabled={savingAddress}
                    type="submit"
                  >
                    {savingAddress ? "ĐANG THÊM..." : "THÊM ĐỊA CHỈ"}
                  </button>
                </div>
              </form>

              <div className="divide-y divide-surface-container-highest">
                {loadingAddresses ? (
                  <p className="text-center py-lg text-secondary">Đang tải sổ địa chỉ...</p>
                ) : addresses.length === 0 ? (
                  <p className="text-center py-lg text-secondary text-sm">Bạn chưa có địa chỉ nào.</p>
                ) : (
                  addresses.map((address) => (
                    <div key={address.id || `${address.recipientName}-${address.phoneNumber}-${address.detailAddress}`} className="py-md flex flex-col sm:flex-row gap-md justify-between">
                      <div>
                        <div className="flex items-center gap-sm">
                          <h4 className="font-bold text-on-surface">{address.recipientName}</h4>
                          {address.isDefault && (
                            <span className="bg-primary-fixed text-primary font-bold text-[10px] px-2 py-0.5 rounded-full">Mặc định</span>
                          )}
                        </div>
                        <p className="text-xs text-secondary mt-1">{address.phoneNumber}</p>
                        <p className="text-sm text-on-surface mt-1">
                          {[address.detailAddress, address.districtWard, address.province].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      {address.id && (
                        <button
                          onClick={() => handleDeleteAddress(address.id)}
                          className="text-primary hover:underline text-xs font-semibold self-start"
                          type="button"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab !== "overview" && activeTab !== "orders" && activeTab !== "account" && activeTab !== "addresses" && (
            <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-xl text-center flex flex-col items-center justify-center space-y-sm">
              <Icon className="text-[48px] text-secondary opacity-40 animate-pulse" name="construction" />
              <h3 className="font-bold text-body-lg text-on-surface">Tính năng đang cập nhật</h3>
              <p className="font-body-sm text-secondary max-w-sm">
                Tính năng liên quan đến phần này đang được nâng cấp hệ thống. Vui lòng quay lại sau!
              </p>
              <button
                onClick={() => setActiveTab("overview")}
                className="bg-primary hover:bg-primary/95 text-on-primary font-bold px-lg py-2 rounded-lg text-xs transition-colors shadow-sm"
                type="button"
              >
                QUAY LẠI TỔNG QUAN
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


