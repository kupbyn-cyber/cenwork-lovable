/**
 * CEN-MB-01 — Phiên đăng nhập do máy chủ CEN quản lý.
 * Cookie HttpOnly chỉ chứa token ngẫu nhiên; database lưu bản băm SHA-256.
 * Đăng xuất / khóa tài khoản làm phiên mất hiệu lực ngay lập tức.
 */
import { createHash, randomBytes } from "node:crypto";

import { withPrivileged } from "@/db/pool.server";

export const SESSION_COOKIE = "cen_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
}

export async function issueSession(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await withPrivileged(async (client) => {
    await client.query(
      `INSERT INTO auth.sessions (user_id, token_hash, user_agent, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [userId, hashToken(token), userAgent, String(SESSION_DAYS)],
    );
    await client.query("UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1", [userId]);
  });
  return token;
}

/** Trả về người dùng của phiên còn hiệu lực, đồng thời chặn tài khoản đã bị khóa. */
export async function resolveSession(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return withPrivileged(async (client) => {
    const { rows } = await client.query<{
      user_id: string;
      email: string;
      display_name: string | null;
      must_change_password: boolean | null;
      status: string | null;
    }>(
      `SELECT s.user_id, u.email, p.display_name, p.must_change_password, p.status::text AS status
         FROM auth.sessions s
         JOIN auth.users u ON u.id = s.user_id
         LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND (u.banned_until IS NULL OR u.banned_until < now())
        LIMIT 1`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.status && row.status !== "active") return null;

    await client.query("UPDATE auth.sessions SET last_seen_at = now() WHERE token_hash = $1", [
      hashToken(token),
    ]);

    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name ?? row.email.split("@")[0] ?? "",
      mustChangePassword: row.must_change_password === true,
    } satisfies SessionUser;
  });
}

export async function revokeSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await withPrivileged(async (client) => {
    await client.query(
      "UPDATE auth.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
      [hashToken(token)],
    );
  });
}

/** Đổi mật khẩu / khóa tài khoản: hủy toàn bộ phiên hiện có của người dùng. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await withPrivileged(async (client) => {
    await client.query(
      "UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
  });
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}