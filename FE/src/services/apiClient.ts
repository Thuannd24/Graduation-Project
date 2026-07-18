import keycloak from "./keycloak";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";
const AUTH_TOKEN_KEY = "techstore_auth_token";
const AUTH_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

export function getAuthToken(): string | null {
  if (keycloak.authenticated && keycloak.token) {
    return keycloak.token;
  }
  return null;
}

export function setAuthToken(_token: string): void {
  // Token chỉ do Keycloak quản lý in-memory — không persist localStorage.
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (keycloak.authenticated) {
    keycloak.clearToken();
  }
}

export function hasAuthToken(): boolean {
  return Boolean(getAuthToken());
}

function stringifyErrorValue(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];

  if (Array.isArray(value)) {
    return value.flatMap((item) => stringifyErrorValue(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.message === "string") return [record.message];
    if (typeof record.defaultMessage === "string") return [record.defaultMessage];
    if (typeof record.reason === "string") return [record.reason];
    if (typeof record.error === "string") return [record.error];

    return Object.entries(record).flatMap(([key, item]) => {
      const messages = stringifyErrorValue(item);
      return messages.map((message) => {
        if (["message", "messages", "errors", "error", "data"].includes(key)) return message;
        return `${key}: ${message}`;
      });
    });
  }

  return [];
}

function getApiErrorMessage(payload: unknown, status: number): string {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rawMessage = typeof record?.message === "string" ? record.message.trim() : "";
  const hasGenericValidationMessage = rawMessage.toLowerCase() === "validation error";
  const messages = [
    ...(hasGenericValidationMessage ? [] : stringifyErrorValue(record?.message)),
    ...stringifyErrorValue(record?.data),
    ...stringifyErrorValue(record?.errors),
    ...stringifyErrorValue(record?.error)
  ].filter(Boolean);

  const uniqueMessages = Array.from(new Set(messages));
  if (uniqueMessages.length > 0) {
    return uniqueMessages.join(" ");
  }

  if (hasGenericValidationMessage) {
    return "Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại các trường thông tin.";
  }

  return `Yêu cầu thất bại. Mã lỗi HTTP ${status}.`;
}

async function request<T>(path: string, options: RequestInit & { requireAuth?: boolean } = {}): Promise<T> {
  if (options.requireAuth && !hasAuthToken()) {
    throw new Error("Vui lòng đăng nhập để tiếp tục.");
  }

  // Try to refresh token if using Keycloak and token is close to expiry
  if (keycloak.authenticated) {
    try {
      await new Promise<boolean>((resolve, reject) => {
        keycloak.updateToken(30)
          .then((refreshed) => {
            if (refreshed) {
              if (keycloak.token) {
                setAuthToken(keycloak.token);
              }
            }
            resolve(refreshed);
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (err) {
      console.warn("Keycloak token refresh warning:", err);
      // Proceed with current token; if it's actually invalid/expired, the API call will return 401
      // and trigger the standard 401 redirect flow.
    }
  }

  const token = getAuthToken();
  const { requireAuth: _requireAuth, headers: customHeaders, ...requestOptions } = options;
  const url = `${API_BASE_URL}${path}`;
  // FormData (upload ảnh) phải để trình duyệt tự set Content-Type kèm boundary multipart —
  // KHÔNG ép application/json, nếu không server không parse được file.
  const isFormData = typeof FormData !== "undefined" && requestOptions.body instanceof FormData;

  const response = await fetch(url, {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(customHeaders as Record<string, string> || {})
    },
    ...requestOptions
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false || payload?.code === "ERROR") {
    console.error("API error", {
      url,
      status: response.status,
      requestBody: requestOptions.body,
      response: payload
    });

    if (response.status === 401 || payload?.status === 401) {
      clearAuthToken();
      localStorage.setItem("techstore_auth_message", AUTH_EXPIRED_MESSAGE);
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
      throw new Error(AUTH_EXPIRED_MESSAGE);
    }

    throw new Error(getApiErrorMessage(payload, response.status));
  }

  // Validation endpoint returns code VALIDATION_FAILED with the result in data
  // (valid=false + errors[]) — not an HTTP error, must unwrap for the UI.
  if (payload?.code === "VALIDATION_FAILED" && payload.data != null) {
    return payload.data as T;
  }

  if (payload && (payload.code === "SUCCESS" || typeof payload.success === "boolean")) {
    return payload.data as T;
  }

  return payload as T;
}

export const apiClient = {
  request,
  get: <T>(path: string, options?: RequestInit & { requireAuth?: boolean }) => request<T>(path, options),
  post: <T, B = unknown>(path: string, body?: B) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  postForm: <T>(path: string, formData: FormData, options?: { requireAuth?: boolean }) =>
    request<T>(path, {
      method: "POST",
      body: formData,
      requireAuth: options?.requireAuth
    }),
  postAuth: <T, B = unknown>(path: string, body?: B) =>
    request<T>(path, {
      method: "POST",
      requireAuth: true,
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  patch: <T, B = unknown>(path: string, body: B) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  patchAuth: <T, B = unknown>(path: string, body: B) =>
    request<T>(path, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(body)
    }),
  put: <T, B = unknown>(path: string, body?: B) =>
    request<T>(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  putAuth: <T, B = unknown>(path: string, body?: B) =>
    request<T>(path, {
      method: "PUT",
      requireAuth: true,
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  delete: <T>(path: string) =>
    request<T>(path, {
      method: "DELETE"
    }),
  deleteAuth: <T>(path: string) =>
    request<T>(path, {
      method: "DELETE",
      requireAuth: true
    }),
  uploadAuth: async <T>(path: string, formData: FormData): Promise<T> => {
    if (!hasAuthToken()) {
      throw new Error("Vui lòng đăng nhập để tiếp tục.");
    }

    const token = getAuthToken();
    const url = `${API_BASE_URL}${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.success === false || payload?.code === "ERROR") {
      if (response.status === 401 || payload?.status === 401) {
        clearAuthToken();
        localStorage.setItem("techstore_auth_message", AUTH_EXPIRED_MESSAGE);
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
        throw new Error(AUTH_EXPIRED_MESSAGE);
      }
      throw new Error(getApiErrorMessage(payload, response.status));
    }

    if (payload && (payload.code === "SUCCESS" || typeof payload.success === "boolean")) {
      return payload.data as T;
    }

    return payload as T;
  }
};
