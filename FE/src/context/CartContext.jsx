import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cartApi } from "../services/cartApi";
import { hasAuthToken } from "../services/apiClient";
import keycloak from "../services/keycloak";

const CartContext = createContext(null);

function normalizeCartItem(item) {
  const productId = String(item.productId || item.id || "");
  const variantId = item.variantId ? String(item.variantId) : "";
  const name = item.productName || item.name || "Sáº£n pháº©m";
  const image = item.imageUrl || item.image || "";
  const price = Number(item.unitPrice || item.price || 0);
  const qty = Number(item.quantity || item.qty || 1);
  
  let variantLabel = item.variant || "TiÃªu chuáº©n";
  if (item.variantAttr) {
    try {
      const attr = typeof item.variantAttr === "string" ? JSON.parse(item.variantAttr) : item.variantAttr;
      if (attr && typeof attr === "object") {
        variantLabel = Object.values(attr).join(" - ");
      }
    } catch (e) {
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
      showToast(error instanceof Error ? error.message : "KhÃ´ng thá»ƒ táº£i giá» hÃ ng.");
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function addToCart(product, variant = null) {
    if (!keycloak.authenticated) {
      showToast("Vui lÃ²ng Ä‘Äƒng nháº­p Ä‘á»ƒ thÃªm sáº£n pháº©m vÃ o giá» hÃ ng.");
      setTimeout(() => {
        keycloak.login({
          redirectUri: window.location.href
        });
      }, 800);
      return;
    }
    try {
      const chosenVariant = variant || product?.selectedVariant || (Array.isArray(product?.variants) ? product.variants[0] : null);
      const variantId = chosenVariant && typeof chosenVariant === "object" ? chosenVariant.id : chosenVariant;
      const data = await cartApi.addItem(product.id, 1, variantId || undefined);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
      showToast("ÄÃ£ thÃªm sáº£n pháº©m vÃ o giá» hÃ ng.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "KhÃ´ng thá»ƒ thÃªm sáº£n pháº©m vÃ o giá» hÃ ng.");
    }
  }

  async function updateQty(id, variant, qty) {
    const item = items.find((candidate) => candidate.id === id && candidate.variant === variant);
    if (!item) return;
    try {
      const data = await cartApi.updateItem(item.productId, Math.max(1, qty), item.variantId);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "KhÃ´ng thá»ƒ cáº­p nháº­t giá» hÃ ng.");
    }
  }

  async function removeItem(id, variant) {
    const item = items.find((candidate) => candidate.id === id && candidate.variant === variant);
    if (!item) return;
    try {
      const data = await cartApi.removeItem(item.productId, item.variantId);
      setItems(Array.isArray(data) ? data.map(normalizeCartItem) : []);
      showToast("ÄÃ£ xÃ³a sáº£n pháº©m khá»i giá» hÃ ng.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "KhÃ´ng thá»ƒ xÃ³a sáº£n pháº©m khá»i giá» hÃ ng.");
    }
  }

  const summary = useMemo(() => {
    const subtotal = items.reduce((total, item) => total + Number(item.price || 0) * item.qty, 0);
    const discount = 0;
    const shipping = 0;
    const vat = Math.round(subtotal * 0.1);
    const total = subtotal - discount + shipping + vat;
    return { subtotal, discount, shipping, vat, total };
  }, [items]);

  const value = { items, addToCart, updateQty, removeItem, summary, toast, showToast, reloadCart: loadCart };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart pháº£i Ä‘Æ°á»£c dÃ¹ng bÃªn trong CartProvider");
  return value;
}

