import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { TodayHubResult } from "@/lib/today-hub";

/**
 * CEN TODAY-01 — server function tổng hợp việc cần xử lý cho Trang chủ.
 * Chạy bằng phiên người gọi (RLS giữ nguyên phạm vi); UI không tự lọc dữ liệu cấm.
 */
export const getTodayHub = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .handler(async ({ context }): Promise<TodayHubResult> => {
    const { buildTodayHub } = await import("@/lib/today.server");
    // PERF-02: vai trò và Team phụ trách là hai truy vấn độc lập — chạy song song.
    const [role, leaderTeam] = await Promise.all([
      resolveCallerRole(context.supabase, context.userId),
      context.supabase.from("teams").select("id").eq("leader_id", context.userId).maybeSingle(),
    ]);
    return buildTodayHub(context.supabase, context.userId, role, leaderTeam.data?.id ?? null);
  });
