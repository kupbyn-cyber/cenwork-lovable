import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS, roleRequiresTeam } from "@/lib/permissions";
import { requirePermission } from "@/lib/permission-guard";

/**
 * CEN 1.0 — M1.4 server functions
 * Chỉ các thao tác bắt buộc phải chạy ở backend tin cậy:
 * tạo tài khoản Auth, đổi vai trò hệ thống, khóa/mở khóa tài khoản.
 * Mọi thao tác đọc/ghi còn lại đi qua RLS bằng client trình duyệt.
 */

const roleEnum = z.enum(["admin", "cmo", "leader", "member"]);

const createMemberSchema = z.object({
  email: z.string().trim().email().max(255),
  displayName: z.string().trim().min(1).max(80),
  jobTitle: z.enum(["Giám đốc", "Leader", "Nhân viên"]).optional().nullable(),
  role: roleEnum,
  primaryTeamId: z.string().uuid().nullable(),
  collaboratorTeamIds: z.array(z.string().uuid()).max(20).default([]),
  initialPassword: z.string().min(8).max(72),
  // Telegram User ID không bắt buộc; telegram_enabled do server quyết định.
  telegramUserId: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  // Bắt buộc: số điện thoại và ngày sinh (ngày sinh không được ở tương lai).
  phoneNumber: z
    .string()
    .trim()
    .min(1, "Số điện thoại là bắt buộc.")
    .regex(/^[0-9+][0-9 .()-]{7,19}$/, "Số điện thoại không hợp lệ."),
  birthday: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Sinh nhật không hợp lệ.")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
    }, "Ngày sinh không được lớn hơn ngày hiện tại."),
});




export const createMemberAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.MEMBERS_CREATE);

    // Leader/Member bắt buộc thuộc Team; Admin/CMO quản trị toàn hệ thống nên Team không bắt buộc.
    if (roleRequiresTeam(data.role) && !data.primaryTeamId) {
      throw new Error("Vai trò Leader và Member bắt buộc thuộc một Team chính.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.initialPassword,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (createError || !created.user) {
      throw new Error(
        createError?.message.includes("already")
          ? "Email này đã tồn tại trong hệ thống."
          : "Không tạo được tài khoản. Vui lòng thử lại.",
      );
    }

    const userId = created.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      // Không có trigger tạo profile từ auth.users, nên phải upsert (insert nếu chưa có).
      .upsert(
        {
          id: userId,
          email: data.email,
          display_name: data.displayName,
          job_title: data.jobTitle?.trim() || null,
          primary_team_id: data.primaryTeamId,
          phone_number: data.phoneNumber.trim(),
          birthday: data.birthday,
          telegram_user_id: data.telegramUserId,
          // Bắt buộc tại server: mọi tài khoản đều bật nhận thông báo Telegram.
          telegram_enabled: true,
          status: "active",
        },
        { onConflict: "id" },
      );
    if (profileError) throw new Error("Không lưu được hồ sơ thành viên.");

    // Mỗi user chỉ có đúng một system role: thay thế thay vì chèn thêm.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleError) throw new Error("Không gán được vai trò hệ thống.");

    const collaborators = data.collaboratorTeamIds.filter((id) => id !== data.primaryTeamId);
    if (collaborators.length > 0) {
      await supabaseAdmin
        .from("team_collaborators")
        .insert(collaborators.map((teamId) => ({ team_id: teamId, user_id: userId })));
    }

    return { userId };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: roleEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      PERMISSIONS.ROLES_ASSIGN,
      "Bạn không có quyền thay đổi vai trò hệ thống.",
    );
    if (data.userId === context.userId) {
      throw new Error("Không thể tự thay đổi vai trò của chính mình.");
    }
    if (roleRequiresTeam(data.role)) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("primary_team_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!profile?.primary_team_id) {
        throw new Error("Phải gán Team chính trước khi chuyển sang vai trò Leader hoặc Member.");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error("Không cập nhật được vai trò hệ thống.");
    return { ok: true };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active", "locked"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      PERMISSIONS.MEMBERS_LOCK,
      "Chỉ Admin được khóa hoặc mở khóa tài khoản.",
    );
    if (data.userId === context.userId) {
      throw new Error("Không thể tự khóa tài khoản của chính mình.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const locked = data.status === "locked";

    // Ban ở tầng Auth: chặn đăng nhập và vô hiệu hóa phiên khi token làm mới.
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: locked ? "876000h" : "none",
    });
    if (banError) throw new Error("Không cập nhật được trạng thái đăng nhập.");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw new Error("Không cập nhật được trạng thái tài khoản.");

    return { ok: true };
  });

/**
 * MEMBER-AUTH — cấp mật khẩu tạm cho Leader/Member.
 * Mật khẩu sinh ở server, trả về đúng một lần cho người gọi, không lưu plaintext,
 * không ghi vào audit log và không ghi ra console.
 */
const TEMP_PASSWORD_LENGTH = 14;

function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*?-_";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint32Array(TEMP_PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i]! % set.length] as string;
  const chars = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3)];
  for (let i = 4; i < TEMP_PASSWORD_LENGTH; i += 1) chars.push(pick(all, i));
  // Xáo trộn để ký tự bắt buộc không nằm cố định ở đầu.
  const shuffle = new Uint32Array(chars.length);
  crypto.getRandomValues(shuffle);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = shuffle[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join("");
}

export const issueTemporaryPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(
      context.supabase,
      context.userId,
      PERMISSIONS.MEMBERS_RESET_PASSWORD,
      "Chỉ Admin và CMO được cấp mật khẩu tạm.",
    );
    if (data.userId === context.userId) {
      throw new Error("Không thể tự cấp mật khẩu tạm cho chính mình.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const logAudit = async (result: "success" | "failed", reason?: string) => {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "temporary_password_reset",
        entity_type: "profiles",
        entity_id: data.userId,
        result,
        metadata: reason ? { reason } : {},
      });
    };

    const fail = async (message: string): Promise<never> => {
      await logAudit("failed", message);
      throw new Error(message);
    };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, status, display_name, email")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile) await fail("Không tìm thấy tài khoản này trong hệ thống.");
    if (profile!.status !== "active") await fail("Tài khoản đã ngừng hoạt động.");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!authUser?.user) await fail("Tài khoản đăng nhập không tồn tại.");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetRole = roles?.[0]?.role ?? null;
    if (targetRole !== "leader" && targetRole !== "member") {
      await fail("Chỉ cấp mật khẩu tạm cho tài khoản Leader hoặc Member.");
    }

    const password = generateTemporaryPassword();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password,
    });
    if (updateError) await fail("Không cấp được mật khẩu tạm. Vui lòng thử lại.");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.userId);
    if (profileError) await fail("Đã đổi mật khẩu nhưng chưa đặt được yêu cầu đổi bắt buộc.");

    await logAudit("success");

    return {
      password,
      displayName: profile!.display_name,
      email: profile!.email,
    };
  });
