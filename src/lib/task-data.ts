import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { AppRoleKey } from "@/lib/permissions";
import {
  formatHanoiDate,
  formatHanoiDateTime,
  hanoiStartOfDayMs,
  isPastInstant,
} from "@/lib/datetime";

/**
 * CEN 1.0 — M3.1 Task data layer.
 * Đọc/ghi qua client trình duyệt; RLS + trigger phía database là ràng buộc thật.
 * Helper quyền ở đây chỉ để UI ẩn/disable đúng, không thay thế kiểm tra backend.
 */
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];

export const TASK_STATUS_ORDER: TaskStatus[] = ["not_started", "in_progress", "review", "done"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  review: "Chờ kiểm tra",
  done: "Hoàn thành",
};

export const TASK_STATUS_TONE: Record<TaskStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  review: "warning",
  done: "success",
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, StatusTone> = {
  low: "neutral",
  medium: "progress",
  high: "error",
};

export interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  projectName: string | null;
  assignee_id: string;
  assigneeName: string | null;
  assigneeTeamId: string | null;
  team_id: string | null;
  teamName: string | null;
  start_date: string | null;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  is_archived: boolean;
  created_by: string;
  creatorName: string | null;
  created_at: string;
  updated_at: string;
  participantIds: string[];
  participantNames: string[];
}

const SELECT = `
  id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,
  is_archived,created_by,created_at,updated_at,
  project:projects(id,name),
  assignee:profiles!tasks_assignee_id_fkey(id,display_name,primary_team_id),
  creator:profiles!tasks_created_by_fkey(id,display_name),
  team:teams(id,name),
  task_participants(user_id,profiles(display_name))
`;

type RawTask = Record<string, unknown>;

function mapTask(raw: RawTask): TaskRow {
  const project = raw["project"] as { name: string } | null;
  const assignee = raw["assignee"] as
    | { display_name: string; primary_team_id: string | null }
    | null;
  const creator = raw["creator"] as { display_name: string } | null;
  const team = raw["team"] as { name: string } | null;
  const participants = (raw["task_participants"] ?? []) as {
    user_id: string;
    profiles: { display_name: string } | null;
  }[];

  return {
    id: raw["id"] as string,
    name: raw["name"] as string,
    description: (raw["description"] as string | null) ?? null,
    project_id: (raw["project_id"] as string | null) ?? null,
    projectName: project?.name ?? null,
    assignee_id: raw["assignee_id"] as string,
    assigneeName: assignee?.display_name ?? null,
    assigneeTeamId: assignee?.primary_team_id ?? null,
    team_id: (raw["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    start_date: (raw["start_date"] as string | null) ?? null,
    deadline: raw["deadline"] as string,
    priority: raw["priority"] as TaskPriority,
    status: raw["status"] as TaskStatus,
    is_archived: Boolean(raw["is_archived"]),
    created_by: raw["created_by"] as string,
    creatorName: creator?.display_name ?? null,
    created_at: raw["created_at"] as string,
    updated_at: raw["updated_at"] as string,
    participantIds: participants.map((p) => p.user_id),
    participantNames: participants.map((p) => p.profiles?.display_name ?? "—"),
  };
}

export async function fetchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .order("deadline", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as RawTask));
}

export async function fetchTask(id: string): Promise<TaskRow | null> {
  const { data, error } = await supabase.from("tasks").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTask(data as RawTask) : null;
}

export const tasksQuery = () => queryOptions({ queryKey: ["tasks"], queryFn: fetchTasks });

export const taskQuery = (id: string) =>
  queryOptions({ queryKey: ["task", id], queryFn: () => fetchTask(id) });

/* ================= Quyền (mirror của RLS/trigger) ================= */

export interface TaskAccessContext {
  userId: string | null;
  role: AppRoleKey | null;
  leaderTeamId: string | null;
}

const privileged = (ctx: TaskAccessContext) => ctx.role === "admin" || ctx.role === "cmo";

/** Quản lý toàn bộ Task: sửa mọi trường, đổi người phụ trách, lưu trữ. */
export function canManageTask(task: TaskRow, ctx: TaskAccessContext) {
  if (privileged(ctx)) return true;
  if (ctx.userId && task.created_by === ctx.userId) return true;
  if (ctx.leaderTeamId) {
    if (task.team_id === ctx.leaderTeamId) return true;
    if (task.assigneeTeamId === ctx.leaderTeamId) return true;
  }
  return false;
}

/** Người phụ trách chỉ được cập nhật nội dung và tiến độ. */
export function isTaskAssignee(task: TaskRow, ctx: TaskAccessContext) {
  return Boolean(ctx.userId && task.assignee_id === ctx.userId);
}

