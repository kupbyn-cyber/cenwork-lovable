import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  jobTitle: z.string().trim().max(120).optional().nullable(),
  role: roleEnum,
  primaryTeamId: z.string().uuid().nullable(),
  collaboratorTeamIds: z.array(z.string().uuid()).max(20).default([]),
  initialPassword: z.string().min(8).max(72),
});




async function assertCanCreate(
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" | "cmo" | "leader" | "member" },
    ) => PromiseLike<{ data: boolean | null }>;
  },
  userId: string,
) {
  const [{ data: isAdmin }, { data: isCmo }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "cmo" }),
  ]);
  if (!isAdmin && !isCmo) throw new Error("Bạn không có quyền thực hiện thao tác này.");
  return { isAdmin: Boolean(isAdmin) };
}


export const createMemberAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanCreate(context.supabase, context.userId);

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
      .update({
        display_name: data.displayName,
        job_title: data.jobTitle?.trim() || null,
        primary_team_id: data.primaryTeamId,
      })
      .eq("id", userId);
    if (profileError) throw new Error("Không lưu được hồ sơ thành viên.");

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
    await assertCanCreate(context.supabase, context.userId);
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Chỉ Admin được khóa hoặc mở khóa tài khoản.");
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
