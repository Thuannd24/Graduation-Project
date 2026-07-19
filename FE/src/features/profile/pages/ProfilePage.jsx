import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import { formatVnd } from "../../../utils/format.js";
import keycloak from "../../../services/keycloak.js";
import { orderApi } from "../../../services/orderApi";
import { authApi } from "../../../services/authApi";
import { productApi } from "../../../services/productApi";
import ProductReviewsTab from "../components/ProductReviewsTab.jsx";
import VouchersTab from "../components/VouchersTab.jsx";
import WarrantyTab from "../components/WarrantyTab.jsx";

const defaultAvatar =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD79xXNOGSw680ZnmFoOr1Dy_SKGF_l02zJLxZZKU1yIZZ0XXuoAI8EJ35l9EI_NLBz_9QJrDdAsEhoX8cJO5u-MnRglpZLEKi4dIRY6CLav92GAkIR4MIgBQu7FklRpruD-BLGpy9KSshBB2tca62rHg-dDiHBevjyQESC8KrI4sgR3re5rjnFSulz_w0Z8_Hy8wyX4Y4R6REXHZ6okF12RRsarQbbK7gDat-8ipJnuQrdhISQFBGRRkDRATBXhRshAIzycAvxymM";

const TIER_CARD_STYLES = {
  SILVER: {
    bgGradient: "linear-gradient(135deg, #cbd5e1 0%, #64748b 50%, #334155 100%)",
    textColor: "text-white",
    badgeBg: "bg-slate-300 text-slate-800",
    multiplier: "x1.2 Point Multiplier",
    shadow: "shadow-[0_10px_25px_-5px_rgba(148,163,184,0.3)]",
    border: "border-slate-300/40",
    cardName: "SILVER MEMBERSHIP",
    glowText: "text-slate-100",
    accentColor: "rgba(226,232,240,0.2)"
  },
  GOLD: {
    bgGradient: "linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #78350f 100%)",
    textColor: "text-white",
    badgeBg: "bg-amber-400 text-amber-950",
    multiplier: "x1.5 Point Multiplier",
    shadow: "shadow-[0_10px_30px_-5px_rgba(245,158,11,0.4)]",
    border: "border-amber-400/40",
    cardName: "GOLD MEMBERSHIP",
    glowText: "text-amber-200",
    accentColor: "rgba(253,230,138,0.2)"
  },
  VIP: {
    bgGradient: "linear-gradient(135deg, #a78bfa 0%, #6d28d9 60%, #1e1b4b 100%)",
    textColor: "text-white",
    badgeBg: "bg-purple-400 text-purple-950",
    multiplier: "x2.0 Point Multiplier",
    shadow: "shadow-[0_10px_35px_-5px_rgba(139,92,246,0.5)]",
    border: "border-purple-400/40",
    cardName: "VIP PLATINUM",
    glowText: "text-purple-200",
    accentColor: "rgba(233,213,255,0.2)"
  },
  MEMBER: {
    bgGradient: "linear-gradient(135deg, #64748b 0%, #334155 60%, #0f172a 100%)",
    textColor: "text-white",
    badgeBg: "bg-slate-500 text-slate-100",
    multiplier: "x1.0 Point Multiplier",
    shadow: "shadow-md",
    border: "border-slate-500/35",
    cardName: "STANDARD MEMBER",
    glowText: "text-slate-300",
    accentColor: "rgba(241,245,249,0.1)"
  }
};

const getTierBadgeClass = (tier = "MEMBER") => {
  switch (tier.toUpperCase()) {
    case "SILVER": return "bg-slate-200 text-slate-800 border border-slate-300";
    case "GOLD": return "bg-amber-100 text-amber-800 border border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
    case "VIP": return "bg-purple-100 text-purple-800 border border-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]";
    default: return "bg-slate-100 text-slate-600 border border-slate-200";
  }
};

