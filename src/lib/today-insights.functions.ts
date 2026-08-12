import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { TodayInsights } from "@/lib/today-insights";

/**
 * CEN TODAY-03 — server function cho phần cá nhân hóa Trang chủ theo vai trò.
 * Chạy bằng phiên người gọi; RLS giữ nguyên phạm vi dữ liệu.
 */
export const getTodayInsights = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: { startISO: string; endISO: string }) => input)
  .handler(async ({ data, context }): Promise<TodayInsights> => {
    const { buildTodayInsights } = await import("@/lib/today-insights.server");
    // PERF-02: vai trò và Team phụ trách là hai truy vấn độc lập — chạy song song.
    const [role, leaderTeam] = await Promise.all([
      resolveCallerRole(context.supabase, context.userId),
      context.supabase
        .from("teams")
        .select("id")
        .eq("leader_id", context.userId)
        .maybeSingle(),
    ]);
    return buildTodayInsights(context.supabase, context.userId, role, leaderTeam.data?.id ?? null, {
      start: new Date(data.startISO).getTime(),
      end: new Date(data.endISO).getTime(),
    });
  });
