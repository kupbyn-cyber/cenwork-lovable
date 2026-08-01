import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { PerformanceDashboard } from "@/lib/performance";

/**
 * PERFORMANCE — server function cho Dashboard hiệu suất.
 * Chạy bằng phiên người gọi (RLS giữ nguyên); phạm vi Team và dữ liệu nhạy cảm
 * được chốt ở server, không phụ thuộc việc ẩn UI.
 */
export const getPerformanceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { from: string; to: string; teamId?: string | null; userId?: string | null }) => {
      const isDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isDay(data.from) || !isDay(data.to)) throw new Error("Khoảng ngày không hợp lệ.");
      return {
        from: data.from,
        to: data.to,
        teamId: data.teamId ?? null,
        userId: data.userId ?? null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<PerformanceDashboard> => {
    const { buildPerformanceDashboard } = await import("@/lib/performance.server");
    const role = await resolveCallerRole(context.supabase, context.userId);
    return buildPerformanceDashboard(context.supabase, context.userId, role, data);
  });
