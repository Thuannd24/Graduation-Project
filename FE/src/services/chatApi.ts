import { apiClient } from "./apiClient.ts";

export interface ChatRoomResponse {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerAvatar?: string;
  staffId?: string;
  staffName?: string;
  status: "AI_CHAT" | "WAITING" | "ACTIVE" | "CLOSED";
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface ChatMessageResponse {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: "CUSTOMER" | "STAFF" | "AI";
  content: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
}

export const chatApi = {
  // --- CUSTOMER / GUEST APIs ---
  getOrCreateRoom: async (guestId?: string, guestName?: string): Promise<ChatRoomResponse> => {
    const headers: Record<string, string> = {};
    if (guestId) {
      headers["X-Guest-Id"] = guestId;
    }
    if (guestName) {
      headers["X-Guest-Name"] = guestName;
    }
    return apiClient.get<ChatRoomResponse>("/public/chat/rooms", {
      method: "POST",
      headers
    });
  },

  getMyRoom: async (guestId?: string): Promise<ChatRoomResponse> => {
    const headers: Record<string, string> = {};
    if (guestId) {
      headers["X-Guest-Id"] = guestId;
    }
    return apiClient.get<ChatRoomResponse>("/public/chat/rooms/my", {
      headers
    });
  },

  getMyMessages: async (roomId: string, guestId?: string, page = 0, size = 20): Promise<PageResponse<ChatMessageResponse>> => {
    const headers: Record<string, string> = {};
    if (guestId) {
      headers["X-Guest-Id"] = guestId;
    }
    return apiClient.get<PageResponse<ChatMessageResponse>>(
      `/public/chat/rooms/${roomId}/messages?page=${page}&size=${size}`,
      { headers }
    );
  },

  closeMyRoom: async (roomId: string, guestId?: string): Promise<ChatRoomResponse> => {
    const headers: Record<string, string> = {};
    if (guestId) {
      headers["X-Guest-Id"] = guestId;
    }
    return apiClient.get<ChatRoomResponse>(`/public/chat/rooms/${roomId}/close`, {
      method: "PUT",
      headers
    });
  },

  handoverToStaff: async (roomId: string): Promise<ChatRoomResponse> => {
    return apiClient.get<ChatRoomResponse>(`/public/chat/rooms/${roomId}/handover`, {
      method: "PUT"
    });
  },

  // --- STAFF / ADMIN APIs ---
  getRoomsByStatus: async (status: string, page = 0, size = 20): Promise<PageResponse<ChatRoomResponse>> => {
    return apiClient.get<PageResponse<ChatRoomResponse>>(
      `/admin/chat/rooms?status=${status}&page=${page}&size=${size}`,
      { requireAuth: true }
    );
  },

  getMyAssignedRooms: async (page = 0, size = 20): Promise<PageResponse<ChatRoomResponse>> => {
    return apiClient.get<PageResponse<ChatRoomResponse>>(
      `/admin/chat/rooms/my-assigned?page=${page}&size=${size}`,
      { requireAuth: true }
    );
  },

  assignRoom: async (roomId: string): Promise<ChatRoomResponse> => {
    return apiClient.get<ChatRoomResponse>(`/admin/chat/rooms/${roomId}/assign`, {
      method: "PUT",
      requireAuth: true
    });
  },

  closeRoom: async (roomId: string): Promise<ChatRoomResponse> => {
    return apiClient.get<ChatRoomResponse>(`/admin/chat/rooms/${roomId}/close`, {
      method: "PUT",
      requireAuth: true
    });
  },

  getRoomMessages: async (roomId: string, page = 0, size = 20): Promise<PageResponse<ChatMessageResponse>> => {
    return apiClient.get<PageResponse<ChatMessageResponse>>(
      `/admin/chat/rooms/${roomId}/messages?page=${page}&size=${size}`,
      { requireAuth: true }
    );
  }
};
