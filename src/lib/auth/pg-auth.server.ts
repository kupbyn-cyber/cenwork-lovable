/**
 * CEN-MB-01 — Nghiệp vụ Auth chạy trên PostgreSQL thuần.
 * Toàn bộ kiểm tra quyền/khởi tạo hệ thống vẫn dùng đúng các function SQL sẵn có
 * (ensure_system_defaults, verify_system_defaults, bootstrap_create_admin, ...),
 * nên Business Rule không đổi khi rời hạ tầng cũ.
 */
import { withPrivileged } from "@/db/pool.server";
import type { AuthAdapter } from "@/lib/auth-adapter.server";
import { bootstrapTokenConfigured } from "@/lib/auth-adapter.server";
import { hashPassword, verifyPassword } from "@/lib/auth/password.server";
import { revokeAllSessions } from "@/lib/auth/session.server";

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ userId: string } | null> {
  const found = await withPrivileged(async (client) => {
    const { rows } = await client.query<{
      id: string;
      encrypted_password: string | null;
      banned_until: string | null;
      status: string | null;
    }>(
      `SELECT u.id, u.encrypted_password, u.banned_until, p.status::text AS status
         FROM auth.users u
         LEFT JOIN public.profiles p ON p.id = u.id
        WHERE lower(u.email) = lower($1)
        LIMIT 1`,
      [email.trim()],
    );
    return rows[0] ?? null;
  });

  // Luôn chạy một phép băm giả để thời gian phản hồi không lộ email có tồn tại hay không.
  const ok = await verifyPassword(password, found?.encrypted_password ?? null);
  if (!found || !ok) return null;
  if (found.banned_until && new Date(found.banned_until).getTime() > Date.now()) return null;
  if (found.status && found.status !== "active") return null;
  return { userId: found.id };
}

/**
 * Đặt lại mật khẩu cho chính người dùng đang đăng nhập (đã xác thực bằng phiên).
 * Không hủy phiên hiện tại để người dùng không bị đăng xuất giữa chừng.
 */
export async function setOwnPassword(userId: string, nextPassword: string): Promise<void> {
  const encrypted = await hashPassword(nextPassword);
  await withPrivileged(async (client) => {
    await client.query(
      "UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1",
      [userId, encrypted],
    );
    await client.query(
      "UPDATE public.profiles SET must_change_password = false, updated_at = now() WHERE id = $1",
      [userId],
    );
  });
}

/** Cập nhật tên hiển thị của chính người dùng đang đăng nhập. */
export async function setOwnDisplayName(userId: string, displayName: string): Promise<void> {
  await withPrivileged(async (client) => {
    await client.query(
      "UPDATE public.profiles SET display_name = $2, updated_at = now() WHERE id = $1",
      [userId, displayName],
    );
    await client.query(
      `UPDATE auth.users
          SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                   || jsonb_build_object('display_name', $2::text),
              updated_at = now()
        WHERE id = $1`,
      [userId, displayName],
    );
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const current = await withPrivileged(async (client) => {
    const { rows } = await client.query<{ encrypted_password: string | null }>(
      "SELECT encrypted_password FROM auth.users WHERE id = $1",
      [userId],
    );
    return rows[0]?.encrypted_password ?? null;
  });
  if (!(await verifyPassword(currentPassword, current))) {
    throw new Error("Mật khẩu hiện tại không đúng.");
  }

  const encrypted = await hashPassword(nextPassword);
  await withPrivileged(async (client) => {
    await client.query(
      "UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1",
      [userId, encrypted],
    );
    await client.query(
      "UPDATE public.profiles SET must_change_password = false, updated_at = now() WHERE id = $1",
      [userId],
    );
  });
  // Đổi mật khẩu là vô hiệu mọi phiên cũ (kể cả thiết bị khác).
  await revokeAllSessions(userId);
}

/** Adapter dùng chung với luồng /setup: cùng interface, thay hạ tầng bên dưới. */
export function createPostgresAuthAdapter(): AuthAdapter {
  return {
    async readBootstrapState() {
      return withPrivileged(async (client) => {
        const { rows } = await client.query<{ owners: string; admins: string }>(
          `SELECT
             (SELECT count(*) FROM public.system_owners) AS owners,
             (SELECT count(*) FROM public.user_roles r
                JOIN public.profiles p ON p.id = r.user_id
               WHERE r.role = 'admin' AND p.status = 'active') AS admins`,
        );
        return {
          hasSystemOwner: Number(rows[0]?.owners ?? 0) > 0,
          hasActiveAdmin: Number(rows[0]?.admins ?? 0) > 0,
          bootstrapEnabled: bootstrapTokenConfigured(),
        };
      });
    },

    async ensureSystemDefaults() {
      await withPrivileged(async (client) => {
        await client.query("SELECT public.ensure_system_defaults()");
        await client.query("SELECT public.ensure_catalog_defaults()");
      });
    },

    async verifySystemDefaults() {
      const report = await withPrivileged(async (client) => {
        const { rows } = await client.query<{ report: { ok?: boolean } }>(
          "SELECT public.verify_system_defaults() AS report",
        );
        return rows[0]?.report ?? null;
      });
      if (!report?.ok) {
        throw new Error("Dữ liệu hệ thống bắt buộc chưa đầy đủ. Không thể tạo quản trị viên.");
      }
    },

    async verifyAdminBootstrap(userId) {
      const report = await withPrivileged(async (client) => {
        const { rows } = await client.query<{ report: { ok?: boolean } }>(
          "SELECT public.verify_admin_bootstrap($1) AS report",
          [userId],
        );
        return rows[0]?.report ?? null;
      });
      if (!report?.ok) throw new Error("Tài khoản quản trị chưa nhận đủ quyền hệ thống.");
    },

    async createBootstrapUser({ email, password, displayName }) {
      const encrypted = await hashPassword(password);
      try {
        return await withPrivileged(async (client) => {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
             VALUES ($1, $2, jsonb_build_object('display_name', $3::text), now())
             RETURNING id`,
            [email.trim(), encrypted, displayName],
          );
          return { userId: rows[0]!.id };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        throw new Error(
          message.includes("users_email_lower_key")
            ? "Email này đã tồn tại trong hệ thống."
            : "Không tạo được tài khoản quản trị.",
        );
      }
    },

    async createProfileAndAssignSystemOwner({ userId, email, displayName }) {
      try {
        await withPrivileged(async (client) => {
          await client.query("SELECT public.bootstrap_create_admin($1, $2, $3)", [
            userId,
            displayName,
            email.trim(),
          ]);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("BOOTSTRAP_LOCKED")) throw new Error("BOOTSTRAP_LOCKED");
        throw new Error("Không hoàn tất được thiết lập quản trị.");
      }
    },

    async deleteUser(userId) {
      await withPrivileged(async (client) => {
        await client.query("DELETE FROM auth.users WHERE id = $1", [userId]);
      });
    },

    verifyCredentials: ({ email, password }) => verifyCredentials(email, password),
  };
}