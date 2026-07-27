// Tạo user thật trong Keycloak cho nhóm "10 user demo" (đăng nhập được qua UI thật), khác với
// 490 user còn lại chỉ tồn tại trong DB làm "dân số thống kê" cho train model (xem Phase 3 trong
// docs/canvas/churn-risk-implementation-plan.md).
//
// Dùng admin-cli + tài khoản admin/admin của MASTER realm (default của Keycloak, xem
// BE/docker-compose-infra.yml: KEYCLOAK_ADMIN=admin/KEYCLOAK_ADMIN_PASSWORD=admin) thay vì
// client "ecommerce-backend" của app — tránh phải biết KEYCLOAK_ADMIN_CLIENT_SECRET (secret
// runtime không có trong repo), admin-cli theo mặc định luôn được Keycloak cấp quyền quản lý
// mọi realm.

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8083";
const REALM = process.env.KEYCLOAK_REALM || "ecommerce-realm";

export async function getAdminToken() {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: process.env.KEYCLOAK_ADMIN_USER || "admin",
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
    }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak admin login failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/** Trả về { keycloakUserId, created: boolean }. Idempotent: nếu username đã tồn tại thì tra
 * cứu lại id có sẵn thay vì lỗi. */
export async function ensureKeycloakUser(token, { username, email, firstName, lastName, password }) {
  const createRes = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: password, temporary: false }],
    }),
  });

  if (createRes.status === 201) {
    const location = createRes.headers.get("location");
    const keycloakUserId = location.split("/").pop();
    return { keycloakUserId, created: true };
  }

  if (createRes.status === 409) {
    // Đã tồn tại (chạy lại script) -> tra cứu lại id theo username.
    const searchRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const found = await searchRes.json();
    if (found.length === 0) {
      throw new Error(`Keycloak báo user '${username}' đã tồn tại (409) nhưng tìm lại không thấy`);
    }
    return { keycloakUserId: found[0].id, created: false };
  }

  throw new Error(`Tạo Keycloak user '${username}' thất bại (${createRes.status}): ${await createRes.text()}`);
}
