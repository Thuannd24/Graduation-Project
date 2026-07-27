import crypto from "node:crypto";
import { query, bulkInsert, DB } from "./db.mjs";
import { getAdminToken, ensureKeycloakUser } from "./keycloak.mjs";

// Marker để nhận diện + dọn dẹp user tổng hợp sau này (xem cleanup.mjs) — KHÔNG dùng để encode
// vào keycloak_user_id (cột đó cần giữ dạng UUID hợp lệ, unique).
const SYNTHETIC_EMAIL_DOMAIN = "seed.internal";

/** X-User-Id trong toàn hệ thống là Keycloak UUID (sub claim), KHÔNG phải users.id nội bộ — xem
 * BE/api-gateway/.../UserHeaderFilter.java. Vì vậy user tổng hợp (không có tài khoản Keycloak
 * thật) vẫn cần 1 UUID hợp lệ cho `keycloak_user_id` để orders/user_events tham chiếu đúng. */
export async function ensureSeedUsers(count, demoCount, { dryRun = false } = {}) {
  const users = [];

  if (demoCount > 0 && !dryRun) {
    const token = await getAdminToken();
    for (let i = 0; i < demoCount; i++) {
      const username = `demo_user_${i + 1}`;
      const { keycloakUserId, created } = await ensureKeycloakUser(token, {
        username,
        email: `${username}@demo.local`,
        firstName: "Demo",
        lastName: `User ${i + 1}`,
        password: "Demo@12345",
      });
      users.push({
        keycloakUserId,
        username,
        email: `${username}@demo.local`,
        fullName: `Demo User ${i + 1}`,
        isDemo: true,
        justCreated: created,
      });
    }
  } else if (demoCount > 0) {
    // --dry-run: không gọi Keycloak thật, chỉ mô phỏng để in thống kê.
    for (let i = 0; i < demoCount; i++) {
      users.push({
        keycloakUserId: crypto.randomUUID(),
        username: `demo_user_${i + 1}`,
        email: `demo_user_${i + 1}@demo.local`,
        fullName: `Demo User ${i + 1}`,
        isDemo: true,
        justCreated: true,
      });
    }
  }

  for (let i = 0; i < count - demoCount; i++) {
    const idx = i + 1;
    users.push({
      keycloakUserId: crypto.randomUUID(),
      username: `seed_user_${idx}`,
      email: `seed_user_${idx}@${SYNTHETIC_EMAIL_DOMAIN}`,
      fullName: `Seed User ${idx}`,
      isDemo: false,
      justCreated: true,
    });
  }

  if (dryRun) return users;

  // Chỉ insert user chưa tồn tại (idempotent: user demo có thể đã có từ lần chạy trước).
  const toInsert = users.filter((u) => u.justCreated);
  if (toInsert.length > 0) {
    const now = new Date();
    const rows = toInsert.map((u) => [
      u.keycloakUserId,
      u.username,
      u.email,
      u.fullName,
      "MEMBER",
      false,
      0,
      true,
      now,
      now,
    ]);
    await bulkInsert(
      `${DB.USER}.users`,
      [
        "keycloak_user_id",
        "username",
        "email",
        "full_name",
        "customer_tier",
        "is_blacklisted",
        "loyalty_points",
        "active",
        "created_at",
        "updated_at",
      ],
      rows
    );
  }

  return users;
}

export async function countExistingSeedUsers() {
  const rows = await query(
    `SELECT COUNT(*) AS cnt FROM ${DB.USER}.users WHERE email LIKE ?`,
    [`%@${SYNTHETIC_EMAIL_DOMAIN}`]
  );
  return rows[0].cnt;
}

export { SYNTHETIC_EMAIL_DOMAIN };
