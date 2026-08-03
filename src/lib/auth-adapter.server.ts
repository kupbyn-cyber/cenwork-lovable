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
  /** Bổ sung dữ liệu hệ thống bắt buộc còn thiếu (idempotent). */
  ensureSystemDefaults(): Promise<void>;
  /** Xác nhận dữ liệu hệ thống đã đầy đủ (catalog + cấu hình 4 role + app_settings). */
  verifySystemDefaults(): Promise<void>;
  /** Xác nhận Admin đầu tiên có role admin, system owner và đủ quyền tối thiểu. */
  verifyAdminBootstrap(userId: string): Promise<void>;
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

    /**
     * Database mới sau Remix có thể thiếu permission_catalog / role_permission_config /
     * app_settings. Hàm DB `ensure_system_defaults` chỉ bổ sung phần thiếu, không ghi đè.
     */
    async ensureSystemDefaults() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.rpc("ensure_system_defaults");
      if (error) throw new Error("Không khởi tạo được dữ liệu hệ thống mặc định.");
      // Danh mục vận hành (Trực nhật): thiếu thì dropdown trống sau khi remix.
      const { error: catalogError } = await supabaseAdmin.rpc("ensure_catalog_defaults");
      if (catalogError) throw new Error("Không khởi tạo được danh mục mặc định.");
    },

    /**
     * Chặn thiết lập nếu database mới còn thiếu danh mục quyền / cấu hình 4 vai trò /
     * app_settings bắt buộc — tránh tạo Admin không có quyền hiệu lực.
     */
    async verifySystemDefaults() {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("verify_system_defaults");
      const report = data as { ok?: boolean } | null;
      if (error || !report?.ok) {
        throw new Error("Dữ liệu hệ thống bắt buộc chưa đầy đủ. Không thể tạo quản trị viên.");
      }
    },

    /** Sau khi tạo Admin: xác nhận quyền tối thiểu thực sự hoạt động. */
    async verifyAdminBootstrap(userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("verify_admin_bootstrap", { _user: userId });
      const report = data as { ok?: boolean } | null;
      if (error || !report?.ok) {
        throw new Error("Tài khoản quản trị chưa nhận đủ quyền hệ thống.");
      }
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
