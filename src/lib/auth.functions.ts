import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * CEN-MB-01 — Server function cho Auth tự quản (PostgreSQL + cookie phiên).
 * Không trả token/hash về client; cookie phiên là HttpOnly.
 */

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z
    .string()
    .min(8, "Mật khẩu tối thiểu 8 ký tự.")
    .max(72)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Mật khẩu phải gồm cả chữ và số."),
});

const setPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Mật khẩu tối thiểu 8 ký tự.")
    .max(72)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Mật khẩu phải gồm cả chữ và số."),
});

const displayNameSchema = z.object({
  displayName: z.string().trim().min(1, "Vui lòng nhập tên hiển thị.").max(80),
});

export const cenSetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => setPasswordSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const { setOwnPassword } = await import("@/lib/auth/pg-auth.server");

    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
    await setOwnPassword(session.userId, data.password);
    return { ok: true as const };
  });

export const cenSetDisplayName = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => displayNameSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const { setOwnDisplayName } = await import("@/lib/auth/pg-auth.server");

    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");
    await setOwnDisplayName(session.userId, data.displayName);
    return { ok: true as const };
  });

export const cenLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { setCookie } = await import("@tanstack/react-start/server");
    const { verifyCredentials } = await import("@/lib/auth/pg-auth.server");
    const { issueSession, sessionCookieOptions, SESSION_COOKIE } = await import(
      "@/lib/auth/session.server"
    );

    const found = await verifyCredentials(data.email, data.password);
    if (!found) throw new Error("Email hoặc mật khẩu không đúng.");

    const token = await issueSession(found.userId, getRequestHeader("user-agent") ?? null);
    setCookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { ok: true as const };
  });

export const cenLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { getCookie, deleteCookie } = await import("@tanstack/react-start/server");
  const { revokeSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");

  await revokeSession(getCookie(SESSION_COOKIE));
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true as const };
});

export const cenCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");

  const user = await resolveSession(getCookie(SESSION_COOKIE));
  return user ? { user } : { user: null };
});

export const cenChangePassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => changePasswordSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCookie, deleteCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const { changePassword } = await import("@/lib/auth/pg-auth.server");

    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) throw new Error("Phiên đăng nhập đã hết hạn.");

    await changePassword(session.userId, data.currentPassword, data.newPassword);
    // Đổi mật khẩu hủy mọi phiên: buộc đăng nhập lại trên mọi thiết bị.
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true as const };
  });