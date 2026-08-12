import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import { CEN_TIMEZONE } from "@/lib/datetime";
import type { WorkDayStatus, WorkShift } from "@/lib/workday-data";

/**
 * WORKDAY-02 — Thống kê ngày làm việc (chỉ đọc).
 * Toàn bộ phạm vi dữ liệu do RPC quyết định (Admin/CMO: tổ chức, Leader: Team mình).
 * Không thay đổi Business Rule của WORKDAY-01, không tính chuyên cần.
 */
type RpcBridge = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const callRpc = supabase.rpc as unknown as RpcBridge;

export type WorkRangeKey = "today" | "week" | "month" | "custom";

export const WORK_RANGE_LABEL: Record<WorkRangeKey, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
  custom: "Khoảng ngày",
};

export interface WorkDayOverviewRow {
  user_id: string;
  display_name: string;
  team_id: string | null;
  team_name: string | null;
  avatar_path: string | null;
  working_days: number;
  full_days: number;
  other_shift_days: number;
  weekend_days: number;
  day_off_days: number;
  change_count: number;
  today_status: WorkDayStatus | null;
  today_shift: WorkShift | null;
  today_started_at: string | null;
  today_changed: boolean;
}

export interface WorkDayHistoryRow {
  id: string;
  work_date: string;
  day_status: WorkDayStatus;
  shift_type: WorkShift | null;
  started_at: string | null;
  confirmed_at: string;
  change_count: number;
}

export interface WorkDayChangeRow {
  changed_at: string;
  actor_name: string;
  before_status: string | null;
  before_shift: string | null;
  after_status: string | null;
  after_shift: string | null;
}

/** `yyyy-MM-dd` hôm nay theo giờ nghiệp vụ CEN. */
export function cenTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CEN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Khoảng ngày tương ứng bộ lọc thời gian (tuần bắt đầu Thứ Hai). */
export function workRangeBounds(
  key: WorkRangeKey,
  custom?: { from: string; to: string },
): { from: string; to: string } {
  const today = cenTodayISO();
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Thứ Hai
    return { from: shiftISO(today, -weekday), to: today };
  }
  if (key === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  const from = custom?.from || today;
  const to = custom?.to || today;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** T7/CN theo lịch dương của một ngày `yyyy-MM-dd`. */
export function isWeekendISO(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function workDayOverviewQuery(input: {
  from: string;
  to: string;
  teamId: string | null;
  enabled: boolean;
}) {
  return queryOptions({
    queryKey: ["work-day-overview", input.from, input.to, input.teamId ?? "all"],
    queryFn: async (): Promise<WorkDayOverviewRow[]> => {
      const { data, error } = await callRpc("work_day_overview", {
        _from: input.from,
        _to: input.to,
        _team: input.teamId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as WorkDayOverviewRow[];
    },
    enabled: input.enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function workDayHistoryQuery(input: { userId: string | null; from: string; to: string }) {
  return queryOptions({
    queryKey: ["work-day-history", input.userId ?? "none", input.from, input.to],
    queryFn: async (): Promise<WorkDayHistoryRow[]> => {
      const { data, error } = await callRpc("work_day_history", {
        _user: input.userId,
        _from: input.from,
        _to: input.to,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as WorkDayHistoryRow[];
    },
    enabled: Boolean(input.userId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function workDayChangesQuery(recordId: string | null) {
  return queryOptions({
    queryKey: ["work-day-changes", recordId ?? "none"],
    queryFn: async (): Promise<WorkDayChangeRow[]> => {
      const { data, error } = await callRpc("work_day_changes", { _record: recordId });
      if (error) throw new Error(error.message);
      return (data ?? []) as WorkDayChangeRow[];
    },
    enabled: Boolean(recordId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
