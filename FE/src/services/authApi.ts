import { apiClient } from "./apiClient";

export interface AuthUser {
  id: string | number;
  userId?: string | number;
  email?: string;
  username?: string;
  name?: string;
  fullName?: string;
  role?: string;
  roles?: string[];
  loyaltyPoints?: number;
  customerTier?: string;
}

export interface LoyaltyTransaction {
  id: number;
  delta: number;
  balanceAfter: number;
  sourceType?: string;
  description?: string;
  createdAt?: string;
}

export interface RedeemPreview {
  currentBalance: number;
  maxRedeemablePoints: number;
  maxDiscountAmount: number;
  vndPerPoint: number;
}

export const authApi = {
  me(): Promise<AuthUser> {
    return apiClient.get<AuthUser>("/users/me", { requireAuth: true });
  },

  getPublicProfile(keycloakUserId: string): Promise<AuthUser> {
    return apiClient.get<AuthUser>(`/users/public/${keycloakUserId}`);
  },

  updateProfile(payload: { fullName?: string; phoneNumber?: string }): Promise<AuthUser> {
    return apiClient.putAuth<AuthUser>("/users/me", payload);
  },

  getAddresses(): Promise<any[]> {
    return apiClient.get<any[]>("/users/me/addresses", { requireAuth: true });
  },

  addAddress(address: { recipientName: string; phoneNumber: string; province: string; districtWard: string; detailAddress: string; isDefault: boolean }): Promise<any> {
    return apiClient.postAuth("/users/me/addresses", address);
  },

  deleteAddress(id: string | number): Promise<void> {
    return apiClient.deleteAuth(`/users/me/addresses/${id}`);
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Admin User Management
  // ──────────────────────────────────────────────────────────────────────────

  async adminSearchUsers(params: {
    search?: string;
    tier?: string;
    blacklisted?: boolean;
    active?: boolean;
    page?: number;
    size?: number;
  }): Promise<{ content: any[]; totalPages: number; totalElements: number }> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.tier) query.set("tier", params.tier);
    if (params.blacklisted !== undefined) query.set("blacklisted", String(params.blacklisted));
    if (params.active !== undefined) query.set("active", String(params.active));
    query.set("page", String(params.page ?? 0));
    query.set("size", String(params.size ?? 20));
    const result = await apiClient.get<any>(`/admin/users?${query.toString()}`, { requireAuth: true });
    return {
      content: Array.isArray(result?.content) ? result.content : [],
      totalPages: Number(result?.totalPages ?? 1),
      totalElements: Number(result?.totalElements ?? 0)
    };
  },

  async adminCreateUser(payload: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    phoneNumber?: string;
    customerTier?: string;
  }): Promise<any> {
    return apiClient.postAuth("/admin/users", payload);
  },

  async adminUpdateUser(userId: string | number, payload: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    customerTier?: string;
    avatarUrl?: string;
  }): Promise<any> {
    return apiClient.putAuth(`/admin/users/${userId}`, payload);
  },

  async adminDeleteUser(userId: string | number): Promise<void> {
    await apiClient.deleteAuth(`/admin/users/${userId}`);
  },

  async adminToggleBlacklist(userId: string | number, blacklist: boolean): Promise<void> {
    await apiClient.putAuth(`/admin/users/${userId}/blacklist`, {
      blacklisted: blacklist,
      reason: "Yêu cầu hành chính từ trang quản trị Admin"
    });
  },

  async adminUpdateTier(userId: string | number, tier: string): Promise<void> {
    await apiClient.putAuth(`/admin/users/${userId}/tier`, { tier });
  },

  async adminResetPassword(userId: string | number, newPassword: string): Promise<void> {
    await apiClient.putAuth(`/admin/users/${userId}/reset-password`, { newPassword });
  },

  async adminGetAllRoles(): Promise<any[]> {
    const result = await apiClient.get<any>(`/admin/users/roles`, { requireAuth: true });
    return Array.isArray(result) ? result : [];
  },

  async adminGetUserRoles(userId: string | number): Promise<string[]> {
    const result = await apiClient.get<any>(`/admin/users/${userId}/roles`, { requireAuth: true });
    return Array.isArray(result) ? result : [];
  },

  async adminSetUserRoles(userId: string | number, roles: string[]): Promise<void> {
    await apiClient.putAuth(`/admin/users/${userId}/roles`, { roles });
  },

  async adminGetUserStats(): Promise<{
    totalUsers: number;
    blacklistedUsers: number;
    activeUsers: number;
    tierDistribution: Record<string, number>;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
  }> {
    return apiClient.get<any>(`/admin/users/stats`, { requireAuth: true });
  },

  getProvinces(): Promise<any[]> {
    return apiClient.get<any[]>("/public/locations/provinces");
  },

  getWards(provinceCode: number | string): Promise<any[]> {
    return apiClient.get<any[]>(`/public/locations/provinces/${provinceCode}/wards`);
  },

  getLoyaltyPoints(): Promise<number> {
    return apiClient.get<number>("/users/me/loyalty/points", { requireAuth: true });
  },

  getLoyaltyHistory(page = 0, size = 20): Promise<{ content: LoyaltyTransaction[]; totalPages: number }> {
    return apiClient.get<any>(`/users/me/loyalty/history?page=${page}&size=${size}`, { requireAuth: true })
      .then((result) => ({
        content: Array.isArray(result?.content) ? result.content : [],
        totalPages: Number(result?.totalPages ?? 1)
      }));
  },

  previewLoyaltyRedeem(orderAmount: number): Promise<RedeemPreview> {
    return apiClient.postAuth<RedeemPreview>("/users/me/loyalty/redeem-preview", { orderAmount });
  }
};
