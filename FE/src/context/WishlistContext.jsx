import { createContext, useContext, useEffect, useState } from "react";
import { productApi } from "../services/productApi.ts";
import { hasAuthToken } from "../services/apiClient.ts";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWishlist = async () => {
    if (!hasAuthToken()) {
      try {
        const stored = localStorage.getItem("techstore_wishlist");
        setWishlist(stored ? JSON.parse(stored) : []);
      } catch (e) {
        setWishlist([]);
      }
      return;
    }
    try {
      setLoading(true);
      const backendWishlist = await productApi.getWishlist();
      setWishlist(backendWishlist);
    } catch (e) {
      console.warn("Failed to fetch backend wishlist, using local storage fallback:", e);
      try {
        const stored = localStorage.getItem("techstore_wishlist");
        setWishlist(stored ? JSON.parse(stored) : []);
      } catch (err) {
        setWishlist([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const toggleWishlist = async (product) => {
    const exists = wishlist.some((item) => String(item.id) === String(product.id));
    let newWishlist;
    if (exists) {
      newWishlist = wishlist.filter((item) => String(item.id) !== String(product.id));
      setWishlist(newWishlist);
      
      if (hasAuthToken()) {
        try {
          await productApi.removeFromWishlist(product.id);
        } catch (e) {
          console.error("Failed to remove from backend wishlist", e);
        }
      } else {
        localStorage.setItem("techstore_wishlist", JSON.stringify(newWishlist));
      }
    } else {
      newWishlist = [...wishlist, product];
      setWishlist(newWishlist);

      if (hasAuthToken()) {
        try {
          await productApi.addToWishlist(product.id);
        } catch (e) {
          console.error("Failed to add to backend wishlist", e);
        }
      } else {
        localStorage.setItem("techstore_wishlist", JSON.stringify(newWishlist));
      }
    }
  };

  const isInWishlist = (productId) => {
    return wishlist.some((item) => String(item.id) === String(productId));
  };

  const clearWishlist = () => {
    setWishlist([]);
    localStorage.removeItem("techstore_wishlist");
  };

  return (
    <WishlistContext.Provider value={{ wishlist, toggleWishlist, isInWishlist, clearWishlist, fetchWishlist, loading }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
}
