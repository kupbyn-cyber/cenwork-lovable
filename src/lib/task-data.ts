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
export type TaskApprovalStatus = Database["public"]["Enums"]["task_approval_status"];

/** Trạng thái duyệt tách riêng khỏi vòng đời thực hiện (task_status). */
export const TASK_APPROVAL_LABEL: Record<TaskApprovalStatus, string> = {
  pending: "Chờ duyệt",
  changes_requested: "Yêu cầu chỉnh sửa",
  approved: "Đã duyệt",
  withdrawn: "Đã thu hồi",
};

export const TASK_APPROVAL_TONE: Record<TaskApprovalStatus, StatusTone> = {
  pending: "warning",
  changes_requested: "error",
  approved: "success",
  withdrawn: "neutral",
};

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
  projectOwnerId: string | null;
  /** Dự án cha đang bị lưu trữ thủ công → Task cũng rời danh sách hoạt động. */
  projectManuallyArchivedAt: string | null;
  /** Team phụ trách mặc định của dự án cha (nguồn xác định người duyệt). */
  projectResponsibleTeamId: string | null;
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
  completed_at: string | null;
  result_text: string | null;
  result_updated_at: string | null;
  result_updated_by: string | null;
  resultUpdatedByName: string | null;
  manually_archived_at: string | null;
  manually_archived_by: string | null;
  created_by: string;
  creatorName: string | null;
  created_at: string;
  updated_at: string;
  approval_status: TaskApprovalStatus;
  approval_round: number;
  submitted_at: string | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approvalDecidedByName: string | null;
  approval_note: string | null;
  participantIds: string[];
  participantNames: string[];
}

const SELECT = `
  id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,
  is_archived,completed_at,manually_archived_at,manually_archived_by,
  result_text,result_updated_at,result_updated_by,
  created_by,created_at,updated_at,
  approval_status,approval_round,submitted_at,approval_decided_at,approval_decided_by,approval_note,
  project:projects(id,name,owner_id,manually_archived_at,responsible_team_id),
  assignee:profiles!tasks_assignee_id_fkey(id,display_name,primary_team_id),
  creator:profiles!tasks_created_by_fkey(id,display_name),
  resultAuthor:profiles!tasks_result_updated_by_fkey(id,display_name),
  team:teams(id,name),
  task_participants(user_id,profiles(display_name))
`;

type RawTask = Record<string, unknown>;

function mapTask(raw: RawTask): TaskRow {
  const project = raw["project"] as {
    name: string;
    owner_id: string | null;
    manually_archived_at: string | null;
    responsible_team_id: string | null;
  } | null;
  const assignee = raw["assignee"] as
    | { display_name: string; primary_team_id: string | null }
    | null;
  const creator = raw["creator"] as { display_name: string } | null;
  const resultAuthor = raw["resultAuthor"] as { display_name: string } | null;
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
    projectOwnerId: project?.owner_id ?? null,
    projectManuallyArchivedAt: project?.manually_archived_at ?? null,
    projectResponsibleTeamId: project?.responsible_team_id ?? null,
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
    completed_at: (raw["completed_at"] as string | null) ?? null,
    result_text: (raw["result_text"] as string | null) ?? null,
    result_updated_at: (raw["result_updated_at"] as string | null) ?? null,
    result_updated_by: (raw["result_updated_by"] as string | null) ?? null,
    resultUpdatedByName: resultAuthor?.display_name ?? null,
    manually_archived_at: (raw["manually_archived_at"] as string | null) ?? null,
    manually_archived_by: (raw["manually_archived_by"] as string | null) ?? null,
    created_by: raw["created_by"] as string,
    creatorName: creator?.display_name ?? null,
    created_at: raw["created_at"] as string,
    updated_at: raw["updated_at"] as string,
    approval_status: (raw["approval_status"] as TaskApprovalStatus | null) ?? "approved",
    approval_round: (raw["approval_round"] as number | null) ?? 0,
    submitted_at: (raw["submitted_at"] as string | null) ?? null,
    approval_decided_at: (raw["approval_decided_at"] as string | null) ?? null,
    approval_decided_by: (raw["approval_decided_by"] as string | null) ?? null,
    approvalDecidedByName: null,
    approval_note: (raw["approval_note"] as string | null) ?? null,
    participantIds: participants.map((p) => p.user_id),
    participantNames: participants.map((p) => p.profiles?.display_name ?? "—"),
  };
}

