/**
 * TASK-DAILY-01B — Kiểu dữ liệu và kiểm tra dùng chung cho cấu hình
 * "Báo cáo công việc hằng ngày". Dùng được ở cả client và server.
 */
export const DAILY_REPORT_SETTING_KEY = "daily_task_report";
export const DAILY_REPORT_TIMEZONE = "Asia/Ho_Chi_Minh";

export interface DailyReportSettings {
  enabled: boolean;
  recipient_email: string | null;
  send_time: string;
}

export const DAILY_REPORT_DEFAULTS: DailyReportSettings = {
  enabled: false,
  recipient_email: null,
  send_time: "06:30",
};

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isValidSendTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function normalizeDailyReportSettings(
  raw: Record<string, unknown> | null | undefined,
): DailyReportSettings {
  const value = raw ?? {};
  const email = typeof value["recipient_email"] === "string" ? value["recipient_email"].trim() : "";
  const time = typeof value["send_time"] === "string" ? value["send_time"].trim() : "";
  return {
    enabled: value["enabled"] === true,
    recipient_email: email || null,
    send_time: isValidSendTime(time) ? time : DAILY_REPORT_DEFAULTS.send_time,
  };
}

/** Ngày nghiệp vụ hôm trước theo Asia/Ho_Chi_Minh (UTC+7), định dạng YYYY-MM-DD. */
export function previousBusinessDate(now: Date): string {
  const hanoi = new Date(now.getTime() + 7 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hanoi.getUTCFullYear()}-${pad(hanoi.getUTCMonth() + 1)}-${pad(hanoi.getUTCDate())}`;
}
