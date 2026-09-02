import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";

/**
 * CEN-PUSH-P01 — đăng ký/hủy thiết bị nhận Web Push.
 * Danh tính luôn lấy từ phiên máy chủ: client không truyền được user_id,
 * và chỉ thao tác được trên endpoint của chính mình (trừ rebind máy dùng chung).
 */
export interface PushConfigResult {
  publicKey: string | null;
  deviceCount: number;
}

export const getPushConfig = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .handler(async ({ context }): Promise<PushConfigResult> => {
    const { readVapidConfig } = await import("@/lib/push.server");
    const vapid = readVapidConfig();
    const { count } = await (
      context.supabase as unknown as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: (table: string) => any;
      }
    )
      .from("web_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_active", true);
    // Chỉ public key được trả về client; private key không bao giờ rời máy chủ.
    return { publicKey: vapid?.publicKey ?? null, deviceCount: count ?? 0 };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator(
    (input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => {
      const endpoint = (input.endpoint ?? "").trim();
      const p256dh = (input.p256dh ?? "").trim();
      const auth = (input.auth ?? "").trim();
      if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2000)
        throw new Error("Endpoint không hợp lệ.");
      if (!p256dh || !auth) throw new Error("Khóa đăng ký không hợp lệ.");
      return { endpoint, p256dh, auth, userAgent: (input.userAgent ?? "").slice(0, 300) };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getAdminClient } = await import("@/lib/db/admin-client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await getAdminClient()) as unknown as { from: (table: string) => any };

    // Máy dùng chung: endpoint là duy nhất theo trình duyệt. Nếu trước đó thuộc
    // tài khoản khác thì bản ghi cũ bị thay, không có chuyện một endpoint thuộc
    // đồng thời hai người dùng.
    await db.from("web_push_subscriptions").delete().eq("endpoint", data.endpoint);
    const { error } = await db.from("web_push_subscriptions").insert({
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      user_agent: data.userAgent || null,
      is_active: true,
      failure_count: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: { endpoint: string }) => ({ endpoint: (input.endpoint ?? "").trim() }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (!data.endpoint) return { ok: true };
    // Có ràng buộc user_id: người dùng A không thể xóa đăng ký của người dùng B.
    await (
      context.supabase as unknown as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: (table: string) => any;
      }
    )
      .from("web_push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    return { ok: true };
  });
