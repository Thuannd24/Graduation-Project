import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cartApi } from "../services/cartApi";
import { hasAuthToken } from "../services/apiClient";
import keycloak from "../services/keycloak";
import { VAT_RATE, calculateShippingFee } from "../utils/checkoutConstants";

const CartContext = createContext(null);

function normalizeCartItem(item) {
  const productId = String(item.productId || item.id || "");
  const variantId = item.variantId ? String(item.variantId) : "";
  const name = item.productName || item.name || "Sản phẩm";
  const image = item.imageUrl || item.image || "";
  const price = Number(item.unitPrice || item.price || 0);
  const qty = Number(item.quantity || item.qty || 1);

  let variantLabel = item.variant || "Tiêu chuẩn";
  if (item.variantAttr) {
    try {
      const attr = typeof item.variantAttr === "string" ? JSON.parse(item.variantAttr) : item.variantAttr;
      if (attr && typeof attr === "object") {
        variantLabel = Object.values(attr).join(" - ");
      }
    } catch {
      // ignore
    }
  }

  return {
    ...item,
    id: productId,
    productId,
    variantId,
    name,
    image,
    price,
    qty,
    variant: variantLabel,
    cartItemId: productId
  };
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [toast, setToast] = useState("");

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  async function loadCart() {
    if (!hasAuthToken()) {
      setItems([]);
      return;
    }
    try {
      const data = await cartApi.getCart();
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể tải giỏ hàng.");
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function addToCart(product, variant = null) {
    if (!keycloak.authenticated) {
      showToast("Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.");
      setTimeout(() => {
        keycloak.login({
          redirectUri: window.location.href
        });
      }, 800);
      return false;
    }
    try {
      const chosenVariant = variant || product?.selectedVariant || (Array.isArray(product?.variants) ? product.variants[0] : null);
      const variantId = chosenVariant && typeof chosenVariant === "object" ? chosenVariant.id : chosenVariant;
      const data = await cartApi.addItem(product.id, 1, variantId || undefined);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
      showToast("Đã thêm sản phẩm vào giỏ hàng.");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể thêm sản phẩm vào giỏ hàng.");
      return false;
    }
  }

  async function updateQty(id, variant, qty) {
    const item = items.find((candidate) => candidate.id === id && candidate.variant === variant);
    if (!item) return;
    try {
      const data = await cartApi.updateItem(item.productId, Math.max(1, qty), item.variantId);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể cập nhật giỏ hàng.");
    }
  }

  async function removeItem(id, variant) {
    const item = items.find((candidate) => candidate.id === id && candidate.variant === variant);
    if (!item) return;
    try {
      const data = await cartApi.removeItem(item.productId, item.variantId);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
      showToast("Đã xóa sản phẩm khỏi giỏ hàng.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không thể xóa sản phẩm khỏi giỏ hàng.");
    }
  }

  const summary = useMemo(() => {
    const subtotal = items.reduce((total, item) => total + Number(item.price || 0) * item.qty, 0);
    const discount = 0;
    const shipping = calculateShippingFee(subtotal);
    const vat = Math.round(subtotal * VAT_RATE);
    const total = subtotal - discount + shipping + vat;
    return { subtotal, discount, shipping, vat, total };
  }, [items]);

  const value = { items, addToCart, updateQty, removeItem, summary, toast, showToast, reloadCart: loadCart };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart phải được dùng bên trong CartProvider");
  return value;
}
