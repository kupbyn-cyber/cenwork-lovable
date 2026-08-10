import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AUTH-PORTABLE-01 — server functions cho luồng bootstrap admin.
 * Không trả token/secret về client; chỉ trả setup_required.
 */

const bootstrapInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8, "Mật khẩu tối thiểu 8 ký tự.")
    .max(72)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Mật khẩu phải gồm cả chữ và số."),
  token: z.string().min(1).max(512),
});

export const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveAuthAdapter } = await import("@/lib/auth-adapter.server");
  const adapter = await resolveAuthAdapter();
  const state = await adapter.readBootstrapState();
  return {
    setup_required: state.bootstrapEnabled && !state.hasSystemOwner && !state.hasActiveAdmin,
  };
});

export const createBootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bootstrapInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveAuthAdapter, verifyBootstrapToken, bootstrapTokenConfigured } =
      await import("@/lib/auth-adapter.server");
    const adapter = await resolveAuthAdapter();

    if (!bootstrapTokenConfigured()) {
      throw new Error("Thiết lập ban đầu chưa được bật trên máy chủ.");
    }

    // Kiểm tra lại ở server ngay trước khi tạo (chống gọi API sau khi đã khóa).
    const state = await adapter.readBootstrapState();
    if (state.hasSystemOwner || state.hasActiveAdmin) {
      throw new Error("Hệ thống đã có quản trị viên. Thiết lập ban đầu đã bị khóa.");
    }

    if (!verifyBootstrapToken(data.token)) {
      throw new Error("Mã thiết lập không đúng.");
    }

    // Database mới sau Remix: bổ sung dữ liệu hệ thống bắt buộc trước khi tạo Admin.
    await adapter.ensureSystemDefaults();
    // Chỉ tạo Admin khi danh mục quyền + cấu hình đủ 4 vai trò + app_settings đã sẵn sàng.
    await adapter.verifySystemDefaults();

    const { userId } = await adapter.createBootstrapUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
    });

    try {
      await adapter.createProfileAndAssignSystemOwner({
        userId,
        email: data.email,
        displayName: data.displayName,
      });
      // Nghiệm thu: quyền tối thiểu của Admin phải hiệu lực, nếu không thì rollback.
      await adapter.verifyAdminBootstrap(userId);
    } catch (error) {
      // Bù trừ: không để lại Auth user mồ côi khi bước cấp quyền thất bại.
      await adapter.deleteUser(userId).catch(() => undefined);
      const message = error instanceof Error ? error.message : "";
      if (message === "BOOTSTRAP_LOCKED") {
        throw new Error("Hệ thống đã có quản trị viên. Thiết lập ban đầu đã bị khóa.");
      }
      throw new Error("Không hoàn tất được thiết lập quản trị. Vui lòng thử lại.");
    }

    return { ok: true as const };
  });
