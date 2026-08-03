import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { OpsAlertsResult } from "@/lib/ops-alerts";

/**
 * TODAY-ALERTS-01 — cảnh báo điều hành chỉ dành cho Admin/CMO.
 * Kiểm tra vai trò tại server; Leader/Member luôn nhận danh sách rỗng.
 */
export const getOpsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startISO: string; endISO: string }) => input)
  .handler(async ({ data, context }): Promise<OpsAlertsResult> => {
    const role = await resolveCallerRole(context.supabase, context.userId);
    if (role !== "admin" && role !== "cmo") {
      return { alerts: [], failedSources: [], generated_at: new Date().toISOString() };
    }
    const { buildOpsAlerts } = await import("@/lib/ops-alerts.server");
    return buildOpsAlerts(context.supabase, data);
  });
