import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { AppRoleKey } from "@/lib/permissions";

/**
 * CEN 1.0 — M2 Project data layer.
 * Đọc/ghi qua client trình duyệt; RLS + trigger phía database là ràng buộc thật.
 * Các helper quyền ở đây chỉ để UI ẩn/disable đúng, không thay thế kiểm tra backend.
 */
export type ProjectStatus = Database["public"]["Enums"]["project_status"];

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "idea",
  "rejected",
  "leader_review",
  "proposal",
  "planning",
  "in_progress",
  "pending_acceptance",
  "completed",
  "archived",
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: "Bản nháp",
  rejected: "Bị từ chối",
  leader_review: "Chờ Leader duyệt",
  proposal: "Chờ CMO duyệt",
  planning: "Đã duyệt",
  in_progress: "Đang thực hiện",
  pending_acceptance: "Chờ nghiệm thu",
  completed: "Hoàn thành",
  archived: "Lưu trữ",
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, StatusTone> = {
  idea: "neutral",
  rejected: "error",
  leader_review: "warning",
  proposal: "warning",
  planning: "progress",
  in_progress: "progress",
  pending_acceptance: "warning",
  completed: "success",
  archived: "neutral",
};

export interface ProjectRow {
  id: string;
  name: string;
  objective: string;
  description: string | null;
  owner_id: string | null;
  ownerName: string | null;
  creatorName: string | null;
  creatorTeamId: string | null;
  start_date: string | null;
  deadline: string | null;
  status: ProjectStatus;
  last_decision_note: string | null;
  completed_at: string | null;
  manually_archived_at: string | null;
  manually_archived_by: string | null;
  responsible_team_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  approval_round: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  teamIds: string[];
  memberIds: string[];
  memberNames: string[];
  facilityIds: string[];
}

const SELECT = `
  id,name,objective,description,owner_id,start_date,deadline,status,last_decision_note,
  completed_at,manually_archived_at,manually_archived_by,
  responsible_team_id,submitted_at,approved_at,rejected_at,rejection_reason,approval_round,
  created_by,created_at,updated_at,
  owner:profiles!projects_owner_id_fkey(id,display_name),
  creator:profiles!projects_created_by_fkey(id,display_name,primary_team_id),
  project_teams(team_id),
  project_members(user_id,profiles(display_name)),
  project_facilities(facility_id)
`;

type RawProject = Record<string, unknown>;

function mapProject(raw: RawProject): ProjectRow {
  const owner = raw["owner"] as { display_name: string } | null;
  const creator = raw["creator"] as { display_name: string; primary_team_id: string | null } | null;
  const teams = (raw["project_teams"] ?? []) as { team_id: string }[];
  const members = (raw["project_members"] ?? []) as {
    user_id: string;
    profiles: { display_name: string } | null;
  }[];
  const facilities = (raw["project_facilities"] ?? []) as { facility_id: string }[];

  return {
    id: raw["id"] as string,
    name: raw["name"] as string,
    objective: raw["objective"] as string,
    description: (raw["description"] as string | null) ?? null,
    owner_id: (raw["owner_id"] as string | null) ?? null,
    ownerName: owner?.display_name ?? null,
    creatorName: creator?.display_name ?? null,
    creatorTeamId: creator?.primary_team_id ?? null,
    start_date: (raw["start_date"] as string | null) ?? null,
    deadline: (raw["deadline"] as string | null) ?? null,
    status: raw["status"] as ProjectStatus,
    last_decision_note: (raw["last_decision_note"] as string | null) ?? null,
    completed_at: (raw["completed_at"] as string | null) ?? null,
    manually_archived_at: (raw["manually_archived_at"] as string | null) ?? null,
    manually_archived_by: (raw["manually_archived_by"] as string | null) ?? null,
    responsible_team_id: (raw["responsible_team_id"] as string | null) ?? null,
    submitted_at: (raw["submitted_at"] as string | null) ?? null,
    approved_at: (raw["approved_at"] as string | null) ?? null,
    rejected_at: (raw["rejected_at"] as string | null) ?? null,
    rejection_reason: (raw["rejection_reason"] as string | null) ?? null,
    approval_round: (raw["approval_round"] as number | null) ?? 0,
    created_by: raw["created_by"] as string,
    created_at: raw["created_at"] as string,
    updated_at: raw["updated_at"] as string,
    teamIds: teams.map((t) => t.team_id),
    memberIds: members.map((m) => m.user_id),
    memberNames: members.map((m) => m.profiles?.display_name ?? "—"),
    facilityIds: facilities.map((f) => f.facility_id),
  };
}