const getTierHeaderTheme = (tier = "MEMBER") => {
  switch (tier.toUpperCase()) {
    case "SILVER":
      return {
        cardBg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)",
        borderColor: "border-slate-300",
        shadow: "shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        nameColor: "text-slate-800",
        subColor: "text-slate-600",
        iconBg: "bg-slate-200/70 text-slate-700 border border-slate-300/30",
        dividerColor: "border-slate-300/70",
        statTitle: "text-slate-500",
        statValue: "text-slate-800",
        editIconColor: "text-slate-500"
      };
    case "GOLD":
      return {
        cardBg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 45%, #fde68a 100%)",
        borderColor: "border-amber-300/50",
        shadow: "shadow-[0_8px_30px_rgba(245,158,11,0.08)]",
        nameColor: "text-amber-950",
        subColor: "text-amber-800/80",
        iconBg: "bg-amber-100 text-amber-700 border border-amber-300/40",
        dividerColor: "border-amber-300/50",
        statTitle: "text-amber-800/70",
        statValue: "text-amber-950",
        editIconColor: "text-amber-700"
      };
    case "VIP":
      return {
        cardBg: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 45%, #e9d5ff 100%)",
        borderColor: "border-purple-300/50",
        shadow: "shadow-[0_8px_30px_rgba(139,92,246,0.08)]",
        nameColor: "text-purple-950",
        subColor: "text-purple-800/80",
        iconBg: "bg-purple-100 text-purple-700 border border-purple-300/40",
        dividerColor: "border-purple-300/50",
        statTitle: "text-purple-800/70",
        statValue: "text-purple-950",
        editIconColor: "text-purple-700"
      };
    default:
      return {
        cardBg: "linear-gradient(135deg, #ffffff 0%, #fbfbfb 100%)",
        borderColor: "border-surface-container-highest",
        shadow: "shadow-[0_8px_30px_rgb(0,0,0,0.03)]",
        nameColor: "text-on-surface",
        subColor: "text-on-surface-variant",
        iconBg: "bg-surface-container-high text-on-surface-variant",
        dividerColor: "border-surface-container-highest",
        statTitle: "text-secondary",
        statValue: "text-on-surface",
        editIconColor: "text-primary"
      };
  }
};

const emptyAddressForm = {
  recipientName: "",
  phoneNumber: "",
  province: "",
  districtWard: "",
  detailAddress: "",
  isDefault: false
};

