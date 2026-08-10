/**
 * CEN-MB-03 — Middleware xác thực dùng chung cho server function.
 *
 * Bản deploy Mắt Bão (có DATABASE_URL): danh tính lấy từ cookie phiên HttpOnly
 * do CEN cấp, truy vấn chạy dưới role `cen_app` nên RLS vẫn là ranh giới thật.
 * Bản xem trước: dùng lại luồng bearer token của hạ tầng cũ.
 *
 * `context.supabase`, `context.userId`, `context.claims` giữ nguyên hình dạng,
 * nên toàn bộ nghiệp vụ hiện có không phải sửa.
 */
import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const requireCenAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();

  if (process.env["DATABASE_URL"]) {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const session = await resolveSession(getCookie(SESSION_COOKIE));
    if (!session) throw new Error("Unauthorized");

    const { createUserDataClient } = await import("@/lib/db/server-client.server");
    return next({
      context: {
        supabase: createUserDataClient(session.userId) as unknown as SupabaseClient<Database>,
        userId: session.userId,
        claims: { sub: session.userId, email: session.email } as Record<string, unknown>,
      },
    });
  }

  const { buildLegacyAuthContext } = await import("@/lib/auth/supabase-context.server");
  const context = await buildLegacyAuthContext(request?.headers?.get("authorization") ?? null);
  return next({ context });
});
