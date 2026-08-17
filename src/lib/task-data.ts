import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { AppRoleKey } from "@/lib/permissions";
import { isLockedMember, MASKED_NAME, maskName, primeLockedIdentity } from "@/lib/member-identity";
import { memberName, memberTeamId, primeMemberNames } from "@/lib/member-names";
import { primeTaskLookups, projectLookup, teamNameLookup } from "@/lib/task-lookups";
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
import { normalizeTaskWeight, type TaskWorkWeight } from "@/lib/task-weight";

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
  /** MVP-FIX-03 — Trọng số công việc (1/2/3/5), độc lập với Mức ưu tiên. */
  work_weight: TaskWorkWeight;
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
  /** TASK-WORKFLOW-UX-01 — Người duyệt bắt buộc khi tạo Task. */
  reviewer_type: TaskReviewerKind | null;
  reviewer_id: string | null;
  reviewerName: string | null;
  /** TASK-RULE-XX — hủy công việc: chỉ xem chi tiết và lịch sử sau khi hủy. */
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  /** TASK-RECUR-01 — Task được sinh tự động từ lịch lặp. */
  recurrence_rule_id: string | null;
  occurrence_date: string | null;
}

/* ================= Người duyệt Task ================= */

/** Bao gồm cả `project_owner` để hiển thị đúng Task lịch sử. */
export type TaskReviewerKind = "project_owner" | "my_leader" | "cmo";

/** TASK-APPROVAL-01 — chỉ hai lựa chọn hợp lệ cho submission mới. */
export type TaskReviewerSelectableKind = "my_leader" | "cmo";

export const TASK_REVIEWER_LABEL: Record<TaskReviewerKind, string> = {
  project_owner: "Chủ dự án",
  my_leader: "Leader của tôi",
  cmo: "CMO",
};

export const TASK_REVIEWER_ORDER: TaskReviewerSelectableKind[] = ["my_leader", "cmo"];

export interface TaskReviewerOption {
  kind: TaskReviewerKind;
  userId: string;
  displayName: string;
}

/**
 * Ba lựa chọn Người duyệt hợp lệ (database là nguồn xác thực cuối cùng).
 * Lựa chọn nào không có người thật sẽ không xuất hiện trong danh sách.
 */
export async function fetchTaskReviewerOptions(
  projectId: string | null,
): Promise<TaskReviewerOption[]> {
  const { data, error } = await supabase.rpc("task_reviewer_candidates", {
    _project: projectId as unknown as string,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { kind: string; user_id: string; display_name: string }[]).map((row) => ({
    kind: row.kind as TaskReviewerKind,
    userId: row.user_id,
    displayName: row.display_name,
  }));
}

export const taskReviewerOptionsQuery = (projectId: string | null) =>
  queryOptions({
    queryKey: ["task-reviewer-options", projectId],
    queryFn: () => fetchTaskReviewerOptions(projectId),
    staleTime: 30_000,
  });

/**
 * TASK-PERF-01 — danh sách chỉ đọc cột của chính bảng `tasks` cộng một quan hệ
 * nhiều-nhiều bắt buộc (`task_participants`). Tên người, Dự án và Team lấy từ
 * danh bạ nội bộ và bảng tra cứu đã nạp sẵn: cùng dữ liệu, cùng phạm vi RLS,
 * nhưng không còn 7 truy vấn con chạy lại cho từng dòng.
 */
const SELECT = `
  id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,work_weight,status,
  is_archived,completed_at,manually_archived_at,manually_archived_by,
  cancelled_at,cancelled_by,cancel_reason,
  result_text,result_updated_at,result_updated_by,
  created_by,created_at,updated_at,
  approval_status,approval_round,submitted_at,approval_decided_at,approval_decided_by,approval_note,
  reviewer_type,reviewer_id,recurrence_rule_id,occurrence_date
`;

/** Chi tiết một Task: nhúng người tham gia là đủ rẻ vì chỉ có một dòng. */
const SELECT_ONE = `${SELECT},task_participants(user_id)`;

type RawTask = Record<string, unknown>;
type ParticipantMap = Map<string, string[]>;

/**
 * Người tham gia của mọi Task nhìn thấy được, lấy trong một lượt song song với
 * truy vấn danh sách. Điều kiện hiển thị do database quyết định, giống hệt RLS.
 */
async function fetchParticipantMap(): Promise<ParticipantMap> {
  const map: ParticipantMap = new Map();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: { task_id: string; user_id: string }[] | null; error: unknown }>
  )("task_participants_visible");
  if (error) return map;
  for (const row of data ?? []) {
    if (!row.task_id || !row.user_id) continue;
    const list = map.get(row.task_id);
    if (list) list.push(row.user_id);
    else map.set(row.task_id, [row.user_id]);
  }
  return map;
}

