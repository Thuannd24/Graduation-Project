import { apiClient } from "./apiClient";
import { resolveProductPrices } from "../utils/pricing";

export interface Product {
  id: string;
  name: string;
  category: string;
  categoryId?: number;
  categoryPath?: string;
  brand?: string;
  brandId?: number;
  image: string;
  imageUrl?: string;
  gallery?: string[];
  price: number;
  salePrice?: number;
  listPrice?: number;
  costPrice?: number;
  oldPrice?: number;
  slug?: string;
  active?: boolean;
  rating?: number;
  reviews?: number;
  specs?: string[];
  description?: string;
  variants?: unknown[];
  [key: string]: unknown;
}

export interface ProductPageResult {
  items: Product[];
  page: number;
  size: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface Category {
  id?: string | number;
  icon?: string;
  label?: string;
  name?: string;
}

function normalizeCollection<T>(data: T[] | { content?: T[]; items?: T[]; products?: T[]; categories?: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.products)) return data.products;
  if (Array.isArray(data?.categories)) return data.categories;
  return [];
}

export interface Brand {
  id: string | number;
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  active?: boolean;
  categoryIds?: number[];
}

export function normalizeProduct(product: Partial<Product>): Product {
  const rawImage = String(product.image ?? product.thumbnail ?? product.imageUrl ?? "");
  const pricing = resolveProductPrices({
    price: product.price ?? product.listPrice,
    salePrice: product.salePrice,
    oldPrice: product.oldPrice,
    originalPrice: product.originalPrice as number | string | null | undefined,
  });

  return {
    id: String(product.id ?? product.productId ?? ""),
    name: String(product.name ?? "Sản phẩm chưa có tên"),
    category: String(product.category ?? ""),
    categoryId: product.categoryId != null ? Number(product.categoryId) : undefined,
    categoryPath: product.categoryPath ? String(product.categoryPath) : undefined,
    brand: product.brand ? String(product.brand) : undefined,
    brandId: product.brandId != null ? Number(product.brandId) : undefined,
    image: rawImage,
    imageUrl: rawImage,
    gallery: Array.isArray(product.gallery) ? product.gallery : Array.isArray(product.images) ? product.images as string[] : [rawImage].filter(Boolean),
    listPrice: pricing.listPrice,
    price: pricing.price,
    salePrice: pricing.salePrice,
    costPrice: Number(product.costPrice ?? 0),
    oldPrice: pricing.oldPrice,
    slug: product.slug ? String(product.slug) : undefined,
    active: product.active !== false,
    rating: Number(product.rating ?? product.ratingAvg ?? 0),
    reviews: Number(product.reviews ?? product.reviewCount ?? 0),
    specs: Array.isArray(product.specs) ? product.specs : [],
    description: String(product.description ?? ""),
    variants: product.variants || [],
    attributes: product.attributes || {}
  };
}

function parseSliceProducts(data: unknown): ProductPageResult {
  const slice = data as Record<string, unknown>;
  const content = Array.isArray(slice)
    ? slice
    : Array.isArray(slice?.content)
      ? slice.content
      : [];

  return {
    items: (content as Partial<Product>[]).map(normalizeProduct),
    page: Number(slice?.number ?? 0),
    size: Number(slice?.size ?? content.length),
    hasNext: slice?.hasNext != null ? Boolean(slice.hasNext) : slice?.last === false,
    hasPrevious: slice?.hasPrevious != null ? Boolean(slice.hasPrevious) : slice?.first === false
  };
}

