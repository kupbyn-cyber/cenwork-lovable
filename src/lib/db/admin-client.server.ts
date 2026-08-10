/**
 * CEN-MB-03 — Client quản trị dùng chung cho hai hạ tầng.
 *
 * Khi có DATABASE_URL (bản deploy Mắt Bão) mọi thao tác quản trị chạy thẳng
 * trên PostgreSQL do CEN sở hữu; khi không có thì dùng lại hạ tầng cũ để bản
 * xem trước hoạt động y như trước. API giữ nguyên nên nghiệp vụ không đổi.
 */
import { withPrivileged, databaseConfigured } from "@/db/pool.server";
import { hashPassword } from "@/lib/auth/password.server";
import { revokeAllSessions } from "@/lib/auth/session.server";
import { createPrivilegedDataClient } from "@/lib/db/server-client.server";

interface AdminUser {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}

interface AdminResult<T> {
  data: T;
  error: { message: string } | null;
}

async function createUser(input: {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
}): Promise<AdminResult<{ user: AdminUser | null }>> {
  try {
    const encrypted = await hashPassword(input.password);
    const user = await withPrivileged(async (client) => {
      const { rows } = await client.query<{ id: string; email: string }>(
        `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
         VALUES ($1, $2, $3::jsonb, now())
         RETURNING id, email`,
        [input.email.trim(), encrypted, JSON.stringify(input.user_metadata ?? {})],
      );
      return rows[0]!;
    });
    return {
      data: { user: { ...user, user_metadata: input.user_metadata ?? {} } },
      error: null,
    };
  } catch (error) {
    const message = (error as { code?: string; message?: string }).code === "23505"
      ? "User already registered"
      : ((error as Error).message ?? "Không tạo được tài khoản.");
    return { data: { user: null }, error: { message } };
  }
}

function banUntil(duration: string | undefined): string | null | undefined {
  if (duration === undefined) return undefined;
  if (duration === "none" || duration === "0") return null;
  const hours = Number(duration.replace(/h$/, ""));
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

async function updateUserById(
  userId: string,
  patch: {
    password?: string;
    email?: string;
    ban_duration?: string;
    user_metadata?: Record<string, unknown>;
  },
): Promise<AdminResult<{ user: AdminUser | null }>> {
  try {
    const encrypted = patch.password ? await hashPassword(patch.password) : undefined;
    const ban = banUntil(patch.ban_duration);
    const user = await withPrivileged(async (client) => {
      const { rows } = await client.query<{
        id: string;
        email: string;
        raw_user_meta_data: Record<string, unknown>;
      }>(
        `UPDATE auth.users
            SET encrypted_password = COALESCE($2, encrypted_password),
                email = COALESCE($3, email),
                banned_until = CASE WHEN $5::boolean THEN $4::timestamptz ELSE banned_until END,
                raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                                     || COALESCE($6::jsonb, '{}'::jsonb),
                updated_at = now()
          WHERE id = $1
          RETURNING id, email, raw_user_meta_data`,
        [
          userId,
          encrypted ?? null,
          patch.email ?? null,
          ban ?? null,
          ban !== undefined,
          patch.user_metadata ? JSON.stringify(patch.user_metadata) : null,
        ],
      );
      return rows[0] ?? null;
    });
    if (!user) return { data: { user: null }, error: { message: "Tài khoản không tồn tại." } };
    // Đổi mật khẩu hoặc khóa tài khoản là vô hiệu hóa mọi phiên đang mở.
    if (patch.password || (ban !== undefined && ban !== null)) await revokeAllSessions(userId);
    return {
      data: { user: { id: user.id, email: user.email, user_metadata: user.raw_user_meta_data } },
      error: null,
    };
  } catch (error) {
    return { data: { user: null }, error: { message: (error as Error).message } };
  }
}

async function getUserById(userId: string): Promise<AdminResult<{ user: AdminUser | null }>> {
  const user = await withPrivileged(async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      raw_user_meta_data: Record<string, unknown>;
    }>("SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1", [userId]);
    return rows[0] ?? null;
  });
  return {
    data: {
      user: user ? { id: user.id, email: user.email, user_metadata: user.raw_user_meta_data } : null,
    },
    error: user ? null : { message: "Tài khoản không tồn tại." },
  };
}

async function deleteUser(userId: string): Promise<AdminResult<null>> {
  try {
    await withPrivileged(async (client) => {
      await client.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: { message: (error as Error).message } };
  }
}

function createPostgresAdminClient() {
  const data = createPrivilegedDataClient();
  return {
    from: data.from,
    rpc: data.rpc,
    auth: { admin: { createUser, updateUserById, getUserById, deleteUser } },
  };
}

type LegacyAdmin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

/**
 * Trả về client quản trị phù hợp với hạ tầng đang chạy.
 * Chỉ được gọi sau khi đã xác thực người gọi ở phía máy chủ.
 */
export async function getAdminClient(): Promise<LegacyAdmin> {
  if (databaseConfigured()) {
    return createPostgresAdminClient() as unknown as LegacyAdmin;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LegacyAdmin;
}
