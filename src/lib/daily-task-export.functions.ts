import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { requirePermission } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * TASK-DAILY-01A — server function tải file Excel công việc theo ngày nghiệp vụ.
 * Chỉ người có quyền quản trị hệ thống mới gọi được; dữ liệu đọc dưới danh tính
 * viewer báo cáo hiện có nên RLS vẫn áp dụng.
 */
export const exportDailyTasks = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: { businessDate: string }) => input)
  .handler(async ({ data, context }): Promise<{ fileName: string; rowCount: number; base64: string }> => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_ADMIN);
    const { generateDailyTaskReport } = await import("@/lib/daily-task-export.server");
    const report = await generateDailyTaskReport(data.businessDate);
    return {
      fileName: report.fileName,
      rowCount: report.rowCount,
      base64: Buffer.from(report.content).toString("base64"),
    };
  });