export const productApi = {
  async listProducts(params: Record<string, string> = {}): Promise<Product[]> {
    const result = await this.listProductsPaged(params);
    return result.items;
  },

  async listProductsPaged(params: Record<string, string> = {}): Promise<ProductPageResult> {
    const { categoryId, ...rest } = params;
    const query = new URLSearchParams(rest).toString();
    const path = categoryId
      ? `/public/products/category/${categoryId}${query ? `?${query}` : ""}`
      : `/public/products${query ? `?${query}` : ""}`;
    const data = await apiClient.get<unknown>(path);
    return parseSliceProducts(data);
  },

  /** Lấy TOÀN BỘ sản phẩm bằng cách duyệt hết các trang, thay vì chỉ trang đầu (mặc định 10 sp/trang ở BE). */
  async listAllProducts(): Promise<Product[]> {
    const all: Product[] = [];
    let page = 0;
    const size = "200";
    const MAX_PAGES = 50; // an toàn: chặn vòng lặp vô hạn nếu API trả sai
    while (page < MAX_PAGES) {
      const result = await this.listProductsPaged({ page: String(page), size });
      all.push(...result.items);
      if (!result.hasNext || result.items.length === 0) break;
      page += 1;
    }
    return all;
  },

  async getProduct(productId: string): Promise<Product> {
    return this.getProductDetail(productId);
  },

  async getProductDetail(productId: string | number): Promise<Product> {
    const raw = await apiClient.get<Record<string, unknown>>(`/public/products/${productId}`);
    return {
      ...normalizeProduct(raw as Partial<Product>),
      attributes: raw.attributes,
      variants: raw.variants || [],
      tags: raw.tags,
      warrantyPeriod: raw.warrantyPeriod,
      warrantyPolicy: raw.warrantyPolicy
    } as Product;
  },

  async searchProducts(query: string, page = 0, size = 10): Promise<ProductPageResult> {
    const data = await apiClient.get<unknown>(
      `/public/products/search?q=${encodeURIComponent(query)}&page=${page}&size=${size}`
    );
    const pageData = data as Record<string, unknown>;
    const content = Array.isArray(pageData?.content) ? pageData.content : [];
    return {
      items: (content as Partial<Product>[]).map((doc) =>
        normalizeProduct({
          id: doc.id,
          name: doc.name,
          description: doc.description,
          price: doc.price,
          salePrice: doc.salePrice,
          imageUrl: doc.imageUrl ?? doc.image,
          brand: doc.brand,
          categoryId: doc.categoryId,
          slug: doc.slug,
          active: doc.active
        })
      ),
      page: Number(pageData?.number ?? page),
      size: Number(pageData?.size ?? size),
      hasNext: pageData?.hasNext != null ? Boolean(pageData.hasNext) : pageData?.last === false,
      hasPrevious: pageData?.hasPrevious != null ? Boolean(pageData.hasPrevious) : pageData?.first === false
    };
  },

  async listCategories(): Promise<Category[]> {
    return normalizeCollection(await apiClient.get<Category[] | { content?: Category[]; categories?: Category[] }>("/public/categories/tree"));
  },

  async listBrands(): Promise<Brand[]> {
    return normalizeCollection(await apiClient.get<Brand[] | { content?: Brand[]; brands?: Brand[] }>("/public/brands?active=true"));
  },

  // Dùng cho trang quản trị: lấy TẤT CẢ brand (kể cả Inactive) để có thể quản lý/kích hoạt lại.
  async listAllBrandsForAdmin(): Promise<Brand[]> {
    return normalizeCollection(await apiClient.get<Brand[] | { content?: Brand[]; brands?: Brand[] }>("/public/brands?size=1000"));
  },

  async listBrandsByCategory(categoryId: string | number): Promise<Brand[]> {
    return normalizeCollection(await apiClient.get<Brand[] | { content?: Brand[]; brands?: Brand[] }>(`/public/brands/category/${categoryId}`));
  },

  async getCategoryAttributes(categoryId: string | number): Promise<any[]> {
    return await apiClient.get<any[]>(`/public/categories/${categoryId}/attributes`);
  },

  async createProduct(product: Partial<Product>): Promise<Product> {
    return normalizeProduct(await apiClient.postAuth<Product>("/admin/products", product));
  },

  async uploadProductImage(file: File, folder = "products"): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    const result = await apiClient.uploadAuth<{ url: string }>("/admin/products/images/upload", formData);
    if (!result?.url) {
      throw new Error("Server không trả về URL ảnh.");
    }
    return result.url;
  },

  async updateProduct(id: string | number, product: Partial<Product>): Promise<Product> {
    return normalizeProduct(await apiClient.putAuth<Product>(`/admin/products/${id}`, product));
  },

  async deleteProduct(id: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/products/${id}`);
  },

  // Category Admin
  async createCategory(category: any): Promise<any> {
    return await apiClient.postAuth("/admin/categories", category);
  },

  async updateCategory(id: string | number, category: any): Promise<any> {
    return await apiClient.putAuth(`/admin/categories/${id}`, category);
  },

  async deleteCategory(id: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/categories/${id}`);
  },

  // Brand Admin
  async createBrand(brand: any): Promise<any> {
    return await apiClient.postAuth("/admin/brands", brand);
  },

  async updateBrand(id: string | number, brand: any): Promise<any> {
    return await apiClient.putAuth(`/admin/brands/${id}`, brand);
  },

  async deleteBrand(id: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/brands/${id}`);
  },

  // Attribute Admin
  async listAttributes(): Promise<any[]> {
    const data = await apiClient.get<any[] | { content?: any[]; data?: any[] }>("/admin/attributes", { requireAuth: true });
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      const record = data as Record<string, any>;
      if (Array.isArray(record.data)) return record.data;
      if (Array.isArray(record.content)) return record.content;
    }
    return [];
  },

  async createAttribute(attribute: any): Promise<any> {
    return await apiClient.postAuth("/admin/attributes", attribute);
  },

  async updateAttribute(id: string | number, attribute: any): Promise<any> {
    return await apiClient.putAuth(`/admin/attributes/${id}`, attribute);
  },

  async deleteAttribute(id: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/attributes/${id}`);
  },

  async assignAttributeToCategory(categoryId: string | number, mapping: any): Promise<any> {
    return await apiClient.postAuth(`/admin/categories/${categoryId}/attributes`, mapping);
  },

  async removeAttributeFromCategory(categoryId: string | number, attributeId: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/categories/${categoryId}/attributes/${attributeId}`);
  },

  // Wishlist API
  async getWishlist(): Promise<Product[]> {
    const data = await apiClient.get<unknown>("/wishlist", { requireAuth: true });
    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeProduct);
  },

  async addToWishlist(productId: string | number): Promise<void> {
    await apiClient.postAuth(`/wishlist/${productId}`);
  },

  async removeFromWishlist(productId: string | number): Promise<void> {
    await apiClient.deleteAuth(`/wishlist/${productId}`);
  },

  // Review API
  async createReview(review: { productId: number | string; rating: number; comment: string; imageUrls?: string[]; orderId?: number | string }): Promise<any> {
    return await apiClient.postAuth("/products/reviews", review);
  },

  async getMyReviews(): Promise<any[]> {
    const data = await apiClient.get<any[]>("/products/reviews/me", { requireAuth: true });
    return Array.isArray(data) ? data : [];
  },

  async getReviews(productId: string | number): Promise<any[]> {
    const data = await apiClient.get<any[]>(`/public/products/${productId}/reviews`);
    return Array.isArray(data) ? data : [];
  },

  // Review Image Upload
  async uploadReviewImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const result = await apiClient.uploadAuth<{ url: string }>("/products/reviews/images/upload", formData);
    if (!result?.url) {
      throw new Error("Server không trả về URL ảnh.");
    }
    return result.url;
  },

  // Admin/Staff Review Reply
  async getAdminReviews(page = 0, size = 10): Promise<any> {
    return await apiClient.get<any>(`/admin/reviews?page=${page}&size=${size}`, { requireAuth: true });
  },

  async replyToReview(reviewId: string | number, content: string): Promise<any> {
    return await apiClient.postAuth(`/admin/reviews/${reviewId}/reply`, { content });
  }
};
