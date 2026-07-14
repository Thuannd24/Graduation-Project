import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../../../components/common/Icon.jsx";
import OrderSummary from "../../cart/components/OrderSummary.jsx";
import VoucherPicker from "../components/VoucherPicker.jsx";
import { useCart } from "../../../context/CartContext.jsx";
import { orderApi } from "../../../services/orderApi";
import { authApi } from "../../../services/authApi";
import { formatVnd } from "../../../utils/format.js";
import keycloak from "../../../services/keycloak.js";

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, summary, showToast, reloadCart, addToCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrder, setSuccessOrder] = useState(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [isInitialized, setIsInitialized] = useState(false);

  // Handle pending guest purchase after logging in
  useEffect(() => {
    const handlePendingBuyNow = async () => {
      const pendingStr = sessionStorage.getItem("pending_buy_now");
      if (pendingStr) {
        try {
          const product = JSON.parse(pendingStr);
          sessionStorage.removeItem("pending_buy_now");
          showToast("Đang thêm sản phẩm vào đơn hàng...");
          const success = await addToCart(product);
          if (success) {
            reloadCart?.();
          } else {
            navigate("/cart");
          }
        } catch (err) {
          console.error("Failed to add pending buy-now product to cart:", err);
          navigate("/cart");
        }
      }
    };
    handlePendingBuyNow();
  }, [addToCart, reloadCart, showToast, navigate]);

  // Controlled fields
  const [fullName, setFullName] = useState(() => {
    const name = keycloak.tokenParsed?.name;
    return name && name !== "Keycloak User" ? name : "";
  });
  const [phoneNumber, setPhoneNumber] = useState(() => {
    const un = keycloak.tokenParsed?.preferred_username || "";
    return un.match(/^0[0-9]{9,10}$/) ? un : "";
  });
  const [email, setEmail] = useState(() => {
    const em = keycloak.tokenParsed?.email || "";
    return em.includes("@placeholder.com") ? "" : em;
  });
  const [shippingAddress, setShippingAddress] = useState("");
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  // Address book & DB locations state
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [provinceName, setProvinceName] = useState("");
  const [wardName, setWardName] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [saveToAddressBook, setSaveToAddressBook] = useState(false);
  const [isNewAddress, setIsNewAddress] = useState(true);
  const [showAddressSelector, setShowAddressSelector] = useState(false);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("COD");

  // Load address book and provinces on mount
  useEffect(() => {
    const loadAddressData = async () => {
      try {
        const addrList = await authApi.getAddresses();
        setSavedAddresses(addrList || []);
        if (addrList && addrList.length > 0) {
          const defaultAddr = addrList.find(a => a.isDefault) || addrList[0];
          setSelectedAddressId(defaultAddr.id);
          setIsNewAddress(false);
          setFullName(defaultAddr.recipientName);
          setPhoneNumber(defaultAddr.phoneNumber);
          setShippingAddress(`${defaultAddr.detailAddress}, ${defaultAddr.districtWard}, ${defaultAddr.province}`);
        }
      } catch (err) {
        console.warn("Failed to load saved addresses", err);
      }

      try {
        const provList = await authApi.getProvinces();
        setProvinces(provList || []);
      } catch (err) {
        console.warn("Failed to load provinces", err);
      } finally {
        setIsInitialized(true);
      }
    };

    loadAddressData();
  }, []);

  // Redirect to cart if the cart is empty after initialization
  useEffect(() => {
    if (isInitialized && !submitting && !successOrder && items.length === 0) {
      navigate("/cart");
    }
  }, [isInitialized, items, successOrder, navigate, submitting]);

  // Fetch wards when province changes
  useEffect(() => {
    if (!selectedProvinceCode) {
      setWards([]);
      setSelectedWardCode("");
      setWardName("");
      setProvinceName("");
      return;
    }

    const loadWards = async () => {
      try {
        const wardList = await authApi.getWards(selectedProvinceCode);
        setWards(wardList || []);
      } catch (err) {
        console.error("Failed to load wards", err);
      }
    };

    loadWards();
    const province = provinces.find(p => p.code === Number(selectedProvinceCode));
    if (province) {
      setProvinceName(province.name);
    }
  }, [selectedProvinceCode, provinces]);

  // Sync ward name
  useEffect(() => {
    if (selectedWardCode) {
      const ward = wards.find(w => w.code === Number(selectedWardCode));
      if (ward) {
        setWardName(ward.name);
      }
    } else {
      setWardName("");
    }
  }, [selectedWardCode, wards]);

  const handleSelectSavedAddress = (id) => {
    setSelectedAddressId(id);
    setIsNewAddress(false);
    const addr = savedAddresses.find(a => a.id === id);
    if (addr) {
      setFullName(addr.recipientName);
      setPhoneNumber(addr.phoneNumber);
      setShippingAddress(`${addr.detailAddress}, ${addr.districtWard}, ${addr.province}`);
    }
  };

  // Load applied coupon from CartPage
  useEffect(() => {
    const code = sessionStorage.getItem("techstore_coupon_code");
    const pct = sessionStorage.getItem("techstore_coupon_discount_percent");
    if (code && pct) {
      setCouponCode(code);
      setDiscountPercent(parseFloat(pct));
      setAppliedVoucher({
        code: code,
        discountPercent: parseFloat(pct),
        title: `Mã ${code} (${parseFloat(pct) * 100}%)`
      });
    }
  }, []);

  // Sync appliedVoucher changes
  useEffect(() => {
    if (appliedVoucher) {
      setCouponCode(appliedVoucher.code);
      setDiscountPercent(appliedVoucher.discountPercent);
    } else {
      setCouponCode("");
      setDiscountPercent(0);
    }
  }, [appliedVoucher]);

  // Calculate local checkout summary taking voucher and VAT into account
  const localSummary = useMemo(() => {
    const subtotal = summary.subtotal;
    let discount = 0;
    
    if (appliedVoucher?.productDiscountAmount !== undefined) {
      discount = appliedVoucher.productDiscountAmount;
    } else if (appliedVoucher?.discountAmount !== undefined) {
      discount = appliedVoucher.discountAmount;
    } else if (discountPercent > 0) {
      discount = Math.round(subtotal * discountPercent);
    }
    
    let shipping = summary.shipping !== undefined ? summary.shipping : 30000;
    if (appliedVoucher?.shippingDiscountAmount > 0) {
      shipping = Math.max(0, shipping - appliedVoucher.shippingDiscountAmount);
    }
    
    const vat = Math.round((subtotal - discount) * 0.1);
    const total = subtotal - discount + shipping + vat;
    
    return {
      subtotal,
      discount,
      shipping,
      vat,
      total
    };
  }, [summary, discountPercent, appliedVoucher]);

  const validateForm = () => {
    const errors = {};
    if (!fullName.trim()) errors.fullName = "Họ và tên không được để trống.";
    if (!phoneNumber.trim()) {
      errors.phoneNumber = "Số điện thoại không được để trống.";
    } else if (!/^[0-9]{10,11}$/.test(phoneNumber.trim().replace(/\s/g, ""))) {
      errors.phoneNumber = "Số điện thoại không hợp lệ (10-11 chữ số).";
    }
    if (email.trim() && !/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Địa chỉ email không hợp lệ.";
    }
    
    if (isNewAddress) {
      if (!selectedProvinceCode) errors.province = "Vui lòng chọn Tỉnh/Thành phố.";
      if (!selectedWardCode) errors.ward = "Vui lòng chọn Quận/Huyện, Phường/Xã.";
      if (!detailAddress.trim()) errors.detailAddress = "Vui lòng nhập địa chỉ chi tiết.";
    } else {
      if (!shippingAddress.trim()) errors.shippingAddress = "Địa chỉ nhận hàng không được để trống.";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const placeOrder = async () => {
    if (submitting) return;
    if (!validateForm()) {
      setError("Vui lòng sửa các lỗi trong form trước khi tiếp tục.");
      return;
    }

    setSubmitting(true);
    setError("");

    let finalShippingAddress = shippingAddress;
    if (isNewAddress) {
      finalShippingAddress = `${detailAddress.trim()}, ${wardName}, ${provinceName}`;
    }

    try {
      // If saving to address book
      if (isNewAddress && saveToAddressBook) {
        try {
          const newAddr = await authApi.addAddress({
            recipientName: fullName.trim(),
            phoneNumber: phoneNumber.trim(),
            province: provinceName,
            districtWard: wardName,
            detailAddress: detailAddress.trim(),
            isDefault: savedAddresses.length === 0
          });
          // Update local address list
          setSavedAddresses(prev => [...prev, newAddr]);
        } catch (addrErr) {
          console.warn("Failed to save address to address book", addrErr);
        }
      }

      const orderData = await orderApi.createOrder({
        shippingAddress: finalShippingAddress.trim(),
        phoneNumber: phoneNumber.trim(),
        couponCode: couponCode.trim() || null,
        shippingFee: localSummary.shipping,
        note: note.trim() || null
      }, idempotencyKeyRef.current);

      // Clear applied vouchers
      sessionStorage.removeItem("techstore_coupon_code");
      sessionStorage.removeItem("techstore_coupon_discount_percent");

      // Initiate payment (COD or VNPAY)
      try {
        const payInit = await orderApi.initiatePayment(orderData.id, paymentMethod);
        if (paymentMethod === "VNPAY" && payInit && payInit.redirectUrl) {
          showToast("Đang chuyển hướng sang cổng thanh toán VNPAY...");
          window.location.href = payInit.redirectUrl;
          return;
        }
      } catch (payErr) {
        console.error("Payment initiation failed", payErr);
        setError("Tạo đơn hàng thành công, nhưng không thể khởi tạo phương thức thanh toán: " + payErr.message);
        setSuccessOrder(orderData);
        reloadCart?.();
        return;
      }

      setSuccessOrder(orderData);
      showToast("Đặt hàng thành công!");
      reloadCart?.();
    } catch (err) {
      setError(err.message || "Đặt hàng thất bại. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  // If order was successfully created, render Success screen (Step 3)
  if (successOrder) {
    return (
      <div className="space-y-8 py-6 max-w-2xl mx-auto">
        {/* Checkout steps bar */}
        <div className="flex items-center justify-between relative py-2 mb-6">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-slate-200 dark:bg-slate-800 z-0">
            <div className="h-full bg-emerald-650 transition-all duration-300" style={{ width: "100%" }}></div>
          </div>
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow">
              ✓
            </div>
            <span className="text-xs font-bold text-emerald-600">Giỏ hàng</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow">
              ✓
            </div>
            <span className="text-xs font-bold text-emerald-600">Thông tin giao nhận</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow ring-4 ring-emerald-500/20">
              3
            </div>
            <span className="text-xs font-bold text-emerald-600">Thành công</span>
          </div>
        </div>

        {/* Success Card layout */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-md text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Icon name="verified" className="text-5xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-850 dark:text-slate-100 uppercase tracking-tight">ĐẶT HÀNG THÀNH CÔNG!</h1>
            <p className="text-sm text-slate-500 mt-2">Cảm ơn bạn đã lựa chọn AuraTech. Đơn hàng của bạn đang được xử lý.</p>
          </div>

          {/* Details list */}
          <div className="border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 rounded-xl p-4 text-left text-xs space-y-3 font-semibold text-slate-650 dark:text-slate-350">
            <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800 pb-2">
              <span>Mã đơn hàng</span>
              <strong className="text-primary font-bold">#{successOrder.id}</strong>
            </div>
            <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800 pb-2">
              <span>Người nhận</span>
              <span className="text-slate-800 dark:text-slate-200">{fullName}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800 pb-2">
              <span>Số điện thoại</span>
              <span className="text-slate-800 dark:text-slate-200">{phoneNumber}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800 pb-2">
              <span>Địa chỉ nhận hàng</span>
              <span className="text-slate-800 dark:text-slate-200 text-right max-w-xs line-clamp-2">{shippingAddress}</span>
            </div>
            {note && (
              <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-800 pb-2">
                <span>Ghi chú</span>
                <span className="text-slate-800 dark:text-slate-200">{note}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-sm font-black uppercase text-slate-800 dark:text-slate-100">
              <span>Tổng số tiền thanh toán</span>
              <span className="text-primary">{formatVnd(Number(successOrder.finalAmount || successOrder.totalAmount || 0))}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to={`/order/${successOrder.id}`}
              className="flex-1 py-3 bg-slate-850 hover:bg-slate-700 text-white font-extrabold text-xs uppercase rounded-xl transition-colors text-center"
            >
              Chi tiết đơn hàng
            </Link>
            <Link
              to="/"
              className="flex-1 py-3 bg-primary hover:bg-red-700 text-white font-extrabold text-xs uppercase rounded-xl transition-colors shadow-md shadow-red-500/10 text-center"
            >
              Tiếp tục mua sắm
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      {/* Checkout steps bar */}
      <div className="max-w-xl mx-auto flex items-center justify-between relative py-2">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-slate-200 dark:bg-slate-800 z-0">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: "50%" }}></div>
        </div>
        <div className="flex flex-col items-center gap-1.5 z-10">
          <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center ring-4 ring-red-500/20 shadow">
            1
          </div>
          <span className="text-xs font-bold text-primary">Giỏ hàng</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 z-10">
          <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center ring-4 ring-red-500/20 shadow">
            2
          </div>
          <span className="text-xs font-bold text-primary">Thông tin giao nhận</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 z-10">
          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-bold text-xs flex items-center justify-center">
            3
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Thanh toán</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left column forms */}
        <div className="flex-1 w-full space-y-6">
          {/* Form details section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 dark:border-slate-800 pb-3">
              <Icon name="person" className="text-primary" /> Thông tin giao nhận hàng
            </h2>

            <div className="space-y-5">
            {!isNewAddress && savedAddresses.length > 0 ? (
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-850 dark:text-slate-205">{fullName}</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-xs text-slate-500">{phoneNumber}</span>
                      {savedAddresses.find(a => a.id === selectedAddressId)?.isDefault && (
                        <span className="bg-emerald-500/10 text-emerald-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">Mặc định</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-650 dark:text-slate-400 font-semibold leading-relaxed">{shippingAddress}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddressSelector(!showAddressSelector)}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                  >
                    <Icon name="edit" className="text-sm" />
                    <span>Thay đổi</span>
                  </button>
                </div>
                
                {showAddressSelector && (
                  <div className="border-t border-slate-200/50 dark:border-slate-800/80 pt-3 mt-1 space-y-2">
                    <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-2">Chọn địa chỉ khác:</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {savedAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          onClick={() => {
                            handleSelectSavedAddress(addr.id);
                            setShowAddressSelector(false);
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedAddressId === addr.id
                              ? "border-primary bg-red-500/5"
                              : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-extrabold text-xs text-slate-850 dark:text-slate-205">{addr.recipientName}</span>
                            {addr.isDefault && (
                              <span className="bg-emerald-500/10 text-emerald-600 text-[8px] font-extrabold px-1.5 py-0.2 rounded-full">Mặc định</span>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-500 font-bold mb-0.5">{addr.phoneNumber}</p>
                          <p className="text-[9px] text-slate-650 dark:text-slate-400 font-semibold line-clamp-1">
                            {addr.detailAddress}, {addr.districtWard}, {addr.province}
                          </p>
                        </div>
                      ))}
                      
                      <div
                        onClick={() => {
                          setIsNewAddress(true);
                          setSelectedAddressId("");
                          setFullName("");
                          setPhoneNumber("");
                          setShippingAddress("");
                          setDetailAddress("");
                          setShowAddressSelector(false);
                        }}
                        className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 hover:border-slate-350 cursor-pointer flex items-center justify-center gap-1.5 text-slate-400 hover:text-primary transition-all text-xs font-bold uppercase"
                      >
                        <Icon name="add" className="text-sm" />
                        <span>Giao đến địa chỉ mới</span>
                      </div>
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-1 text-xs font-bold text-slate-550 border-t border-slate-200/40 dark:border-slate-800/40 pt-2.5">
                  <span>Ghi chú giao hàng (tùy chọn)</span>
                  <textarea
                    placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi đến..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                {savedAddresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewAddress(false);
                      const defaultAddr = savedAddresses.find(a => a.isDefault) || savedAddresses[0];
                      handleSelectSavedAddress(defaultAddr.id);
                    }}
                    className="text-xs font-black text-primary hover:underline flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0 mb-2 uppercase"
                  >
                    <Icon name="arrow_back" className="text-sm" />
                    <span>Quay lại chọn địa chỉ đã lưu</span>
                  </button>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550">
                    <span>Họ và tên người nhận <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={`bg-slate-50 dark:bg-slate-950 border rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 ${
                        fieldErrors.fullName ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-800 focus:ring-primary"
                      }`}
                    />
                    {fieldErrors.fullName && <span className="text-[10px] text-red-500 mt-0.5">{fieldErrors.fullName}</span>}
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550">
                    <span>Số điện thoại <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      placeholder="0987 654 321"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className={`bg-slate-50 dark:bg-slate-950 border rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 ${
                        fieldErrors.phoneNumber ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-800 focus:ring-primary"
                      }`}
                    />
                    {fieldErrors.phoneNumber && <span className="text-[10px] text-red-500 mt-0.5">{fieldErrors.phoneNumber}</span>}
                  </label>



                  {/* Province select */}
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550">
                    <span>Tỉnh / Thành phố <span className="text-red-500">*</span></span>
                    <select
                      value={selectedProvinceCode}
                      onChange={(e) => {
                        setSelectedProvinceCode(e.target.value);
                        setSelectedWardCode("");
                      }}
                      className={`bg-slate-50 dark:bg-slate-950 border rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 ${
                        fieldErrors.province ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-800 focus:ring-primary"
                      }`}
                    >
                      <option value="">-- Chọn Tỉnh/Thành phố --</option>
                      {provinces.map(p => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                      ))}
                    </select>
                    {fieldErrors.province && <span className="text-[10px] text-red-500 mt-0.5">{fieldErrors.province}</span>}
                  </label>

                  {/* Ward/District select */}
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550">
                    <span>Quận/Huyện, Phường/Xã <span className="text-red-500">*</span></span>
                    <select
                      value={selectedWardCode}
                      disabled={!selectedProvinceCode}
                      onChange={(e) => setSelectedWardCode(e.target.value)}
                      className={`bg-slate-50 dark:bg-slate-950 border rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 ${
                        fieldErrors.ward ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-800 focus:ring-primary"
                      }`}
                    >
                      <option value="">-- Chọn Quận/Huyện, Phường/Xã --</option>
                      {wards.map(w => (
                        <option key={w.code} value={w.code}>{w.name}</option>
                      ))}
                    </select>
                    {fieldErrors.ward && <span className="text-[10px] text-red-500 mt-0.5">{fieldErrors.ward}</span>}
                  </label>

                  {/* Detail Address textarea */}
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550 md:col-span-2">
                    <span>Địa chỉ chi tiết (Số nhà, ngõ/ngách, tên đường...) <span className="text-red-500">*</span></span>
                    <textarea
                      placeholder="Ví dụ: Số 123, Ngõ 4, Đường Cầu Giấy"
                      value={detailAddress}
                      onChange={(e) => setDetailAddress(e.target.value)}
                      rows={2}
                      className={`bg-slate-50 dark:bg-slate-950 border rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 ${
                        fieldErrors.detailAddress ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-800 focus:ring-primary"
                      }`}
                    />
                    {fieldErrors.detailAddress && <span className="text-[10px] text-red-500 mt-0.5">{fieldErrors.detailAddress}</span>}
                  </label>

                  {/* Save to profile checkbox */}
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 md:col-span-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveToAddressBook}
                      onChange={(e) => setSaveToAddressBook(e.target.checked)}
                      className="rounded text-primary focus:ring-primary accent-primary w-4 h-4"
                    />
                    <span>Lưu địa chỉ này vào sổ địa chỉ để dùng cho lần sau</span>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-550 md:col-span-2">
                    <span>Ghi chú giao hàng (tùy chọn)</span>
                    <textarea
                      placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi đến..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-850 dark:text-slate-250 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Payment Method Selection Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4 mt-6">
            <h2 className="text-sm font-black text-slate-850 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 dark:border-slate-800 pb-3">
              <Icon name="payment" className="text-primary" /> Phương thức thanh toán
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: COD */}
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                paymentMethod === "COD" 
                  ? "border-primary bg-red-500/5 text-primary" 
                  : "border-slate-250 dark:border-slate-800 hover:border-slate-350 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-250"
              }`}>
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="COD" 
                  checked={paymentMethod === "COD"} 
                  onChange={() => setPaymentMethod("COD")}
                  className="mt-1 accent-primary cursor-pointer"
                />
                <div>
                  <span className="font-extrabold text-xs block uppercase">COD (Thanh toán khi nhận hàng)</span>
                  <span className="text-[10px] text-slate-400 font-semibold block mt-1">Trả tiền mặt khi sản phẩm được giao đến tận nhà.</span>
                </div>
              </label>

              {/* Option 2: VNPAY */}
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                paymentMethod === "VNPAY" 
                  ? "border-primary bg-red-500/5 text-primary" 
                  : "border-slate-250 dark:border-slate-800 hover:border-slate-355 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-250"
              }`}>
                <input 
                  type="radio" 
                  name="paymentMethod" 
                  value="VNPAY" 
                  checked={paymentMethod === "VNPAY"} 
                  onChange={() => setPaymentMethod("VNPAY")}
                  className="mt-1 accent-primary cursor-pointer"
                />
                <div>
                  <span className="font-extrabold text-xs block uppercase text-blue-600">Thanh toán qua VNPAY</span>
                  <span className="text-[10px] text-slate-400 font-semibold block mt-1">Chuyển hướng an toàn qua cổng thanh toán QR/ATM của VNPAY.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right column Summary items */}
        <aside className="w-full lg:w-[380px] shrink-0 space-y-4 lg:sticky lg:top-24">
          {/* Voucher Picker placed prominently at the top of sidebar */}
          <VoucherPicker
            orderTotal={summary.subtotal}
            appliedVoucher={appliedVoucher}
            onApplied={setAppliedVoucher}
            onClear={() => setAppliedVoucher(null)}
          />

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-850 dark:text-slate-205 uppercase tracking-wider pb-2 border-b border-slate-50 dark:border-slate-800/80">
              Sản phẩm mua
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-60 overflow-y-auto pr-1">
              {items.map((item) => (
                <article key={`${item.id}-${item.variant}`} className="py-3 flex gap-3 items-center">
                  <img alt={item.name} src={item.image} className="w-12 h-12 object-contain border border-slate-100 dark:border-slate-800 rounded" />
                  <div className="min-w-0 flex-1 text-xs">
                    <strong className="font-bold text-slate-850 dark:text-slate-250 line-clamp-1 block">{item.name}</strong>
                    <span className="text-[10px] text-slate-455 mt-0.5 block uppercase">SL: {item.qty} | {item.variant}</span>
                  </div>
                  <strong className="text-xs font-black text-slate-800 dark:text-slate-250 shrink-0">{formatVnd(Number(item.price || 0) * item.qty)}</strong>
                </article>
              ))}
            </div>
          </div>

          {error && (
            <p className="p-3 bg-red-50 dark:bg-red-955/20 border border-red-200 text-red-500 rounded-xl text-xs font-bold text-center">
              {error}
            </p>
          )}

          <OrderSummary
            summary={localSummary}
            hideVoucherSection
            asDiv
            asButton
            className="w-full space-y-4"
            actionLabel={submitting ? "Đang xử lý..." : "Xác nhận & Đặt hàng"}
            onAction={placeOrder}
            disabled={submitting}
          />
        </aside>
      </div>
    </div>
  );
}
