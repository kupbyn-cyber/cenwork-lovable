import { createServerFn } from "@tanstack/react-start";

import { requireCenAuth } from "@/lib/auth/cen-auth-middleware";
import { requirePermission } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";
import {
  DAILY_REPORT_SETTING_KEY,
  isValidEmail,
  isValidSendTime,
  normalizeDailyReportSettings,
  previousBusinessDate,
  type DailyReportSettings,
} from "@/lib/daily-report-settings";

/**
 * TASK-DAILY-01B — Cấu hình báo cáo công việc hằng ngày + gửi thử.
 * Quyền chốt ở server (settings.admin), không chỉ ẩn UI.
 * Gửi thử luôn dùng lại engine xuất Excel của TASK-DAILY-01A.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
async function readSettings(client: any): Promise<DailyReportSettings> {
  const { data, error } = await client
    .from("app_settings")
    .select("key,value")
    .eq("key", DAILY_REPORT_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeDailyReportSettings((data?.value ?? null) as Record<string, unknown> | null);
}

export const getDailyReportSettings = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .handler(async ({ context }): Promise<DailyReportSettings & { smtpConfigured: boolean }> => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_ADMIN);
    const settings = await readSettings(context.supabase);
    const { readSmtpConfig } = await import("@/lib/daily-report-mail.server");
    let smtpConfigured = true;
    try {
      readSmtpConfig();
    } catch {
      smtpConfigured = false;
    }
    return { ...settings, smtpConfigured };
  });

export const saveDailyReportSettings = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .inputValidator((input: DailyReportSettings) => input)
  .handler(async ({ data, context }): Promise<DailyReportSettings> => {
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_ADMIN);

    const recipient = (data.recipient_email ?? "").trim();
    const sendTime = (data.send_time ?? "").trim();
    if (!isValidSendTime(sendTime)) {
      throw new Error("Giờ gửi không hợp lệ. Định dạng HH:mm, từ 00:00 đến 23:59.");
    }
    if (recipient && !isValidEmail(recipient)) {
      throw new Error("Email nhận báo cáo không đúng định dạng.");
    }
    if (data.enabled && !isValidEmail(recipient)) {
      throw new Error("Cần email nhận báo cáo hợp lệ trước khi bật gửi tự động.");
    }

    const value = {
      enabled: Boolean(data.enabled),
      recipient_email: recipient || null,
      send_time: sendTime,
    };

    const { error } = await context.supabase
      .from("app_settings")
      .update({ value })
      .eq("key", DAILY_REPORT_SETTING_KEY);
    if (error) {
      throw new Error(
        /row-level security|permission/i.test(error.message)
          ? "Bạn không có quyền thay đổi cấu hình hệ thống."
          : error.message,
      );
    }

    const saved = await readSettings(context.supabase);
    if (saved.send_time !== value.send_time || saved.enabled !== value.enabled) {
      // Dòng cấu hình chưa tồn tại (database chưa chạy migration 0156).
      const { error: insertError } = await context.supabase.from("app_settings").insert({
        key: DAILY_REPORT_SETTING_KEY,
        value,
        description: "Cấu hình gửi báo cáo công việc hằng ngày qua email (TASK-DAILY-01B)",
      });
      if (insertError) throw new Error(insertError.message);
      return value;
    }
    return saved;
  });

export const sendDailyReportTest = createServerFn({ method: "POST" })
  .middleware([requireCenAuth])
  .handler(
    async ({
      context,
    }): Promise<{ businessDate: string; fileName: string; rowCount: number; recipient: string }> => {
      await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_ADMIN);
      const settings = await readSettings(context.supabase);
      const recipient = (settings.recipient_email ?? "").trim();
      if (!isValidEmail(recipient)) {
        throw new Error("Chưa có email nhận báo cáo hợp lệ. Hãy lưu cấu hình trước khi gửi thử.");
      }

      const businessDate = previousBusinessDate(new Date());
      const { generateDailyTaskReport } = await import("@/lib/daily-task-export.server");
      const report = await generateDailyTaskReport(businessDate);

      const { sendMail } = await import("@/lib/daily-report-mail.server");
      const [year, month, day] = businessDate.split("-");
      const displayDate = `${day}/${month}/${year}`;
      const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const pad = (value: number) => String(value).padStart(2, "0");
      const createdAt = `${pad(now.getUTCDate())}/${pad(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;

      await sendMail({
        to: recipient,
        subject: `[CEN DAILY] Báo cáo công việc ${displayDate}`,
        text: [
          "CEN Daily Task Report",
          `Ngày báo cáo: ${displayDate}`,
          `Tạo lúc: ${createdAt}`,
          "",
          "File đính kèm chứa dữ liệu công việc phục vụ kiểm tra và phân tích điều hành.",
        ].join("\n"),
        attachments: [{ filename: report.fileName, content: report.content }],
      });

      await context.supabase
        .from("audit_logs")
        .insert({
          user_id: context.userId,
          action: "settings.daily_report_test_sent",
          entity_type: "app_setting",
          entity_id: null,
          metadata: { business_date: businessDate, row_count: report.rowCount },
        })
        .then(
          () => undefined,
          () => undefined,
        );

      return {
        businessDate,
        fileName: report.fileName,
        rowCount: report.rowCount,
        recipient,
      };
    },
  );