export async function fetchProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapProject(row as RawProject));
}

export async function fetchProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProject(data as RawProject) : null;
}

export const projectsQuery = () => queryOptions({ queryKey: ["projects"], queryFn: fetchProjects });

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ["project", id], queryFn: () => fetchProject(id) });

/**
 * Số công việc của từng dự án ("Số CV").
 * Một truy vấn duy nhất cho cả danh sách: chỉ lấy `project_id` của Task còn hiệu lực.
 * Task độc lập không được đếm; Task đã xóa mềm bị RLS loại khỏi kết quả.
 */
export async function fetchProjectTaskCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,project_id")
    .is("deleted_at", null)
    .not("project_id", "is", null);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const projectId = row.project_id;
    if (!projectId) continue;
    counts[projectId] = (counts[projectId] ?? 0) + 1;
  }
  return counts;
}

export const projectTaskCountsQuery = () =>
  queryOptions({ queryKey: ["project-task-counts"], queryFn: fetchProjectTaskCounts });

/** Danh sách nhân sự đang hoạt động mà người dùng hiện tại được nhìn thấy (RLS quyết định). */
export interface PersonOption {
  id: string;
  display_name: string;
}

export async function fetchActivePeople(): Promise<PersonOption[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,status")
    .eq("status", "active")
    .order("display_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, display_name: row.display_name }));
}

export const activePeopleQuery = () =>
  queryOptions({ queryKey: ["active-people"], queryFn: fetchActivePeople });

/* ================= Quyền (mirror của RLS/trigger) ================= */

export interface ProjectAccessContext {
  userId: string | null;
  role: AppRoleKey | null;
  leaderTeamId: string | null;
}

const privileged = (ctx: ProjectAccessContext) => ctx.role === "admin" || ctx.role === "cmo";

export function isProjectOwner(project: ProjectRow, ctx: ProjectAccessContext) {
  return Boolean(ctx.userId && project.owner_id === ctx.userId);
}

export function isProjectCreator(project: ProjectRow, ctx: ProjectAccessContext) {
  return Boolean(ctx.userId && project.created_by === ctx.userId);
}

/** Trạng thái chưa được duyệt: bản nháp, đang chờ duyệt hoặc bị từ chối. */
export const PROJECT_UNAPPROVED_STATUSES: ProjectStatus[] = [
  "idea",
  "leader_review",
  "proposal",
  "rejected",
];

export function isProjectApproved(project: ProjectRow) {
  return !PROJECT_UNAPPROVED_STATUSES.includes(project.status);
}

export function isProjectPendingApproval(project: ProjectRow) {
  return project.status === "leader_review" || project.status === "proposal";
}

export function isProjectDraft(project: ProjectRow) {
  return project.status === "idea";
}

export function isProjectRejected(project: ProjectRow) {
  return project.status === "rejected";
}

/** Leader của Team phụ trách — người duyệt bước đầu khi Member tạo dự án. */
export function isResponsibleLeader(project: ProjectRow, ctx: ProjectAccessContext) {
  return Boolean(
    ctx.leaderTeamId &&
    project.responsible_team_id &&
    ctx.leaderTeamId === project.responsible_team_id,
  );
}

/** Sửa nội dung dự án (không gồm chuyển trạng thái). */
export function canEditProject(project: ProjectRow, ctx: ProjectAccessContext) {
  if (project.status === "archived") return privileged(ctx);
  if (project.status === "idea" || project.status === "rejected") {
    return isProjectCreator(project, ctx) || privileged(ctx);
  }
  if (isProjectPendingApproval(project)) return privileged(ctx);
  return privileged(ctx) || isProjectOwner(project, ctx);
}

/** Gửi duyệt / gửi lại sau khi bị từ chối. */
export function canSubmitProject(project: ProjectRow, ctx: ProjectAccessContext) {
  if (project.status !== "idea" && project.status !== "rejected") return false;
  return isProjectCreator(project, ctx) || privileged(ctx);
}

/** Bước duyệt hiện tại của dự án, nếu có. */
export function approvalStage(project: ProjectRow): "leader" | "cmo" | null {
  if (project.status === "leader_review") return "leader";
  if (project.status === "proposal") return "cmo";
  return null;
}

/** Người dùng hiện tại được quyết định duyệt / từ chối ở bước đang chờ. */
export function canDecideProject(project: ProjectRow, ctx: ProjectAccessContext) {
  const stage = approvalStage(project);
  if (!stage) return false;
  // Admin và CMO là quản trị toàn hệ thống: duyệt được mọi bước, không phụ thuộc Team.
  if (privileged(ctx)) return true;
  if (stage === "cmo") return false;
  return isResponsibleLeader(project, ctx);
}

/** Lưu trữ thủ công: chỉ Admin và CMO, không đổi trạng thái nghiệp vụ. */
export function isProjectManuallyArchived(project: ProjectRow) {
  return project.manually_archived_at !== null;
}

export function canManuallyArchiveProject(project: ProjectRow, ctx: ProjectAccessContext) {
  return privileged(ctx) && !isProjectManuallyArchived(project);
}

/** Chỉ dữ liệu lưu trữ thủ công mới được khôi phục; dữ liệu hoàn thành thì không. */
export function canRestoreProject(project: ProjectRow, ctx: ProjectAccessContext) {
  return privileged(ctx) && isProjectManuallyArchived(project);
}

/** Dự án thuộc khu vực Lưu trữ: hoàn thành, đã lưu trữ theo trạng thái, hoặc lưu trữ thủ công. */
export function isProjectArchived(project: ProjectRow) {
  return (
    project.status === "completed" ||
    project.status === "archived" ||
    isProjectManuallyArchived(project)
  );
}

/** Hoàn thành trước hạn: dữ liệu suy ra từ completed_at và deadline. */
export function isCompletedEarly(project: ProjectRow) {
  if (!project.completed_at || !project.deadline) return false;
  // Deadline dự án theo ngày: mốc hết ngày 23:59 giờ Hà Nội.
  const end = new Date(`${project.deadline}T23:59:59+07:00`).getTime();
  return new Date(project.completed_at).getTime() < end;
}

/** Gửi yêu cầu đổi deadline: Project Owner, Leader đúng phạm vi, Admin và CMO. */
export function canRequestProjectDeadline(project: ProjectRow, ctx: ProjectAccessContext) {
  if (isProjectArchived(project) || !isProjectApproved(project)) return false;
  if (privileged(ctx) || isProjectOwner(project, ctx)) return true;
  return Boolean(ctx.leaderTeamId && project.teamIds.includes(ctx.leaderTeamId));
}

/** Duyệt yêu cầu đổi deadline dự án: chỉ Admin và CMO. */
export function canApproveProjectDeadline(ctx: ProjectAccessContext) {
  return privileged(ctx);
}

const RUN_TRANSITIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  planning: ["in_progress"],
  in_progress: ["pending_acceptance"],
  pending_acceptance: ["completed", "in_progress"],
};