/** Tên hiển thị từ danh bạ nội bộ, giữ nguyên quy tắc che tên tài khoản đã khóa. */
function displayName(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const name = memberName(userId);
  if (!name) return isLockedMember(userId) ? MASKED_NAME : null;
  return (maskName(name, userId) as string | null) ?? null;
}

/** Nạp song song mọi dữ liệu phụ trợ cần cho việc map Task. */
function primeTaskContext(): Promise<unknown> {
  return Promise.all([primeLockedIdentity(), primeMemberNames(), primeTaskLookups()]);
}

function mapTask(raw: RawTask, participantMap?: ParticipantMap): TaskRow {
  const project = projectLookup(raw["project_id"] as string | null);
  const assigneeId = raw["assignee_id"] as string;
  const participantIds = participantMap
    ? (participantMap.get(raw["id"] as string) ?? [])
    : ((raw["task_participants"] ?? []) as { user_id: string }[]).map((p) => p.user_id);

  return {
    id: raw["id"] as string,
    name: raw["name"] as string,
    description: (raw["description"] as string | null) ?? null,
    project_id: (raw["project_id"] as string | null) ?? null,
    projectName: project?.name ?? null,
    projectOwnerId: project?.owner_id ?? null,
    projectManuallyArchivedAt: project?.manually_archived_at ?? null,
    projectResponsibleTeamId: project?.responsible_team_id ?? null,
    assignee_id: assigneeId,
    assigneeName: displayName(assigneeId),
    assigneeTeamId: memberTeamId(assigneeId),
    team_id: (raw["team_id"] as string | null) ?? null,
    teamName: teamNameLookup(raw["team_id"] as string | null),
    start_date: (raw["start_date"] as string | null) ?? null,
    deadline: raw["deadline"] as string,
    priority: raw["priority"] as TaskPriority,
    work_weight: normalizeTaskWeight(raw["work_weight"]),
    status: raw["status"] as TaskStatus,
    is_archived: Boolean(raw["is_archived"]),
    completed_at: (raw["completed_at"] as string | null) ?? null,
    result_text: (raw["result_text"] as string | null) ?? null,
    result_updated_at: (raw["result_updated_at"] as string | null) ?? null,
    result_updated_by: (raw["result_updated_by"] as string | null) ?? null,
    resultUpdatedByName: displayName(raw["result_updated_by"] as string | null),
    manually_archived_at: (raw["manually_archived_at"] as string | null) ?? null,
    manually_archived_by: (raw["manually_archived_by"] as string | null) ?? null,
    created_by: raw["created_by"] as string,
    creatorName: displayName(raw["created_by"] as string | null),
    created_at: raw["created_at"] as string,
    updated_at: raw["updated_at"] as string,
    approval_status: (raw["approval_status"] as TaskApprovalStatus | null) ?? "approved",
    approval_round: (raw["approval_round"] as number | null) ?? 0,
    submitted_at: (raw["submitted_at"] as string | null) ?? null,
    approval_decided_at: (raw["approval_decided_at"] as string | null) ?? null,
    approval_decided_by: (raw["approval_decided_by"] as string | null) ?? null,
    approvalDecidedByName: null,
    approval_note: (raw["approval_note"] as string | null) ?? null,
    participantIds,
    participantNames: participantIds.map((id) => displayName(id) ?? "—"),
    reviewer_type: (raw["reviewer_type"] as TaskReviewerKind | null) ?? null,
    reviewer_id: (raw["reviewer_id"] as string | null) ?? null,
    reviewerName: displayName((raw["reviewer_id"] as string | null) ?? null),
    cancelled_at: (raw["cancelled_at"] as string | null) ?? null,
    cancelled_by: (raw["cancelled_by"] as string | null) ?? null,
    cancel_reason: (raw["cancel_reason"] as string | null) ?? null,
    recurrence_rule_id: (raw["recurrence_rule_id"] as string | null) ?? null,
    occurrence_date: (raw["occurrence_date"] as string | null) ?? null,
  };
}