function normalizeProfile(data) {
  const isPlaceholderEmail = data?.email?.includes("@placeholder.com");
  const isPlaceholderName = data?.fullName === "Keycloak User";
  
  const rawUsername = data?.username || keycloak.tokenParsed?.preferred_username || "";
  const rawPhone = data?.phoneNumber || data?.phone || "";
  
  // Nếu số điện thoại trống nhưng username có định dạng số điện thoại (bắt đầu bằng 0)
  // thì tự động điền SĐT từ username
  const phoneFallback = !rawPhone && rawUsername.match(/^0[0-9]{9,10}$/) ? rawUsername : rawPhone;

  return {
    id: data?.id || data?.userId || "",
    username: rawUsername && !rawUsername.startsWith("user_") ? rawUsername : "",
    name: !isPlaceholderName && data?.fullName
      ? data.fullName : keycloak.tokenParsed?.name || "Khách hàng",
    email: !isPlaceholderEmail && data?.email
      ? data.email : keycloak.tokenParsed?.email || "",
    phone: phoneFallback,
    tier: data?.customerTier || data?.tier || data?.role || "S-MEMBER",
    loyaltyPoints: Number(data?.loyaltyPoints ?? 0),
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

const navSections = [
  {
    title: "Hồ sơ cá nhân",
    items: [
      { id: "overview", label: "Tổng quan tài khoản", icon: "home" },
      { id: "account", label: "Thông tin tài khoản", icon: "manage_accounts" },
      { id: "addresses", label: "Sổ địa chỉ nhận hàng", icon: "location_on" }
    ]
  },
  {
    title: "Giao dịch & Ưu đãi",
    items: [
      { id: "orders", label: "Lịch sử mua hàng", icon: "receipt_long" },
      { id: "vouchers", label: "Kho voucher cá nhân", icon: "confirmation_number" },
      { id: "membership", label: "Điểm thưởng & Hạng thẻ", icon: "workspace_premium" },
      { id: "warranty", label: "Tra cứu bảo hành", icon: "verified_user" }
    ]
  },
  {
    title: "Hỗ trợ & Chính sách",
    items: [
      { id: "reviews", label: "Đánh giá của bạn", icon: "rate_review" },
      { id: "policy", label: "Chính sách bảo hành", icon: "policy" }
    ]
  }
];

function getLoyaltySourceLabel(sourceType) {
  const s = String(sourceType || "").toUpperCase();
  switch (s) {
    case "REDEMPTION":
      return "Đổi điểm";
    case "REFUND":
      return "Hoàn điểm";
    case "ORDER":
      return "Tích từ đơn hàng";
    case "CAMPAIGN":
      return "Chiến dịch";
    case "MANUAL":
      return "Điều chỉnh";
    default:
      return s || "Giao dịch";
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "overview");
  const [userProfile, setUserProfile] = useState(() => normalizeProfile({}));
  const [profileForm, setProfileForm] = useState({ fullName: "", phoneNumber: "" });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const currentTabInfo = useMemo(() => {
    for (const section of navSections) {
      const item = section.items.find((i) => i.id === activeTab);
      if (item) return item;
    }
    // Fallbacks if not in list
    if (activeTab === "overview") return { id: "overview", label: "Tổng quan tài khoản", icon: "home" };
    return { id: activeTab, label: "Tài khoản", icon: "account_circle" };
  }, [activeTab]);

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
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [loyaltyHistory, setLoyaltyHistory] = useState([]);
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);

  const totalSpent = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.finalAmount || order.totalAmount || 0), 0),
    [orders]
  );

  useEffect(() => {
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
      .then(async (data) => {
        const orderList = Array.isArray(data) ? data : [];
        const productIds = new Set();
        orderList.forEach(order => {
          (order.items || []).forEach(item => {
            if (item.productId && !item.productImage) {
              productIds.add(item.productId);
            }
          });
        });

        const productMap = {};
        if (productIds.size > 0) {
          await Promise.all(
            Array.from(productIds).map(async (prodId) => {
              try {
                const prod = await productApi.getProductDetail(prodId);
                productMap[prodId] = prod.imageUrl || prod.image || prod.thumbnailUrl;
              } catch (e) {
                console.warn(`Failed to fetch product details for ${prodId}`, e);
              }
            })
          );
        }

        const updatedOrders = orderList.map(order => {
          if (!order.items) return order;
          const updatedItems = order.items.map(item => {
            if (item.productImage) return item;
            return {
              ...item,
              productImage: productMap[item.productId] || null
            };
          });
          return { ...order, items: updatedItems };
        });

        setOrders(updatedOrders);
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

    setLoadingLoyalty(true);
    authApi.getLoyaltyPoints()
      .then((balance) => setLoyaltyPoints(Number(balance || 0)))
      .catch((err) => console.error("Failed to load loyalty points", err));

    authApi.getLoyaltyHistory(0, 10)
      .then((data) => setLoyaltyHistory(data.content || []))
      .catch((err) => console.error("Failed to load loyalty history", err))
      .finally(() => setLoadingLoyalty(false));
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

  const handleNavClick = (itemId) => {
    setActiveTab(itemId);
    setSearchParams({ tab: itemId });
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

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
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-in {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>
      <main className="w-full max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-12 gap-md">
        <aside className="hidden md:block md:col-span-3">
          <div className="bg-surface-container-lowest rounded-lg shadow-sm flex flex-col w-full py-md overflow-hidden">
            <nav className="flex flex-col gap-xs">
              {navSections.map((section, idx) => (
                <div key={idx} className="flex flex-col mb-sm last:mb-0">
                  {/* Section Title */}
                  <div className="px-lg py-2 text-[10px] font-black uppercase tracking-wider text-secondary opacity-65">
                    {section.title}
                  </div>
                  
                  {/* Section Navigation Items */}
                  <div className="flex flex-col gap-[4px] px-2">
                    {section.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          className={`flex items-center justify-between px-3.5 py-2.5 font-body-sm text-body-sm transition-all duration-200 rounded-xl text-left ${
                            isActive
                              ? "text-primary font-extrabold bg-primary/10 border-l-4 border-primary shadow-[0_2px_8px_rgba(169,0,16,0.06)]"
                              : "text-on-surface border-transparent hover:bg-surface-container-low/60 hover:text-primary"
                          }`}
                          type="button"
                        >
                          <div className="flex items-center min-w-0">
                            <Icon 
                              className={`mr-3 text-[20px] transition-colors ${
                                isActive ? "text-primary" : "text-secondary"
                              }`} 
                              name={item.icon} 
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <Icon name="chevron_right" className={`text-xs transition-transform duration-200 ${isActive ? "text-primary translate-x-0.5" : "text-secondary/40"}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div className="border-t border-surface-container-highest mt-sm pt-sm">
                <a
                  href="/"
                  onClick={handleLogout}
                  className="flex items-center px-lg py-2.5 text-on-surface font-body-sm text-body-sm border-l-4 border-transparent hover:bg-surface-container-low/60 hover:text-primary transition-all duration-150"
                >
                  <Icon className="mr-3 text-[18px] text-secondary" name="logout" />
                  <span>Đăng xuất</span>
                </a>
              </div>
            </nav>
          </div>
        </aside>

        <section className="md:col-span-9 space-y-md">
          {(() => {
            const theme = getTierHeaderTheme(userProfile.tier);
            return (
              <div 
                className={`rounded-xl border p-md flex flex-col lg:flex-row items-center justify-between gap-md transition-all duration-300 ${theme.shadow} ${theme.borderColor}`}
                style={{ background: theme.cardBg }}
              >
                {/* Left side: Avatar & Info */}
                <div className="flex items-center gap-md shrink-0">
                  <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-surface-container-high border-2 border-white shadow-sm shrink-0">
                    <img alt="Ảnh đại diện" className="w-full h-full object-cover" src={userProfile.avatarUrl} />
                  </div>
                  <div>
                    <h2 className={`text-[16px] font-bold leading-tight tracking-tight ${theme.nameColor}`}>
                      {userProfile.name}
                    </h2>
                    <p className={`text-[13px] flex items-center gap-1 mt-0.5 ${theme.subColor}`}>
                      {userProfile.phone || "Chưa cập nhật SĐT"}
                      <button
                        className={`${theme.editIconColor} hover:opacity-75 inline-flex items-center transition-opacity`}
                        onClick={() => setActiveTab("account")}
                        title="Chỉnh sửa số điện thoại"
                        type="button"
                      >
                        <Icon className="text-[14px] align-middle" name="edit" />
                      </button>
                    </p>
                    <div className={`inline-block font-extrabold text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full mt-1.5 shadow-sm ${getTierBadgeClass(userProfile.tier)}`}>
                      {userProfile.tier}
                    </div>
                  </div>
                </div>

                {/* Right side: 3 Stats (Compact & Sleek Grid on Mobile, Flex Row on larger screens) */}
                <div className="grid grid-cols-3 gap-xs w-full sm:flex sm:flex-row sm:gap-md lg:gap-lg sm:w-auto items-center sm:justify-end mt-4 sm:mt-0">
                  {/* Stat 1 */}
                  <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-xs px-1 sm:px-2 py-2 sm:py-1 bg-black/5 dark:bg-white/5 sm:bg-transparent rounded-xl sm:rounded-none">
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${theme.iconBg}`}>
                      <Icon className="text-[16px] sm:text-[18px]" name="shopping_cart" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs sm:text-base font-extrabold leading-tight ${theme.statValue}`}>{orders.length}</p>
                      <p className="text-[9px] sm:text-[11px] text-secondary leading-tight mt-0.5 whitespace-nowrap">Đơn hàng</p>
                    </div>
                  </div>

                  {/* Divider 1 */}
                  <div className={`hidden sm:block h-8 w-[1px] bg-slate-300/40 ${theme.dividerColor}`}></div>

                  {/* Stat 2 */}
                  <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-xs px-1 sm:px-2 py-2 sm:py-1 bg-black/5 dark:bg-white/5 sm:bg-transparent rounded-xl sm:rounded-none">
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${theme.iconBg}`}>
                      <Icon className="text-[16px] sm:text-[18px]" name="receipt" />
                    </div>
                    <div className="min-w-0 w-full">
                      <p className={`text-xs sm:text-base font-extrabold leading-tight truncate ${theme.statValue}`} title={formatVnd(totalSpent)}>{formatVnd(totalSpent)}</p>
                      <p className="text-[9px] sm:text-[11px] text-secondary leading-tight mt-0.5 whitespace-nowrap">Tích lũy</p>
                    </div>
                  </div>

                  {/* Divider 2 */}
                  <div className={`hidden sm:block h-8 w-[1px] bg-slate-300/40 ${theme.dividerColor}`}></div>

                  {/* Stat 3 */}
                  <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-xs px-1 sm:px-2 py-2 sm:py-1 bg-black/5 dark:bg-white/5 sm:bg-transparent rounded-xl sm:rounded-none">
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${theme.iconBg}`}>
                      <Icon className="text-[16px] sm:text-[18px]" name="loyalty" />
                    </div>
                    <div>
                      <p className={`text-xs sm:text-base font-extrabold leading-tight ${theme.statValue}`}>{loyaltyPoints.toLocaleString("vi-VN")}</p>
                      <p className="text-[9px] sm:text-[11px] text-secondary leading-tight mt-0.5 whitespace-nowrap">Điểm thưởng</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mobile Navigation Trigger Button */}
          <div className="md:hidden block w-full">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="w-full flex items-center justify-between bg-surface-container-lowest border border-surface-container-highest rounded-xl p-4 shadow-sm active:bg-surface-container-low transition-colors"
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="text-[18px]" name={currentTabInfo.icon} />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-wider">Danh mục đang chọn</p>
                  <p className="font-extrabold text-sm text-on-surface mt-0.5">{currentTabInfo.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low hover:bg-surface-container-high rounded-full transition-colors text-xs font-bold text-primary">
                <Icon name="menu" className="text-[16px]" />
                <span>Xem tất cả</span>
              </div>
            </button>
          </div>

          {/* Removed horizontal pills list to keep mobile layout clean and focus on drawer navigation */}

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
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.015)] p-5 space-y-4 border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-sm text-slate-850 dark:text-slate-200 uppercase tracking-wider">Lịch sử đơn hàng của bạn</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Quản lý và theo dõi quá trình giao nhận đơn hàng</p>
                </div>
                <Icon className="text-primary text-[20px]" name="receipt_long" />
              </div>

              {loadingOrders ? (
                <div className="flex flex-col items-center py-12">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-slate-500 text-xs mt-3 font-semibold">Đang tải lịch sử đơn hàng...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                    <Icon className="text-xl" name="receipt_long" />
                  </div>
                  <p className="text-slate-500 text-xs font-bold">Bạn chưa có đơn hàng nào.</p>
                  <Link to="/" className="inline-flex bg-primary hover:bg-primary/95 text-white font-extrabold px-4 py-1.5 rounded-xl text-xs transition-colors shadow-sm">
                    MUA SẮM NGAY
                  </Link>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {orders.map((order) => {
                    const items = order.items || [];
                    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("vi-VN") : "Đang xử lý";
                    const firstItem = items[0] || {};
                    const totalQty = items.reduce((sum, it) => sum + (it.quantity || it.qty || 1), 0);
                    
                    return (
                      <div 
                        key={order.id} 
                        className="bg-slate-50/40 dark:bg-slate-900/40 hover:bg-slate-50/75 dark:hover:bg-slate-850/20 border border-slate-150 dark:border-slate-850 rounded-2xl p-4 transition-all duration-300 hover:shadow-sm"
                      >
                        {/* Top Info row */}
                        <div className="flex justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">Đơn hàng #{order.id}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
                              <span className="text-[10px] text-slate-450 dark:text-slate-400 font-semibold">{dateStr}</span>
                            </div>
                          </div>
                          <span className={`font-extrabold text-[9px] px-2.5 py-0.5 rounded-full border shrink-0 ${getStatusBadgeClass(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>

                        {/* Mid Section: Product info + Thumbnails */}
                        <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Thumbnails Row */}
                            <div className="flex -space-x-2 shrink-0">
                              {items.slice(0, 3).map((item, idx) => (
                                <div 
                                  key={item.id || idx}
                                  className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 flex items-center justify-center shadow-sm relative z-[3] hover:z-10 transition-all"
                                  style={{ zIndex: 3 - idx }}
                                >
                                  {item.productImage ? (
                                    <img 
                                      src={item.productImage} 
                                      alt={item.productName} 
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <Icon name="image" className="text-slate-350 text-base" />
                                  )}
                                </div>
                              ))}
                              {items.length > 3 && (
                                <div className="w-12 h-12 rounded-xl bg-slate-150 dark:bg-slate-700 border border-slate-250 dark:border-slate-650 flex items-center justify-center shadow-sm relative z-[0]">
                                  <span className="text-[9px] font-black text-slate-600 dark:text-slate-300">+{items.length - 3}</span>
                                </div>
                              )}
                            </div>

                            {/* Product Name summary */}
                            <div className="min-w-0">
                              <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate leading-snug">
                                {firstItem.productName || "Chi tiết đơn hàng"}
                              </h5>
                              <p className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-0.5">
                                {items.length > 1 ? `và ${items.length - 1} sản phẩm khác` : `Số lượng: ${totalQty}`}
                              </p>
                            </div>
                          </div>

                          {/* Price */}
                          <div className="sm:text-right shrink-0">
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 block font-medium">Tổng tiền thanh toán</span>
                            <strong className="text-sm font-black text-primary block mt-0.5">
                              {formatVnd(Number(order.finalAmount || order.totalAmount || 0))}
                            </strong>
                          </div>
                        </div>

                        {/* Bottom Actions Row */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end gap-2">
                          {isOrderCancelable(order) && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              className="px-3 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-955/15 hover:bg-rose-100/50 dark:hover:bg-rose-955/35 border border-rose-150/40 dark:border-rose-900/30 rounded-xl transition-colors"
                              type="button"
                            >
                              Hủy đơn hàng
                            </button>
                          )}
                          <Link 
                            to={`/order/${order.id}`} 
                            className="px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary bg-slate-150/60 dark:bg-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1 shadow-sm"
                          >
                            Chi tiết <Icon name="chevron_right" className="text-xs" />
                          </Link>
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

          {activeTab === "membership" && (
            <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-md space-y-md">
              <div className="border-b border-surface-container-highest pb-xs flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-headline-md text-on-surface">Điểm thưởng & ưu đãi</h3>
                  <p className="text-xs text-secondary mt-1">1 điểm = 1.000đ khi thanh toán. Tích 10.000đ chi tiêu = 1 điểm.</p>
                </div>
                <Icon className="text-primary text-[24px]" name="loyalty" />
              </div>

              {/* Dynamic Metallic Virtual Membership Card */}
              {(() => {
                const tierKey = (userProfile.tier || "MEMBER").toUpperCase();
                const cardStyle = TIER_CARD_STYLES[tierKey] || TIER_CARD_STYLES.MEMBER;
                return (
                  <div 
                    className={`w-full max-w-[400px] h-[220px] mx-auto rounded-2xl relative overflow-hidden p-6 flex flex-col justify-between ${cardStyle.shadow}`}
                    style={{ 
                      background: cardStyle.bgGradient,
                      border: `1px solid ${cardStyle.border}`
                    }}
                  >
                    {/* Shine / gloss light sweep effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none"></div>

                    {/* Top Row: Brand & Rank Badge */}
                    <div className="flex items-start justify-between z-10">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/80">AuraTech Shop</p>
                        <p className="text-[8px] text-white/50 tracking-wider">MEMBERSHIP CARD</p>
                      </div>
                      <span className={`text-[9px] font-bold tracking-widest px-2.5 py-0.5 rounded-full uppercase ${cardStyle.badgeBg}`}>
                        {cardStyle.cardName}
                      </span>
                    </div>

                    {/* Middle Row: Chip & Contactless logo */}
                    <div className="z-10 flex items-center justify-between">
                      <div className="w-10 h-7 rounded bg-gradient-to-br from-amber-200 to-amber-400 border border-amber-500/30 relative flex flex-wrap p-[2px]">
                        <div className="w-1/2 h-1/2 border-r border-b border-amber-600/20"></div>
                        <div className="w-1/2 h-1/2 border-b border-amber-600/20"></div>
                        <div className="w-1/2 h-1/2 border-r border-amber-600/20"></div>
                        <div className="w-1/2 h-1/2"></div>
                        <div className="absolute inset-x-2 top-1/2 h-[1px] bg-amber-600/30"></div>
                        <div className="absolute inset-y-1 left-1/2 w-[1px] bg-amber-600/30"></div>
                      </div>
                      <Icon className="text-white/40 text-md rotate-90" name="wifi" />
                    </div>

                    {/* Bottom Row: Holder Name & Multiplier */}
                    <div className="flex items-end justify-between z-10">
                      <div>
                        <p className="text-[8px] uppercase text-white/40 tracking-wider font-semibold">Chủ thẻ</p>
                        <p className="text-sm font-bold tracking-wider text-white uppercase">{userProfile.name}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${cardStyle.glowText}`}>
                          {cardStyle.multiplier}
                        </p>
                        <p className="text-[8px] text-white/40">LOYALTY PRIVILEGE</p>
                      </div>
                    </div>

                    {/* Background decorations */}
                    <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/5 blur-xl pointer-events-none"></div>
                    <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none"></div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-3 gap-xs sm:gap-md pt-sm">
                <div className="bg-primary-fixed rounded-xl p-2 text-center flex flex-col justify-center min-h-[80px]">
                  <p className="text-[9px] text-secondary font-bold uppercase">Số dư</p>
                  <p className="text-sm sm:text-lg font-black text-primary mt-0.5">{loyaltyPoints.toLocaleString("vi-VN")}</p>
                  <p className="text-[8px] text-secondary">điểm</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-2 text-center flex flex-col justify-center min-h-[80px]">
                  <p className="text-[9px] text-secondary font-bold uppercase">Quy đổi</p>
                  <p className="text-sm sm:text-lg font-black text-on-surface mt-0.5">{formatVnd(loyaltyPoints * 1000)}</p>
                  <p className="text-[8px] text-secondary">giá trị</p>
                </div>
                <div className="bg-surface-container-low rounded-xl p-2 text-center flex flex-col justify-center items-center min-h-[80px]">
                  <p className="text-[9px] text-secondary font-bold uppercase mb-0.5">Hạng</p>
                  <span className={`inline-block font-bold text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${getTierBadgeClass(userProfile.tier)}`}>
                    {userProfile.tier}
                  </span>
                  <p className="text-[8px] text-secondary mt-1">hệ số tích lũy</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-on-surface mb-sm">Lịch sử điểm</h4>
                {loadingLoyalty ? (
                  <p className="text-center py-lg text-secondary text-sm">Đang tải...</p>
                ) : loyaltyHistory.length === 0 ? (
                  <p className="text-center py-lg text-secondary text-sm">Chưa có giao dịch điểm nào.</p>
                ) : (
                  <div className="divide-y divide-surface-container-highest">
                    {loyaltyHistory.map((tx) => (
                      <div key={tx.id} className="py-sm flex justify-between items-start gap-md text-sm">
                        <div>
                          <p className="font-semibold text-on-surface">{getLoyaltySourceLabel(tx.sourceType)}</p>
                          <p className="text-xs text-secondary mt-0.5">{tx.description || "—"}</p>
                          <p className="text-[10px] text-secondary mt-0.5">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString("vi-VN") : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-black ${tx.delta >= 0 ? "text-emerald-600" : "text-primary"}`}>
                            {tx.delta >= 0 ? "+" : ""}{tx.delta} điểm
                          </p>
                          <p className="text-[10px] text-secondary">Số dư: {tx.balanceAfter}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "reviews" && <ProductReviewsTab />}

          {activeTab === "vouchers" && <VouchersTab />}

          {activeTab === "warranty" && <WarrantyTab />}

          {activeTab === "policy" && (
            <div className="bg-surface-container-lowest rounded-lg border border-surface-container-highest p-md space-y-md">
              <div className="border-b border-surface-container-highest pb-xs flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-headline-md text-on-surface">Chính sách bảo hành AuraTech</h3>
                  <p className="text-xs text-secondary mt-1">Thông tin chi tiết về chính sách bảo hành và đổi trả của chúng tôi.</p>
                </div>
                <Icon className="text-primary text-[24px]" name="policy" />
              </div>
              
              <div className="space-y-sm text-sm text-on-surface">
                <div className="p-sm bg-surface-container-low rounded-lg border border-surface-container-highest">
                  <h4 className="font-bold text-primary flex items-center gap-1.5 mb-xs">
                    <Icon name="verified" className="text-base" /> 1. Cam kết bảo hành chính hãng
                  </h4>
                  <p className="text-xs leading-relaxed text-secondary">
                    Tất cả sản phẩm điện thoại, laptop, phụ kiện công nghệ mua tại AuraTech đều được cam kết bảo hành chính hãng 12 tháng kể từ ngày giao hàng thành công.
                  </p>
                </div>

                <div className="p-sm bg-surface-container-low rounded-lg border border-surface-container-highest">
                  <h4 className="font-bold text-primary flex items-center gap-1.5 mb-xs">
                    <Icon name="swap_horiz" className="text-base" /> 2. Chính sách đổi trả 30 ngày
                  </h4>
                  <p className="text-xs leading-relaxed text-secondary">
                    Đổi mới sản phẩm cùng model hoặc hoàn tiền 100% trong vòng 30 ngày đầu tiên nếu sản phẩm phát sinh lỗi phần cứng do nhà sản xuất.
                  </p>
                </div>

                <div className="p-sm bg-surface-container-low rounded-lg border border-surface-container-highest">
                  <h4 className="font-bold text-primary flex items-center gap-1.5 mb-xs">
                    <Icon name="build" className="text-base" /> 3. Quy trình tiếp nhận bảo hành
                  </h4>
                  <p className="text-xs leading-relaxed text-secondary">
                    Quý khách có thể mang sản phẩm trực tiếp đến bất kỳ trung tâm bảo hành ủy quyền của AuraTech trên toàn quốc, hoặc liên hệ Hotline miễn phí <span className="font-bold text-on-surface">1800.2097</span> để được hướng dẫn gửi chuyển phát miễn phí.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab !== "overview" && activeTab !== "orders" && activeTab !== "reviews" && activeTab !== "vouchers" && activeTab !== "account" && activeTab !== "addresses" && activeTab !== "membership" && activeTab !== "warranty" && activeTab !== "policy" && (
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

      {/* Mobile Sidebar Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 transition-opacity backdrop-blur-sm animate-fade-in"
          />
          
          {/* Drawer Panel */}
          <div className="relative flex w-[290px] flex-col bg-surface-container-lowest shadow-2xl h-full z-10 animate-slide-in overflow-y-auto rounded-r-2xl">
            {/* Drawer Header with user info */}
            <div className="flex flex-col gap-sm p-md bg-gradient-to-r from-[#c82229] to-[#ec5158] text-white shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-orbitron font-black text-base tracking-wider">AuraTech Profile</span>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="text-white bg-transparent border-0 p-1 cursor-pointer flex items-center hover:bg-white/10 rounded-full"
                >
                  <Icon name="close" className="text-xl" />
                </button>
              </div>
              <div className="flex items-center gap-sm mt-xs">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 border border-white/30 shrink-0">
                  <img alt="Ảnh đại diện" className="w-full h-full object-cover" src={userProfile.avatarUrl} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{userProfile.name}</p>
                  <p className="text-[10px] text-white/80 uppercase tracking-widest font-black mt-0.5">{userProfile.tier}</p>
                </div>
              </div>
            </div>

            {/* Drawer Navigation List */}
            <nav className="flex-1 py-md flex flex-col gap-xs">
              {navSections.map((section, idx) => (
                <div key={idx} className="flex flex-col mb-sm last:mb-0">
                  {/* Section Title */}
                  <div className="px-lg py-1.5 text-[9px] font-black uppercase tracking-wider text-secondary opacity-65">
                    {section.title}
                  </div>
                  
                  {/* Section Navigation Items */}
                  <div className="flex flex-col gap-[4px] px-2">
                    {section.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            handleNavClick(item.id);
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`flex items-center justify-between px-3.5 py-2.5 font-body-sm text-body-sm transition-all duration-200 rounded-xl text-left ${
                            isActive
                              ? "text-primary font-extrabold bg-primary/10 border-l-4 border-primary shadow-[0_2px_8px_rgba(169,0,16,0.06)]"
                              : "text-on-surface border-transparent hover:bg-surface-container-low/60 hover:text-primary"
                          }`}
                          type="button"
                        >
                          <div className="flex items-center min-w-0">
                            <Icon 
                              className={`mr-3 text-[20px] transition-colors ${
                                isActive ? "text-primary" : "text-secondary"
                              }`} 
                              name={item.icon} 
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <Icon name="chevron_right" className={`text-xs transition-transform duration-200 ${isActive ? "text-primary translate-x-0.5" : "text-secondary/40"}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div className="border-t border-surface-container-highest mt-sm pt-sm">
                <a
                  href="/"
                  onClick={handleLogout}
                  className="flex items-center px-lg py-2.5 text-on-surface font-body-sm text-body-sm border-l-4 border-transparent hover:bg-surface-container-low/60 hover:text-primary transition-all duration-150"
                >
                  <Icon className="mr-3 text-[18px] text-secondary" name="logout" />
                  <span>Đăng xuất</span>
                </a>
              </div>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}