/** Bước trạng thái hợp lệ kế tiếp của dự án đã duyệt. */
export function nextStatuses(project: ProjectRow, ctx: ProjectAccessContext): ProjectStatus[] {
  if (!(privileged(ctx) || isProjectOwner(project, ctx))) return [];
  return RUN_TRANSITIONS[project.status] ?? [];
}

/* ================= Ghi dữ liệu ================= */

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Gửi duyệt (hoặc gửi lại sau khi bị từ chối). Quyền và bước duyệt do database quyết định. */
export async function submitProject(projectId: string): Promise<ProjectStatus> {
  const { data, error } = await supabase.rpc("project_submit", { _project: projectId });
  if (error) throw new Error(error.message);
  return data as ProjectStatus;
}

/** Duyệt hoặc từ chối ở bước hiện tại. Từ chối bắt buộc có lý do. */
export async function decideProject(
  projectId: string,
  approve: boolean,
  reason?: string | null,
): Promise<ProjectStatus> {
  const { data, error } = await supabase.rpc("project_decide", {
    _project: projectId,
    _approve: approve,
    ...(reason ? { _reason: reason } : {}),
  });
  if (error) throw new Error(error.message);
  return data as ProjectStatus;
}

/** Lịch sử phê duyệt của một dự án. */
export interface ProjectApprovalEntry {
  id: string;
  round: number;
  stage: string;
  action: string;
  actorName: string | null;
  actor_role: string | null;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus | null;
  reason: string | null;
  created_at: string;
}

