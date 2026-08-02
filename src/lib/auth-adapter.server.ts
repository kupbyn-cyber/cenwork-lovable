/**
 * AUTH-PORTABLE-01 — Auth Adapter.
 *
 * Lớp trừu tượng cho mọi thao tác Auth ở phía máy chủ, để sau này có thể thay
 * Supabase Auth bằng PostgreSQL Auth mà không phải sửa UI /setup.
 * File *.server.ts nên không bao giờ lọt vào bundle trình duyệt.
 */

export interface BootstrapState {
  hasSystemOwner: boolean;
  hasActiveAdmin: boolean;
  bootstrapEnabled: boolean;
}

export interface AuthAdapter {
  /** Trạng thái để quyết định setup_required. */
  readBootstrapState(): Promise<BootstrapState>;
  /** Tạo user ở tầng Auth (chưa có quyền gì). */
  createBootstrapUser(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ userId: string }>;
  /** Tạo/kiện toàn hồ sơ + gán Admin + đánh dấu System Owner (atomic ở DB). */
  createProfileAndAssignSystemOwner(input: {
    userId: string;
    email: string;
    displayName: string;
  }): Promise<void>;
  /** Bù trừ khi bước sau thất bại: không để lại user mồ côi. */
  deleteUser(userId: string): Promise<void>;
  /** Dành cho backend tự quản lý phiên trong tương lai. */
  verifyCredentials?(input: { email: string; password: string }): Promise<{ userId: string } | null>;
  createSession?(userId: string): Promise<{ accessToken: string; refreshToken: string }>;
}

/** So sánh chuỗi theo thời gian hằng số, tránh timing attack. */
export function safeCompare(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Token bootstrap chỉ tồn tại ở máy chủ, không bao giờ trả về client. */
export function bootstrapTokenConfigured(): boolean {
  const token = process.env["CEN_BOOTSTRAP_TOKEN"];
  return typeof token === "string" && token.trim().length >= 12;
}

export function verifyBootstrapToken(candidate: string): boolean {
  const token = process.env["CEN_BOOTSTRAP_TOKEN"];
  if (!token || token.trim().length < 12) return false;
  return safeCompare(token.trim(), candidate.trim());
}

export function createSupabaseAuthAdapter(): AuthAdapter {
  return {
    async readBootstrapState() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const owners = await supabaseAdmin
        .from("system_owners")
        .select("user_id", { count: "exact", head: true });
      if (owners.error) throw new Error("Không đọc được trạng thái hệ thống.");

      const adminRoles = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRoles.error) throw new Error("Không đọc được trạng thái hệ thống.");

      let hasActiveAdmin = false;
      const adminIds = (adminRoles.data ?? []).map((row) => row.user_id);
      if (adminIds.length > 0) {
        const actives = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("id", adminIds)
          .eq("status", "active");
        if (actives.error) throw new Error("Không đọc được trạng thái hệ thống.");
        hasActiveAdmin = (actives.count ?? 0) > 0;
      }

      return {
        hasSystemOwner: (owners.count ?? 0) > 0,
        hasActiveAdmin,
        bootstrapEnabled: bootstrapTokenConfigured(),
      };
    },

    async createBootstrapUser({ email, password, displayName }) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error || !data.user) {
        throw new Error(
          error?.message.includes("already")
            ? "Email này đã tồn tại trong hệ thống."
            : "Không tạo được tài khoản quản trị.",
        );
      }
      return { userId: data.user.id };
    },

    async createProfileAndAssignSystemOwner({ userId, email, displayName }) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.rpc("bootstrap_create_admin", {
        _user: userId,
        _display_name: displayName,
        _email: email,
      });
      if (error) {
        if (error.message.includes("BOOTSTRAP_LOCKED")) {
          throw new Error("BOOTSTRAP_LOCKED");
        }
        throw new Error("Không hoàn tất được thiết lập quản trị.");
      }
    },

    async deleteUser(userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(userId);
    },
  };
}
