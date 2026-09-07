import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M1.5 Settings quản trị.
 * Chỉ các setting đã có dữ liệu trong bảng app_settings.
 * Quyền sửa do RLS quyết định (chỉ Admin); audit do trigger DB ghi lại.
 */
export interface AppSettingRow {
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  updated_at: string;
}

export const SETTING_LABEL: Record<string, string> = {
  org_name: "Tên tổ chức",
  default_temp_password: "Mật khẩu tạm mặc định",
  session_idle_minutes: "Số phút không hoạt động trước khi cảnh báo phiên",
};

/** Cấu hình có UI riêng (TASK-DAILY-01B) — không hiển thị ở danh sách khoá/giá trị chung. */
const SETTING_KEYS_WITH_OWN_UI = new Set(["daily_task_report"]);

export async function fetchAppSettings(): Promise<AppSettingRow[]> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value,description,updated_at")
    .order("key");
  if (error) throw new Error(error.message);
  return ((data ?? []) as AppSettingRow[]).filter((row) => !SETTING_KEYS_WITH_OWN_UI.has(row.key));
}

export const appSettingsQuery = () =>
  queryOptions({ queryKey: ["app-settings"], queryFn: fetchAppSettings });

export async function updateAppSetting(key: string, value: Record<string, unknown>) {
  const { error } = await supabase.from("app_settings").update({ value: value as Json }).eq("key", key);
  if (error) {
    throw new Error(
      /row-level security|permission/i.test(error.message)
        ? "Bạn không có quyền thay đổi cấu hình hệ thống."
        : error.message,
    );
  }
}

export function settingText(row: AppSettingRow): string {
  const value = row.value ?? {};
  if (typeof value["text"] === "string") return value["text"];
  if (typeof value["number"] === "number") return String(value["number"]);
  return "";
}

export function settingIsNumber(row: AppSettingRow): boolean {
  return typeof (row.value ?? {})["number"] === "number";
}