export const APPROVAL_ACTION_LABEL: Record<string, string> = {
  submitted: "Gửi duyệt",
  approved: "Duyệt",
  rejected: "Từ chối",
  auto_approved: "Tạo và duyệt ngay",
};

export const APPROVAL_STAGE_LABEL: Record<string, string> = {
  leader: "Bước Leader",
  cmo: "Bước CMO",
  auto: "Tự động",
};

export async function fetchProjectApprovals(projectId: string): Promise<ProjectApprovalEntry[]> {
  const { data, error } = await supabase
    .from("project_approvals")
    .select(
      "id,round,stage,action,actor_role,from_status,to_status,reason,created_at,actor:profiles(display_name)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const raw = row as RawProject;
    const actor = raw["actor"] as { display_name: string } | null;
    return {
      id: raw["id"] as string,
      round: (raw["round"] as number | null) ?? 1,
      stage: raw["stage"] as string,
      action: raw["action"] as string,
      actorName: actor?.display_name ?? null,
      actor_role: (raw["actor_role"] as string | null) ?? null,
      from_status: (raw["from_status"] as ProjectStatus | null) ?? null,
      to_status: (raw["to_status"] as ProjectStatus | null) ?? null,
      reason: (raw["reason"] as string | null) ?? null,
      created_at: raw["created_at"] as string,
    };
  });
}

export const projectApprovalsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-approvals", projectId],
    queryFn: () => fetchProjectApprovals(projectId),
  });

export interface ProjectDetailInput {
  name: string;
  objective: string;
  description: string | null;
  ownerId: string | null;
  startDate: string | null;
  deadline: string | null;
  responsibleTeamId?: string | null;
}

export async function updateProjectDetail(id: string, input: ProjectDetailInput) {
  const { error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      objective: input.objective,
      description: input.description,
      owner_id: input.ownerId,
      start_date: input.startDate,
      deadline: input.deadline,
      ...(input.responsibleTeamId === undefined
        ? {}
        : { responsible_team_id: input.responsibleTeamId }),
    })
    .eq("id", id);
  fail(error);
}

export async function setProjectStatus(id: string, status: ProjectStatus, note?: string | null) {
  const { error } = await supabase
    .from("projects")
    .update({ status, ...(note === undefined ? {} : { last_decision_note: note }) })
    .eq("id", id);
  fail(error);
}

type LinkTable = "project_teams" | "project_members" | "project_facilities";
const LINK_COLUMN: Record<LinkTable, "team_id" | "user_id" | "facility_id"> = {
  project_teams: "team_id",
  project_members: "user_id",
  project_facilities: "facility_id",
};

/** Đồng bộ liên kết: chỉ thêm/gỡ phần khác nhau để lịch sử ghi đúng thay đổi. */
export async function syncProjectLinks(
  table: LinkTable,
  projectId: string,
  current: string[],
  next: string[],
) {
  const column = LINK_COLUMN[table];
  const removed = current.filter((id) => !next.includes(id));
  const added = next.filter((id) => !current.includes(id));

  if (removed.length > 0) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("project_id", projectId)
      .in(column, removed);
    fail(error);
  }
  if (added.length > 0) {
    const rows = added.map((value) => ({ project_id: projectId, [column]: value }));
    const { error } = await supabase.from(table).insert(rows as never);
    fail(error);
  }
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Tiến độ thời gian theo lịch (0–100). Không phải tiến độ công việc. */
export function timeProgress(project: ProjectRow): number | null {
  if (!project.start_date || !project.deadline) return null;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.deadline).getTime();
  if (end <= start) return 100;
  const ratio = ((Date.now() - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}

export function isOverdue(project: ProjectRow) {
  if (!project.deadline) return false;
  if (project.status === "completed" || project.status === "archived") return false;
  return new Date(project.deadline).getTime() < Date.now();
}

/** Lịch sử thay đổi quan trọng của một dự án (đọc từ nhật ký hoạt động). */
export interface ProjectHistoryEntry {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  before_data: unknown;
  after_data: unknown;
}

export async function fetchProjectHistory(projectId: string): Promise<ProjectHistoryEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,actor_email,created_at,before_data,after_data")
    .eq("entity_type", "project")
    .eq("entity_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectHistoryEntry[];
}

export const projectHistoryQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project-history", projectId],
    queryFn: () => fetchProjectHistory(projectId),
  });