export function canEditTask(task: TaskRow, ctx: TaskAccessContext) {
  if (task.is_archived) return ctx.role === "admin";
  return canManageTask(task, ctx) || isTaskAssignee(task, ctx);
}

export function canChangeTaskStatus(task: TaskRow, ctx: TaskAccessContext) {
  return canEditTask(task, ctx);
}

/** Chỉ Task đã hoàn thành cuối cùng (đã xác nhận) mới được lưu trữ thủ công. */
export function canArchiveTask(task: TaskRow, ctx: TaskAccessContext) {
  return !task.is_archived && task.status === "done" && canManageTask(task, ctx);
}

/** Task thuộc khu vực Lưu trữ: đã hoàn thành cuối cùng hoặc đã lưu trữ. */
export function isTaskArchived(task: TaskRow) {
  return task.status === "done" || task.is_archived;
}

/** Chỉ CMO, Admin, Leader hoặc Project Owner được gắn Task vào dự án. */
export function canCreateProjectTask(ctx: TaskAccessContext) {
  return privileged(ctx) || ctx.role === "leader";
}

/** Member chỉ được tự nhận việc. */
export function canAssignToOthers(ctx: TaskAccessContext) {
  return privileged(ctx) || ctx.role === "leader";
}

/* ================= Ghi dữ liệu ================= */

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface TaskInput {
  name: string;
  description: string | null;
  projectId: string | null;
  assigneeId: string;
  teamId: string | null;
  startDate: string | null;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
}

export async function createTask(input: TaskInput & { createdBy: string }) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      name: input.name,
      description: input.description,
      project_id: input.projectId,
      assignee_id: input.assigneeId,
      team_id: input.teamId,
      start_date: input.startDate,
      deadline: input.deadline,
      priority: input.priority,
      status: input.status,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  fail(error);
  return data!.id;
}

type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export async function updateTask(id: string, input: Partial<TaskInput>) {
  const payload: TaskUpdate = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.projectId !== undefined) payload.project_id = input.projectId;
  if (input.assigneeId !== undefined) payload.assignee_id = input.assigneeId;
  if (input.teamId !== undefined) payload.team_id = input.teamId;
  if (input.startDate !== undefined) payload.start_date = input.startDate;
  if (input.deadline !== undefined) payload.deadline = input.deadline;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.status !== undefined) payload.status = input.status;
  const { error } = await supabase.from("tasks").update(payload).eq("id", id);
  fail(error);
}


export async function setTaskStatus(id: string, status: TaskStatus) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  fail(error);
}

/** Không xóa cứng: chỉ lưu trữ để giữ nguyên lịch sử. */
export async function setTaskArchived(id: string, archived: boolean) {
  const { error } = await supabase.from("tasks").update({ is_archived: archived }).eq("id", id);
  fail(error);
}

/** Đồng bộ người tham gia: chỉ thêm/gỡ phần khác nhau để lịch sử ghi đúng thay đổi. */
export async function syncTaskParticipants(taskId: string, current: string[], next: string[]) {
  const removed = current.filter((id) => !next.includes(id));
  const added = next.filter((id) => !current.includes(id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("task_participants")
      .delete()
      .eq("task_id", taskId)
      .in("user_id", removed);
    fail(error);
  }
  if (added.length > 0) {
    const { error } = await supabase
      .from("task_participants")
      .insert(added.map((userId) => ({ task_id: taskId, user_id: userId })));
    fail(error);
  }
}

/* ================= Tiện ích hiển thị ================= */

/** Ngày `dd/MM/yyyy` theo giờ Hà Nội. */
export function formatDate(value: string | null) {
  return formatHanoiDate(value);
}

/** Deadline `dd/MM/yyyy HH:mm` theo giờ Hà Nội. */
export function formatDateTime(value: string | null) {
  return formatHanoiDateTime(value);
}

export function isTaskOverdue(task: TaskRow) {
  if (task.status === "done" || task.is_archived) return false;
  return isPastInstant(task.deadline);
}

/** Tiến độ thời gian theo mốc bắt đầu → deadline (0–100). */
export function taskTimeProgress(task: TaskRow): number | null {
  if (!task.start_date) return null;
  const start = hanoiStartOfDayMs(task.start_date);
  const end = new Date(task.deadline).getTime();
  if (start === null || Number.isNaN(end)) return null;
  if (end <= start) return 100;
  const ratio = ((Date.now() - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}


/* ================= Lịch sử ================= */

export interface TaskHistoryEntry {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  before_data: unknown;
  after_data: unknown;
}

export async function fetchTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,actor_email,created_at,before_data,after_data")
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskHistoryEntry[];
}

export const taskHistoryQuery = (taskId: string) =>
  queryOptions({ queryKey: ["task-history", taskId], queryFn: () => fetchTaskHistory(taskId) });
