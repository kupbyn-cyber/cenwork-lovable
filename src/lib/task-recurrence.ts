import type { TaskWorkWeight } from "@/lib/task-weight";
/**
 * TASK-RECUR-01 — Lịch công việc lặp (ngày / tuần / tháng).
 * Cấu hình lưu ở bảng task_recurrence_rules; Task thật do scheduler sinh theo từng kỳ.
 * Mọi ràng buộc quyền được chốt trong RPC phía database.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase as typedClient } from "@/integrations/cen/client";
import type { TaskPriority, TaskReviewerKind } from "@/lib/task-data";

/** Bảng/RPC lịch lặp mới chưa có trong types sinh tự động. */
const supabase = typedClient as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type TaskRecurrenceFreq = "daily" | "weekly" | "monthly";
export type TaskRecurrenceStatus = "active" | "stopped" | "archived";

export const RECURRENCE_FREQ_LABEL: Record<TaskRecurrenceFreq, string> = {
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
};

export const RECURRENCE_FREQ_ORDER: TaskRecurrenceFreq[] = ["daily", "weekly", "monthly"];

/** Thứ theo chuẩn ISO: 1 = Thứ 2 … 7 = Chủ nhật. */
export const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "T2", label: "Thứ 2" },
  { value: 2, short: "T3", label: "Thứ 3" },
  { value: 3, short: "T4", label: "Thứ 4" },
  { value: 4, short: "T5", label: "Thứ 5" },
  { value: 5, short: "T6", label: "Thứ 6" },
  { value: 6, short: "T7", label: "Thứ 7" },
  { value: 7, short: "CN", label: "Chủ nhật" },
];

export interface TaskRecurrenceRule {
  id: string;
  name: string;
  freq: TaskRecurrenceFreq;
  start_date: string;
  end_date: string | null;
  deadline_time: string;
  weekdays: number[];
  month_day: number | null;
  status: TaskRecurrenceStatus;
  created_by: string;
}

export interface RecurrenceSchedule {
  freq: TaskRecurrenceFreq;
  startDate: string;
  endDate: string | null;
  deadlineTime: string;
  weekdays: number[];
  monthDay: number | null;
}

/** Giờ deadline lưu dạng HH:mm:ss trong database. */
export function shortTime(value: string): string {
  return value.slice(0, 5);
}

/** Tóm tắt lịch lặp hiển thị cho người dùng. */
export function recurrenceSummary(rule: {
  freq: TaskRecurrenceFreq;
  weekdays: number[];
  month_day: number | null;
  deadline_time: string;
}): string {
  const time = shortTime(rule.deadline_time);
  if (rule.freq === "weekly") {
    const days = WEEKDAYS.filter((day) => rule.weekdays.includes(day.value))
      .map((day) => day.label)
      .join(", ");
    return `Lặp hàng tuần vào ${days || "—"} · Deadline ${time}`;
  }
  if (rule.freq === "monthly") {
    return `Lặp hàng tháng vào ngày ${rule.month_day ?? "—"} · Deadline ${time}`;
  }
  return `Lặp hàng ngày · Deadline ${time}`;
}

function mapRule(raw: Record<string, unknown>): TaskRecurrenceRule {
  return {
    id: raw["id"] as string,
    name: raw["name"] as string,
    freq: raw["freq"] as TaskRecurrenceFreq,
    start_date: raw["start_date"] as string,
    end_date: (raw["end_date"] as string | null) ?? null,
    deadline_time: (raw["deadline_time"] as string | null) ?? "17:00:00",
    weekdays: ((raw["weekdays"] as number[] | null) ?? []).map(Number),
    month_day: (raw["month_day"] as number | null) ?? null,
    status: (raw["status"] as TaskRecurrenceStatus | null) ?? "active",
    created_by: raw["created_by"] as string,
  };
}

export async function fetchTaskRecurrence(ruleId: string): Promise<TaskRecurrenceRule | null> {
  const { data, error } = await supabase
    .from("task_recurrence_rules")
    .select("id,name,freq,start_date,end_date,deadline_time,weekdays,month_day,status,created_by")
    .eq("id", ruleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRule(data) : null;
}

export const taskRecurrenceQuery = (ruleId: string | null) =>
  queryOptions({
    queryKey: ["task-recurrence", ruleId],
    queryFn: () => (ruleId ? fetchTaskRecurrence(ruleId) : Promise.resolve(null)),
    enabled: Boolean(ruleId),
  });

export interface CreateRecurrenceInput extends RecurrenceSchedule {
  name: string;
  description: string | null;
  projectId: string | null;
  assigneeId: string;
  teamId: string | null;
  participantIds: string[];
  priority: TaskPriority;
  workWeight: TaskWorkWeight;
  reviewerType: TaskReviewerKind | null;
  reviewerId: string | null;
}

export async function createTaskRecurrence(input: CreateRecurrenceInput) {
  const { data, error } = await supabase.rpc("task_recurrence_create", {
    _name: input.name,
    _description: input.description ?? "",
    _project: input.projectId as unknown as string,
    _assignee: input.assigneeId,
    _team: input.teamId as unknown as string,
    _participants: input.participantIds,
    _priority: input.priority,
    _work_weight: input.workWeight,
    _reviewer_type: input.reviewerType as unknown as string,
    _reviewer: input.reviewerId as unknown as string,
    _freq: input.freq,
    _start_date: input.startDate,
    _end_date: input.endDate as unknown as string,
    _deadline_time: input.deadlineTime,
    _weekdays: input.weekdays,
    _month_day: input.monthDay as unknown as number,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { rule_id?: string; task_id?: string | null };
  return { ruleId: result.rule_id ?? "", taskId: result.task_id ?? null };
}

export async function updateTaskRecurrence(ruleId: string, schedule: RecurrenceSchedule) {
  const { error } = await supabase.rpc("task_recurrence_update", {
    _rule: ruleId,
    _freq: schedule.freq,
    _start_date: schedule.startDate,
    _end_date: schedule.endDate as unknown as string,
    _deadline_time: schedule.deadlineTime,
    _weekdays: schedule.weekdays,
    _month_day: schedule.monthDay as unknown as number,
  });
  if (error) throw new Error(error.message);
}

export async function setTaskRecurrenceStatus(ruleId: string, status: TaskRecurrenceStatus) {
  const { error } = await supabase.rpc("task_recurrence_set_status", {
    _rule: ruleId,
    _status: status,
  });
  if (error) throw new Error(error.message);
}
