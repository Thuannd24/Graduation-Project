import { useCallback, useEffect, useState } from "react";
import { authApi } from "../../../../../services/authApi.ts";
import { productApi } from "../../../../../services/productApi.ts";
import { flattenCategoryTree } from "../utils/categoryTree.js";

function normalizeProvinces(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.content)) return data.content;
    if (Array.isArray(data.provinces)) return data.provinces;
    if (Array.isArray(data.data)) return data.data;
  }
  return [];
}

export default function useLookupData() {
  const [provinces, setProvinces] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [provList, catTree] = await Promise.all([
          authApi.getProvinces(),
          productApi.listCategories()
        ]);
        if (cancelled) return;
        setProvinces(normalizeProvinces(provList));
        setCategories(flattenCategoryTree(Array.isArray(catTree) ? catTree : []));
      } catch {
        if (!cancelled) {
          setProvinces([]);
          setCategories([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const searchProducts = useCallback(async query => {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const result = await productApi.searchProducts(q, 0, 15);
    return result?.items || result?.content || [];
  }, []);

  return { provinces, categories, loading, searchProducts };
}