export async function fetchTasks(): Promise<TaskRow[]> {
  // Truy vấn Task chạy song song với việc nạp danh bạ/tra cứu, không phải xếp hàng chờ.
  const context = primeTaskContext();
  const participants = fetchParticipantMap();
  const request = supabase
    .from("tasks")
    .select(SELECT)
    .is("deleted_at", null)
    // Task đã hủy vẫn phải đọc được để hiển thị trong Lưu trữ, kể cả khi chưa từng được duyệt.
    .or("approval_status.eq.approved,cancelled_at.not.is.null")
    .order("deadline", { ascending: true });
  const [{ data, error }, participantMap] = await Promise.all([request, participants, context]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as unknown as RawTask, participantMap));
}

/**
 * Yêu cầu duyệt đang còn hiệu lực (chưa duyệt, chưa thu hồi).
 * Yêu cầu đã thu hồi chỉ còn dấu vết trong Lịch sử hoạt động.
 */
export async function fetchTaskApprovals(): Promise<TaskRow[]> {
  const context = primeTaskContext();
  const participants = fetchParticipantMap();
  const request = supabase
    .from("tasks")
    .select(SELECT)
    .is("deleted_at", null)
    .is("cancelled_at", null)
    .in("approval_status", ["pending", "changes_requested"])
    .order("created_at", { ascending: false });
  const [{ data, error }, participantMap] = await Promise.all([request, participants, context]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as unknown as RawTask, participantMap));
}

export const taskApprovalsQuery = () =>
  queryOptions({ queryKey: ["task-approvals"], queryFn: fetchTaskApprovals });

export async function fetchTask(id: string): Promise<TaskRow | null> {
  const context = primeTaskContext();
  const request = supabase
    .from("tasks")
    .select(SELECT_ONE)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const [{ data, error }] = await Promise.all([request, context]);
  if (error) throw new Error(error.message);
  return data ? mapTask(data as unknown as RawTask) : null;
}

export const tasksQuery = () => queryOptions({ queryKey: ["tasks"], queryFn: fetchTasks });

/* ---- CEN-PERF-05 — Task của MỘT dự án, chỉ tải khi accordion được mở ---- */

async function fetchProjectParticipantMap(projectId: string): Promise<ParticipantMap> {
  const map: ParticipantMap = new Map();
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: { task_id: string; user_id: string }[] | null; error: unknown }>
  )("task_participants_visible", { _project: projectId });
  if (error) return map;
  for (const row of data ?? []) {
    if (!row.task_id || !row.user_id) continue;
    const list = map.get(row.task_id);
    if (list) list.push(row.user_id);
    else map.set(row.task_id, [row.user_id]);
  }
  return map;
}

