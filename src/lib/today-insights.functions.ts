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
  .handler(async ({ context }): Promise<TodayInsights> => {
    const { buildTodayInsights } = await import("@/lib/today-insights.server");
    const role = await resolveCallerRole(context.supabase, context.userId);
    const { data: leaderTeam } = await context.supabase
      .from("teams")
      .select("id")
      .eq("leader_id", context.userId)
      .maybeSingle();
    return buildTodayInsights(context.supabase, context.userId, role, leaderTeam?.id ?? null);
  });