export async function fetchTasks(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .is("deleted_at", null)
    .eq("approval_status", "approved")
    .order("deadline", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as RawTask));
}

/** Yêu cầu duyệt (chưa phải công việc chính thức). RLS quyết định ai thấy gì. */
export async function fetchTaskApprovals(): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .is("deleted_at", null)
    .neq("approval_status", "approved")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as RawTask));
}

export const taskApprovalsQuery = () =>
  queryOptions({ queryKey: ["task-approvals"], queryFn: fetchTaskApprovals });

export async function fetchTask(id: string): Promise<TaskRow | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
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
  if (task.is_archived) return privileged(ctx);
  return canManageTask(task, ctx) || isTaskAssignee(task, ctx);
}

export function canChangeTaskStatus(task: TaskRow, ctx: TaskAccessContext) {
  return canEditTask(task, ctx);
}

/** Lưu trữ thủ công: chỉ Admin và CMO, không đổi trạng thái nghiệp vụ. */
export function isTaskManuallyArchived(task: TaskRow) {
  return task.manually_archived_at !== null;
}

export function canManuallyArchiveTask(task: TaskRow, ctx: TaskAccessContext) {
  return privileged(ctx) && !isTaskManuallyArchived(task);
}

/** Chỉ dữ liệu lưu trữ thủ công mới được khôi phục; dữ liệu hoàn thành thì không. */
export function canRestoreTask(task: TaskRow, ctx: TaskAccessContext) {
  return privileged(ctx) && isTaskManuallyArchived(task);
}

/**
 * Task thuộc khu vực Lưu trữ khi đã hoàn thành cuối cùng, được lưu trữ thủ công,
 * hoặc thuộc dự án đang được lưu trữ thủ công.
 */
export function isTaskArchived(task: TaskRow) {
  return (
    task.status === "done" ||
    isTaskManuallyArchived(task) ||
    task.projectManuallyArchivedAt !== null
  );
}

/** Hoàn thành trước hạn: dữ liệu suy ra từ completed_at và deadline, không phải trạng thái. */
export function isCompletedEarly(task: TaskRow) {
  if (!task.completed_at) return false;
  return new Date(task.completed_at).getTime() < new Date(task.deadline).getTime();
}

/** Người phụ trách được gửi yêu cầu đổi deadline; người có quyền duyệt cũng được gửi. */
export function canRequestTaskDeadline(task: TaskRow, ctx: TaskAccessContext) {
  if (isTaskArchived(task)) return false;
  return isTaskAssignee(task, ctx) || canApproveTaskDeadline(task, ctx);
}

/** Duyệt: Admin, CMO, Chủ dự án của dự án chứa Task, Leader đúng phạm vi. */
export function canApproveTaskDeadline(task: TaskRow, ctx: TaskAccessContext) {
  if (privileged(ctx)) return true;
  if (ctx.userId && task.projectOwnerId === ctx.userId) return true;
  if (ctx.leaderTeamId) {
    if (task.team_id === ctx.leaderTeamId) return true;
    if (task.assigneeTeamId === ctx.leaderTeamId) return true;
  }
  return false;
}

/** Chỉ CMO, Admin, Leader hoặc Chủ dự án được gắn Task vào dự án. */
export function canCreateProjectTask(ctx: TaskAccessContext) {
  return privileged(ctx) || ctx.role === "leader";
}

/** Member chỉ được tự nhận việc. */
export function canAssignToOthers(ctx: TaskAccessContext) {
  return privileged(ctx) || ctx.role === "leader";
}

/* ================= Luồng duyệt Task của Member ================= */

/** Member phải gửi Leader duyệt thay vì tạo Task chính thức. */
export function isMemberSubmissionFlow(ctx: TaskAccessContext) {
  return ctx.role === "member";
}

export function isTaskAwaitingApproval(task: TaskRow) {
  return task.approval_status !== "approved";
}