/** Cùng phạm vi/điều kiện với fetchTasks nhưng giới hạn theo một dự án; RLS vẫn quyết định. */
export async function fetchProjectTasks(projectId: string): Promise<TaskRow[]> {
  const context = primeTaskContext();
  const participants = fetchProjectParticipantMap(projectId);
  const request = supabase
    .from("tasks")
    .select(SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .or("approval_status.eq.approved,cancelled_at.not.is.null")
    .order("deadline", { ascending: true });
  const [{ data, error }, participantMap] = await Promise.all([request, participants, context]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTask(row as unknown as RawTask, participantMap));
}

export const projectTasksQuery = (projectId: string, enabled = true) =>
  queryOptions({
    queryKey: ["project-tasks", projectId],
    queryFn: () => fetchProjectTasks(projectId),
    enabled: enabled && projectId !== "",
    // Cache ngắn: đóng rồi mở lại accordion không refetch ngay.
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

/**
 * Sau mutation Task: chỉ làm mới Task của đúng dự án liên quan và bảng KPI tổng hợp.
 * Không có project_id (Task độc lập) thì chỉ làm mới KPI.
 */
export function invalidateProjectTaskScope(
  queryClient: { invalidateQueries: (filters: { queryKey: unknown[] }) => unknown },
  projectId: string | null | undefined,
) {
  if (projectId) queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
  queryClient.invalidateQueries({ queryKey: ["project-task-overview"] });
}

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
  if (isTaskCancelled(task)) return false;
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

/* ---- TASK-RULE-XX — Hủy công việc ---- */

export function isTaskCancelled(task: TaskRow) {
  return task.cancelled_at !== null;
}

/** Nhãn trạng thái hiển thị: Task đã hủy luôn hiện "Đã hủy". */
export function taskStatusView(task: TaskRow): { label: string; tone: StatusTone } {
  if (isTaskCancelled(task)) return { label: "Đã hủy", tone: "error" };
  return { label: TASK_STATUS_LABEL[task.status], tone: TASK_STATUS_TONE[task.status] };
}

/**
 * Chỉ ẩn/hiện nút; quyền thật do RPC `task_cancel` kiểm tra ở database.
 * TASK-FIX-04: Admin/CMO/Leader hủy mọi Task hợp lệ (Leader không bị giới hạn Team/Dự án);
 * người tạo vẫn được hủy Task của mình khi chưa bắt đầu.
 * Quyền Lưu trữ/Khôi phục thủ công giữ nguyên chỉ cho Admin/CMO.
 */
export function canCancelTask(task: TaskRow, ctx: TaskAccessContext) {
  if (isTaskCancelled(task)) return false;
  if (task.status === "done") return false;
  if (isTaskManuallyArchived(task)) return false;
  if (privileged(ctx) || ctx.role === "leader") return true;
  if (ctx.userId && task.created_by === ctx.userId && task.status === "not_started") return true;
  return false;
}

export async function cancelTask(taskId: string, reason: string) {
  const text = reason.trim();
  if (!text) throw new Error("Cần nhập lý do hủy.");
  const { error } = await supabase.rpc("task_cancel", { _task: taskId, _reason: text });
  if (error) throw new Error(error.message);
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
    isTaskCancelled(task) ||
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

/**
 * Member chỉ được tự nhận việc — trừ khi họ là Chủ dự án đang chọn:
 * Chủ dự án được giao việc cho nhân sự khác thuộc phạm vi dự án (database kiểm tra lại).
 */
export function canAssignToOthers(
  ctx: TaskAccessContext,
  project?: { owner_id?: string | null } | null,
) {
  if (privileged(ctx) || ctx.role === "leader") return true;
  return Boolean(ctx.userId && project?.owner_id && project.owner_id === ctx.userId);
}

/* ================= Luồng duyệt Task của Member ================= */

/** Member phải gửi Leader duyệt thay vì tạo Task chính thức. */
export function isMemberSubmissionFlow(ctx: TaskAccessContext) {
  return ctx.role === "member";
}

export function isTaskAwaitingApproval(task: TaskRow) {
  return task.approval_status !== "approved";
}

/** Duyệt: Admin/CMO xem tất cả; người khác chỉ khi được chỉ định là Người duyệt. */
export function canApproveTaskSubmission(task: TaskRow, ctx: TaskAccessContext) {
  if (isTaskCancelled(task)) return false;
  if (!isTaskAwaitingApproval(task)) return false;
  if (task.approval_status === "withdrawn") return false;
  if (privileged(ctx)) return true;
  if (task.reviewer_id) return Boolean(ctx.userId && task.reviewer_id === ctx.userId);
  return Boolean(
    ctx.leaderTeamId && task.projectResponsibleTeamId === ctx.leaderTeamId,
  );
}

export function isTaskSubmissionAuthor(task: TaskRow, ctx: TaskAccessContext) {
  return Boolean(ctx.userId && task.created_by === ctx.userId);
}

export function canWithdrawTaskSubmission(task: TaskRow, ctx: TaskAccessContext) {
  return (
    !isTaskCancelled(task) &&
    isTaskSubmissionAuthor(task, ctx) &&
    (task.approval_status === "pending" || task.approval_status === "changes_requested")
  );
}

export function canResubmitTask(task: TaskRow, ctx: TaskAccessContext) {
  return (
    !isTaskCancelled(task) &&
    isTaskSubmissionAuthor(task, ctx) &&
    task.approval_status === "changes_requested"
  );
}

export interface TaskSubmissionInput {
  projectId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  deadline: string;
  priority: TaskPriority;
  workWeight: TaskWorkWeight;
  participantIds: string[];
  reviewerType: TaskReviewerSelectableKind;
  reviewerId: string;
  /** Chủ dự án có thể giao việc cho người khác; bỏ trống = tự nhận việc. */
  assigneeId?: string | null;
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
    _work_weight: input.workWeight,
    _participants: input.participantIds,
    _reviewer_type: input.reviewerType,
    _reviewer: input.reviewerId,
    // Luôn gửi cùng một shape để khớp đúng một signature RPC duy nhất.
    _assignee: (input.assigneeId ?? null) as unknown as string,
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
  workWeight: TaskWorkWeight;
  status: TaskStatus;
  reviewerType?: TaskReviewerKind | null;
  reviewerId?: string | null;
}

export async function createTask(input: TaskInput & { createdBy: string }) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      // work_weight: kiểu sinh tự động chưa có cột mới, ghi qua object mở rộng.
      ...({ work_weight: input.workWeight } as unknown as Record<string, never>),
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
      reviewer_type: input.reviewerType ?? null,
      reviewer_id: input.reviewerId ?? null,
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
  if (input.workWeight !== undefined) {
    (payload as Record<string, unknown>)["work_weight"] = input.workWeight;
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.reviewerType !== undefined) payload.reviewer_type = input.reviewerType;
  if (input.reviewerId !== undefined) payload.reviewer_id = input.reviewerId;
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
  await Promise.all([primeLockedIdentity(), primeMemberNames()]);
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
      authorName: maskName(author?.display_name) ?? null,
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
  if (task.status === "done" || task.is_archived || isTaskCancelled(task)) return false;
  return isPastInstant(task.deadline);
}

/* ---- Bộ đếm deadline tương đối (chỉ trình bày, không đổi Business Rule) ---- */

export type DeadlineTone = "muted" | "safe" | "warning" | "danger";

export interface DeadlineCountdown {
  label: string;
  tone: DeadlineTone;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function humanizeSpan(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} phút`;
  if (ms < DAY) return `${Math.max(1, Math.round(ms / HOUR))} giờ`;
  return `${Math.max(1, Math.floor(ms / DAY))} ngày`;
}

/**
 * Bộ đếm tương đối tới deadline theo múi giờ nghiệp vụ.
 * Task đã hoàn thành/lưu trữ được "đóng băng" tại mốc hoàn thành, không đếm tiếp quá hạn.
 */
export function taskDeadlineCountdown(task: TaskRow, nowMs: number = Date.now()): DeadlineCountdown {
  const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : NaN;
  if (!task.deadline || Number.isNaN(deadlineMs)) return { label: "Không có hạn", tone: "muted" };

  const finished = task.status === "done" || task.is_archived;
  if (finished) {
    const doneMs = task.completed_at ? new Date(task.completed_at).getTime() : NaN;
    if (Number.isNaN(doneMs)) return { label: "Đã kết thúc", tone: "muted" };
    const late = doneMs - deadlineMs;
    return late > 0
      ? { label: `Trễ hạn ${humanizeSpan(late)}`, tone: "muted" }
      : { label: "Đúng hạn", tone: "muted" };
  }

  const diff = deadlineMs - nowMs;
  if (diff < 0) return { label: `Quá hạn ${humanizeSpan(-diff)}`, tone: "danger" };
  if (formatHanoiDate(task.deadline) === formatHanoiDate(new Date(nowMs).toISOString()))
    return { label: "Hạn hôm nay", tone: "warning" };
  if (diff < DAY) return { label: `Còn ${humanizeSpan(diff)}`, tone: "warning" };
  return { label: `Còn ${humanizeSpan(diff)}`, tone: "safe" };
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
  await Promise.all([primeLockedIdentity(), primeMemberNames()]);
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
