import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { maskName, primeLockedIdentity } from "@/lib/member-identity";

/**
 * CEN DUTY-02 — Lớp dữ liệu Lịch trực nhật.
 * Quyền thật nằm ở RLS + hàm `duty_set_completed`; lớp này chỉ đọc/ghi và hiển thị lỗi.
 */
export type DutyStatus = Database["public"]["Enums"]["duty_status"];

export const DUTY_STATUS_LABEL: Record<DutyStatus, string> = {
  pending: "Chưa hoàn thành",
  completed: "Đã hoàn thành",
  overdue: "Quá hạn",
};

export const DUTY_START_TIME = "17:30";
export const DUTY_END_TIME = "18:30";
export const DUTY_DUE_TIME = "21:00";

export interface DutyCatalogItem {
  id: string;
  name: string;
  description?: string | null;
}

/** Người phụ trách hiển thị trong lịch trực. */
export interface DutyPerson {
  id: string;
  name: string;
}

/** DUTY-LIST-UX-01 — không để trống tên khi hồ sơ đã bị khóa/không còn hoạt động. */
export const DUTY_UNKNOWN_PERSON = "Thành viên không còn hoạt động";

export interface DutyRuleRow {
  id: string;
  category: string;
  title: string;
  content: string;
  sort_order: number;
}

export interface DutyAssignmentRow {
  id: string;
  duty_date: string;
  start_time: string;
  end_time: string;
  due_time: string;
  area_id: string;
  job_type_id: string;
  area_custom: string | null;
  job_custom: string | null;
  duty_team_id: string | null;
  assignee_id: string | null;
  external_provider_id: string | null;
  note: string | null;
  status: DutyStatus;
  completed_by: string | null;
  completed_at: string | null;
  area: { id: string; name: string } | null;
  job_type: { id: string; name: string } | null;
  duty_team: { id: string; name: string } | null;
  assignee: { id: string; display_name: string } | null;
  completed_person: { id: string; display_name: string } | null;
  provider: { id: string; name: string } | null;
  memberIds: string[];
  memberNames: string[];
  /** Danh sách người phụ trách đã chuẩn hóa tên (không bao giờ rỗng tên). */
  people: DutyPerson[];
}

const SELECT_COLUMNS =
  "id,duty_date,start_time,end_time,due_time,area_id,job_type_id,duty_team_id,assignee_id," +
  "external_provider_id,note,status,completed_by,completed_at,area_custom,job_custom," +
  "area:duty_areas!duty_assignments_area_id_fkey(id,name)," +
  "job_type:duty_job_types!duty_assignments_job_type_id_fkey(id,name)," +
  "duty_team:duty_teams!duty_assignments_duty_team_id_fkey(id,name)," +
  "assignee:profiles!duty_assignments_assignee_id_fkey(id,display_name)," +
  "completed_person:profiles!duty_assignments_completed_by_fkey(id,display_name)," +
  "provider:duty_external_providers!duty_assignments_external_provider_id_fkey(id,name)";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(friendlyDutyError(result.error.message));
  return (result.data ?? []) as T;
}

export function friendlyDutyError(message: string): string {
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  return message;
}

/** Tên khu vực hiển thị: danh mục hoặc nội dung tùy chỉnh. */
export function dutyAreaLabel(row: {
  area?: { name: string } | null;
  area_custom?: string | null;
}): string {
  return row.area?.name ?? (row.area_custom?.trim() || "—");
}

/** Tên nhiệm vụ hiển thị: danh mục hoặc nội dung tùy chỉnh. */
export function dutyJobLabel(row: {
  job_type?: { name: string } | null;
  job_custom?: string | null;
}): string {
  return row.job_type?.name ?? (row.job_custom?.trim() || "—");
}

/** Sau 21:00 giờ Hà Nội của ngày trực mà chưa hoàn thành và có nhân sự nội bộ → Quá hạn (chỉ cảnh báo). */
export function effectiveDutyStatus(row: DutyAssignmentRow, now = new Date()): DutyStatus {
  if (row.status === "completed") return "completed";
  if (!row.assignee_id) return "pending";
  const due = new Date(`${row.duty_date}T${(row.due_time ?? "21:00:00").slice(0, 5)}:00+07:00`);
  return now.getTime() > due.getTime() ? "overdue" : "pending";
}

