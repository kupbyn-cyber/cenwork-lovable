import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { DashboardData } from "@/lib/dashboard";

/**
 * DASH-CORE-01 — điểm vào duy nhất của Dashboard hiệu suất.
 * Vai trò và phạm vi dữ liệu do server quyết định; client không tự mở rộng phạm vi.
 */
export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: { from: string; to: string; teamId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<DashboardData> => {
    const role = await resolveCallerRole(context.supabase, context.userId);
    const { buildDashboard } = await import("@/lib/dashboard.server");
    return buildDashboard(context.supabase, context.userId, role, {
      from: data.from,
      to: data.to,
      teamId: data.teamId ?? null,
    });
  });
