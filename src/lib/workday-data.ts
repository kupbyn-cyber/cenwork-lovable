import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";

/**
 * WORKDAY-01 — Ngày làm việc (data layer).
 * Nguồn xác định duy nhất là database (`daily_work_records`), không dựa vào
 * localStorage: đổi thiết bị/trình duyệt vẫn không hỏi lại trong ngày.
 */
export type WorkDayStatus = "working" | "day_off";
export type WorkShift = "full_day" | "morning" | "afternoon" | "evening" | "custom";

/**
 * Bảng/RPC mới của WORKDAY-01 chưa có trong bộ type sinh tự động, nên gọi qua
 * một cầu nối có kiểu tường minh thay vì nới lỏng toàn bộ client.
 */
type RpcBridge = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const callRpc = supabase.rpc as unknown as RpcBridge;

export interface WorkDayRecord {
  id: string;
  user_id: string;
  work_date: string;
  day_status: WorkDayStatus;
  shift_type: WorkShift | null;
  started_at: string | null;
  confirmed_at: string;
  source: string;
  change_count: number;
}

export interface WorkDayToday {
  work_date: string;
  confirmed: boolean;
  record: WorkDayRecord | null;
}

export const WORK_SHIFT_OPTIONS: { value: WorkShift; label: string }[] = [
  { value: "full_day", label: "Cả ngày" },
  { value: "morning", label: "Ca sáng" },
  { value: "afternoon", label: "Ca chiều" },
  { value: "evening", label: "Ca tối" },
];

export function workShiftLabel(shift: WorkShift | null | undefined): string {
  if (!shift) return "—";
  return WORK_SHIFT_OPTIONS.find((option) => option.value === shift)?.label ?? "Ca khác";
}

/** Lời chúc ngắn, chọn ngẫu nhiên trong danh sách cố định (không dùng AI). */
export const WORKDAY_GREETINGS = [
  "Một ngày mới, xử lý mọi thứ thật gọn nhé.",
  "Chọn việc quan trọng nhất và bắt đầu thôi.",
  "Hôm nay chỉ cần tiến thêm một bước là đủ tốt.",
  "Ít việc dở dang, nhiều việc hoàn thành nhé.",
  "Cứ bình tĩnh, việc gì cũng có thứ tự của nó.",
];

export function greetingByHour(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export function pickGreetingLine(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return WORKDAY_GREETINGS[hash % WORKDAY_GREETINGS.length]!;
}

export function workDayTodayQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["work-day-today", userId ?? "anon"],
    queryFn: async (): Promise<WorkDayToday> => {
      const { data, error } = await callRpc("work_day_today");
      if (error) throw new Error(error.message);
      return data as unknown as WorkDayToday;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** Ghi nhận ngày làm việc/ngày nghỉ. Quyền và audit được chốt trong RPC. */
export async function setWorkDay(input: {
  status: WorkDayStatus;
  shift?: WorkShift | null;
  userId?: string | null;
  source?: string;
}): Promise<WorkDayRecord> {
  const { data, error } = await callRpc("work_day_set", {
    _status: input.status,
    _shift: input.status === "working" ? (input.shift ?? "full_day") : null,
    _user: input.userId ?? null,
    _day: null,
    _source: input.source ?? "popup",
  });
  if (error) throw new Error(error.message);
  return data as unknown as WorkDayRecord;
}