/** Duyệt: Admin/CMO, hoặc Leader của Team phụ trách mặc định của Dự án. */
export function canApproveTaskSubmission(task: TaskRow, ctx: TaskAccessContext) {
  if (!isTaskAwaitingApproval(task)) return false;
  if (task.approval_status === "withdrawn") return false;
  if (privileged(ctx)) return true;
  return Boolean(
    ctx.leaderTeamId && task.projectResponsibleTeamId === ctx.leaderTeamId,
  );
}

export function isTaskSubmissionAuthor(task: TaskRow, ctx: TaskAccessContext) {
  return Boolean(ctx.userId && task.created_by === ctx.userId);
}

export function canWithdrawTaskSubmission(task: TaskRow, ctx: TaskAccessContext) {
  return (
    isTaskSubmissionAuthor(task, ctx) &&
    (task.approval_status === "pending" || task.approval_status === "changes_requested")
  );
}

export function canResubmitTask(task: TaskRow, ctx: TaskAccessContext) {
  return (
    isTaskSubmissionAuthor(task, ctx) &&
    (task.approval_status === "changes_requested" || task.approval_status === "withdrawn")
  );
}

export interface TaskSubmissionInput {
  projectId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  deadline: string;
  priority: TaskPriority;
  participantIds: string[];
}

/** Gửi Leader duyệt — mọi ràng buộc phạm vi được chốt trong RPC phía database. */
export async function submitTaskForApproval(input: TaskSubmissionInput) {
  const { data, error } = await supabase.rpc("task_member_submit", {
    _project: input.projectId,
    _name: input.name,
    _description: input.description ?? "",
    // Không có ngày bắt đầu → gửi NULL cho database (kiểu sinh tự động không cho null).
    _start_date: (input.startDate ?? null) as unknown as string,
    _deadline: input.deadline,
    _priority: input.priority,
    _participants: input.participantIds,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function resubmitTaskForApproval(taskId: string) {
  const { error } = await supabase.rpc("task_member_resubmit", { _task: taskId });
  if (error) throw new Error(error.message);
}

export async function withdrawTaskSubmission(taskId: string) {
  const { error } = await supabase.rpc("task_member_withdraw", { _task: taskId });
  if (error) throw new Error(error.message);
}

export async function decideTaskApproval(taskId: string, approve: boolean, note?: string | null) {
  const args = { _task: taskId, _approve: approve, ...(note ? { _note: note } : {}) };
  const { error } = await supabase.rpc("task_approval_decide", args);
  if (error) throw new Error(error.message);
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

/**
 * Hoàn thành công việc: bắt buộc kèm Kết quả công việc.
 * Kết quả mới thay kết quả hiện tại; bản cũ được database giữ trong lịch sử.
 */
export async function completeTaskWithResult(id: string, result: string) {
  const text = result.trim();
  if (!text) throw new Error("Cần nhập Kết quả công việc trước khi hoàn thành.");
  const { error } = await supabase
    .from("tasks")
    .update({ result_text: text, status: "done" })
    .eq("id", id);
  fail(error);
}

/** Cập nhật riêng kết quả (không đổi trạng thái). */
export async function updateTaskResult(id: string, result: string) {
  const text = result.trim();
  if (!text) throw new Error("Cần nhập Kết quả công việc.");
  const { error } = await supabase.from("tasks").update({ result_text: text }).eq("id", id);
  fail(error);
}

export interface TaskResultEntry {
  id: string;
  result_text: string;
  created_at: string;
  created_by: string | null;
  authorName: string | null;
}

export async function fetchTaskResults(taskId: string): Promise<TaskResultEntry[]> {
  const { data, error } = await supabase
    .from("task_results")
    .select("id,result_text,created_at,created_by,author:profiles(display_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const raw = row as Record<string, unknown>;
    const author = raw["author"] as { display_name: string } | null;
    return {
      id: raw["id"] as string,
      result_text: raw["result_text"] as string,
      created_at: raw["created_at"] as string,
      created_by: (raw["created_by"] as string | null) ?? null,
      authorName: author?.display_name ?? null,
    };
  });
}

export const taskResultsQuery = (taskId: string) =>
  queryOptions({ queryKey: ["task-results", taskId], queryFn: () => fetchTaskResults(taskId) });

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