export function dutyStatusTone(status: DutyStatus): "neutral" | "success" | "error" {
  if (status === "completed") return "success";
  if (status === "overdue") return "error";
  return "neutral";
}

export interface DutyCatalog {
  areas: DutyCatalogItem[];
  jobTypes: DutyCatalogItem[];
  teams: DutyCatalogItem[];
  providers: DutyCatalogItem[];
}

export async function fetchDutyCatalog(): Promise<DutyCatalog> {
  const [areas, jobTypes, teams, providers] = await Promise.all([
    supabase.from("duty_areas").select("id,name,description").eq("is_active", true).order("sort_order"),
    supabase.from("duty_job_types").select("id,name,description").eq("is_active", true).order("sort_order"),
    supabase.from("duty_teams").select("id,name").eq("is_active", true).order("sort_order"),
    supabase
      .from("duty_external_providers")
      .select("id,name")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  return {
    areas: unwrap(areas) as DutyCatalogItem[],
    jobTypes: unwrap(jobTypes) as DutyCatalogItem[],
    teams: unwrap(teams) as DutyCatalogItem[],
    providers: unwrap(providers) as DutyCatalogItem[],
  };
}

export async function fetchDutyRules(): Promise<DutyRuleRow[]> {
  return unwrap(
    await supabase
      .from("duty_rules")
      .select("id,category,title,content,sort_order")
      .eq("is_active", true)
      .order("sort_order"),
  ) as DutyRuleRow[];
}

export interface DutyRange {
  from: string;
  to: string;
}

export async function fetchDutyAssignments(range: DutyRange): Promise<DutyAssignmentRow[]> {
  const rows = unwrap(
    await supabase
      .from("duty_assignments")
      .select(SELECT_COLUMNS)
      .gte("duty_date", range.from)
      .lte("duty_date", range.to)
      .order("duty_date")
      .order("created_at"),
  ) as unknown as DutyAssignmentRow[];
  return attachMembers(rows);
}

/** Việc trực của tôi: các lịch mà tôi là người phụ trách chính hoặc nằm trong danh sách phụ trách. */
export async function fetchMyDutyAssignments(userId: string): Promise<DutyAssignmentRow[]> {
  const memberRows = unwrap(
    await supabase.from("duty_assignment_members").select("assignment_id").eq("user_id", userId),
  ) as { assignment_id: string }[];
  const ids = memberRows.map((row) => row.assignment_id);

  let query = supabase.from("duty_assignments").select(SELECT_COLUMNS).order("duty_date");
  query = ids.length
    ? query.or(`assignee_id.eq.${userId},id.in.(${ids.join(",")})`)
    : query.eq("assignee_id", userId);

  const rows = unwrap(await query) as unknown as DutyAssignmentRow[];
  return attachMembers(rows);
}

async function attachMembers(rows: DutyAssignmentRow[]): Promise<DutyAssignmentRow[]> {
  if (rows.length === 0) return [];
  const members = unwrap(
    await supabase
      .from("duty_assignment_members")
      .select("assignment_id,user_id")
      .in(
        "assignment_id",
        rows.map((row) => row.id),
      ),
  ) as { assignment_id: string; user_id: string }[];

  // Bảng `profiles` bị RLS giới hạn theo phạm vi quản lý nên người khác Team sẽ mất tên.
  // Dùng danh bạ nội bộ (SECURITY DEFINER) để mọi user_id đã phân công đều có tên.
  await primeLockedIdentity();
  const directory = unwrap(await supabase.rpc("member_directory")) as {
    id: string;
    display_name: string | null;
  }[];
  const nameById = new Map(directory.map((p) => [p.id, p.display_name ?? ""]));
  for (const row of rows) {
    if (row.assignee_id && row.assignee?.display_name && !nameById.has(row.assignee_id)) {
      nameById.set(row.assignee_id, row.assignee.display_name);
    }
    if (row.completed_by && row.completed_person?.display_name && !nameById.has(row.completed_by)) {
      nameById.set(row.completed_by, row.completed_person.display_name);
    }
  }

  const resolveName = (id: string): string => {
    const raw = nameById.get(id);
    if (!raw || !raw.trim()) return DUTY_UNKNOWN_PERSON;
    return (maskName(raw, id) as string) || DUTY_UNKNOWN_PERSON;
  };

  const byAssignment = new Map<string, string[]>();
  for (const m of members) {
    byAssignment.set(m.assignment_id, [...(byAssignment.get(m.assignment_id) ?? []), m.user_id]);
  }

  return rows.map((row) => {
    const stored = byAssignment.get(row.id) ?? [];
    const memberIds = Array.from(
      new Set(stored.length > 0 ? stored : row.assignee_id ? [row.assignee_id] : []),
    );
    const people = memberIds.map((id) => ({ id, name: resolveName(id) }));
    return {
      ...row,
      memberIds,
      memberNames: people.map((p) => p.name),
      people,
    };
  });
}

export interface DutyAssignmentInput {
  id?: string | null;
  duty_date: string;
  area_id: string | null;
  job_type_id: string | null;
  area_custom: string | null;
  job_custom: string | null;
  duty_team_id: string | null;
  assigneeIds: string[];
  external_provider_id: string | null;
  note: string | null;
}

export async function saveDutyAssignment(input: DutyAssignmentInput, createdBy: string | null) {
  const payload = {
    duty_date: input.duty_date,
    start_time: `${DUTY_START_TIME}:00`,
    end_time: `${DUTY_END_TIME}:00`,
    due_time: `${DUTY_DUE_TIME}:00`,
    area_id: input.area_id,
    job_type_id: input.job_type_id,
    area_custom: input.area_id ? null : input.area_custom,
    job_custom: input.job_type_id ? null : input.job_custom,
    duty_team_id: input.duty_team_id,
    assignee_id: input.assigneeIds[0] ?? null,
    external_provider_id: input.external_provider_id,
    note: input.note,
  };

  let assignmentId = input.id ?? null;
  if (assignmentId) {
    const { error } = await supabase.from("duty_assignments").update(payload).eq("id", assignmentId);
    if (error) throw new Error(friendlyDutyError(error.message));
  } else {
    const { data, error } = await supabase
      .from("duty_assignments")
      .insert({ ...payload, created_by: createdBy })
      .select("id")
      .single();
    if (error) throw new Error(friendlyDutyError(error.message));
    assignmentId = data.id;
  }

  const { error: delError } = await supabase
    .from("duty_assignment_members")
    .delete()
    .eq("assignment_id", assignmentId);
  if (delError) throw new Error(friendlyDutyError(delError.message));

  if (input.assigneeIds.length > 0) {
    const { error: insError } = await supabase.from("duty_assignment_members").insert(
      input.assigneeIds.map((userId) => ({ assignment_id: assignmentId as string, user_id: userId })),
    );
    if (insError) throw new Error(friendlyDutyError(insError.message));
  }
  return assignmentId as string;
}

export async function deleteDutyAssignment(id: string) {
  const { error } = await supabase.from("duty_assignments").delete().eq("id", id);
  if (error) throw new Error(friendlyDutyError(error.message));
}

export async function setDutyCompleted(id: string, completed: boolean) {
  const { error } = await supabase.rpc("duty_set_completed", {
    _assignment: id,
    _completed: completed,
  });
  if (error) throw new Error(friendlyDutyError(error.message));
}

export const dutyCatalogQuery = () =>
  queryOptions({ queryKey: ["duty-catalog"], queryFn: fetchDutyCatalog });

export const dutyRulesQuery = () =>
  queryOptions({ queryKey: ["duty-rules"], queryFn: fetchDutyRules });

export const dutyAssignmentsQuery = (range: DutyRange) =>
  queryOptions({
    queryKey: ["duty-assignments", range.from, range.to],
    queryFn: () => fetchDutyAssignments(range),
  });

export const myDutyAssignmentsQuery = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: ["duty-assignments-mine", userId ?? "anon"],
    queryFn: () => fetchMyDutyAssignments(userId as string),
    enabled: Boolean(userId),
  });
