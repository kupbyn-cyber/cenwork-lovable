import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";

/**
 * CEN 1.0 — REPORT-01 nền tảng nghĩa vụ báo cáo.
 * Nguồn sự thật là bảng report_obligations (không suy đoán từ bản ghi báo cáo).
 * RLS và trigger database là ràng buộc thật; các helper ở đây chỉ để UI hiển thị đúng.
 */
export type ReportKind = Database["public"]["Enums"]["report_kind"];
export type ReportPeriodStatus = Database["public"]["Enums"]["report_period_status"];

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  daily: "Báo cáo ngày",
  weekly: "Báo cáo tuần",
  project: "Báo cáo dự án",
  project_closure: "Báo cáo kết thúc dự án",
};


export const REPORT_PERIOD_STATUS_LABEL: Record<ReportPeriodStatus, string> = {
  scheduled: "Chưa mở",
  open: "Đang mở",
  closed: "Đã đóng",
};

export const REPORT_PERIOD_STATUS_TONE: Record<ReportPeriodStatus, StatusTone> = {
  scheduled: "neutral",
  open: "progress",
  closed: "success",
};

/* ================= Quy tắc báo cáo ================= */

export interface ReportRequirementRow {
  id: string;
  report_type: ReportKind;
  team_id: string | null;
  teamName: string | null;
  project_id: string | null;
  projectName: string | null;
  applies_all_teams: boolean;
  cadence: string;
  open_day_of_week: number | null;
  open_time: string;
  due_day_of_week: number | null;
  due_time: string;
  requires_ack: boolean;
  requires_evidence: boolean;
  default_reviewer_id: string | null;
  reviewerName: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  updated_at: string;
}

const REQUIREMENT_SELECT = `
  id,report_type,team_id,project_id,applies_all_teams,cadence,open_day_of_week,open_time,
  due_day_of_week,due_time,requires_ack,requires_evidence,default_reviewer_id,
  effective_from,effective_to,is_active,updated_at,
  team:teams(name), project:projects(name), reviewer:profiles!report_requirements_default_reviewer_id_fkey(display_name)
`;

function mapRequirement(row: Record<string, unknown>): ReportRequirementRow {
  const team = row["team"] as { name: string } | null;
  const project = row["project"] as { name: string } | null;
  const reviewer = row["reviewer"] as { display_name: string } | null;
  return {
    id: row["id"] as string,
    report_type: row["report_type"] as ReportKind,
    team_id: (row["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    project_id: (row["project_id"] as string | null) ?? null,
    projectName: project?.name ?? null,
    applies_all_teams: Boolean(row["applies_all_teams"]),
    cadence: row["cadence"] as string,
    open_day_of_week: (row["open_day_of_week"] as number | null) ?? null,
    open_time: row["open_time"] as string,
    due_day_of_week: (row["due_day_of_week"] as number | null) ?? null,
    due_time: row["due_time"] as string,
    requires_ack: Boolean(row["requires_ack"]),
    requires_evidence: Boolean(row["requires_evidence"]),
    default_reviewer_id: (row["default_reviewer_id"] as string | null) ?? null,
    reviewerName: reviewer?.display_name ?? null,
    effective_from: row["effective_from"] as string,
    effective_to: (row["effective_to"] as string | null) ?? null,
    is_active: Boolean(row["is_active"]),
    updated_at: row["updated_at"] as string,
  };
}

async function fetchRequirements(): Promise<ReportRequirementRow[]> {
  const { data, error } = await supabase
    .from("report_requirements")
    .select(REQUIREMENT_SELECT)
    .order("report_type")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRequirement(row as Record<string, unknown>));
}

export const reportRequirementsQuery = () =>
  queryOptions({ queryKey: ["report-requirements"], queryFn: fetchRequirements });

export interface RequirementInput {
  reportType: ReportKind;
  teamId: string | null;
  appliesAllTeams: boolean;
  cadence: string;
  openDayOfWeek: number | null;
  openTime: string;
  dueDayOfWeek: number | null;
  dueTime: string;
  requiresAck: boolean;
  requiresEvidence: boolean;
  defaultReviewerId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function createRequirement(input: RequirementInput) {
  const { error } = await supabase.from("report_requirements").insert({
    report_type: input.reportType,
    team_id: input.appliesAllTeams ? null : input.teamId,
    applies_all_teams: input.appliesAllTeams,
    cadence: input.cadence,
    open_day_of_week: input.openDayOfWeek,
    open_time: input.openTime,
    due_day_of_week: input.dueDayOfWeek,
    due_time: input.dueTime,
    requires_ack: input.requiresAck,
    requires_evidence: input.requiresEvidence,
    default_reviewer_id: input.defaultReviewerId,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    is_active: input.isActive,
  });
  fail(error);
}

export async function updateRequirement(id: string, input: Partial<RequirementInput>) {
  const patch: Database["public"]["Tables"]["report_requirements"]["Update"] = {};
  if (input.requiresAck !== undefined) patch.requires_ack = input.requiresAck;
  if (input.requiresEvidence !== undefined) patch.requires_evidence = input.requiresEvidence;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.dueTime !== undefined) patch.due_time = input.dueTime;
  if (input.openTime !== undefined) patch.open_time = input.openTime;
  if (input.defaultReviewerId !== undefined) patch.default_reviewer_id = input.defaultReviewerId;
  if (input.effectiveTo !== undefined) patch.effective_to = input.effectiveTo;
  const { error } = await supabase.from("report_requirements").update(patch).eq("id", id);
  fail(error);
}


/* ================= Kỳ báo cáo ================= */

export interface ReportPeriodRow {
  id: string;
  report_type: ReportKind;
  period_key: string;
  period_start: string;
  period_end: string;
  opens_at: string;
  due_at: string;
  team_id: string | null;
  teamName: string | null;
  status: ReportPeriodStatus;
  config_snapshot: Record<string, unknown>;
}

async function fetchPeriods(): Promise<ReportPeriodRow[]> {
  const { data, error } = await supabase
    .from("report_periods")
    .select(
      "id,report_type,period_key,period_start,period_end,opens_at,due_at,team_id,status,config_snapshot,team:teams(name)",
    )
    .order("due_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const team = row["team"] as { name: string } | null;
    return {
      id: row["id"] as string,
      report_type: row["report_type"] as ReportKind,
      period_key: row["period_key"] as string,
      period_start: row["period_start"] as string,
      period_end: row["period_end"] as string,
      opens_at: row["opens_at"] as string,
      due_at: row["due_at"] as string,
      team_id: (row["team_id"] as string | null) ?? null,
      teamName: team?.name ?? null,
      status: row["status"] as ReportPeriodStatus,
      config_snapshot: (row["config_snapshot"] as Record<string, unknown>) ?? {},
    };
  });
}

export const reportPeriodsQuery = () =>
  queryOptions({ queryKey: ["report-periods"], queryFn: fetchPeriods });

/* ================= Nghĩa vụ báo cáo ================= */

export interface ReportObligationRow {
  id: string;
  period_id: string;
  report_type: ReportKind;
  period_key: string;
  user_id: string;
  userName: string | null;
  team_id: string | null;
  teamName: string | null;
  reviewer_id: string | null;
  reviewerName: string | null;
  due_at: string;
  opens_at: string | null;
  is_exempt: boolean;
  exempt_reason: string | null;
  first_submitted_at: string | null;
  is_late: boolean;
  late_minutes: number | null;
}

async function fetchObligations(): Promise<ReportObligationRow[]> {
  const { data, error } = await supabase
    .from("report_obligations")
    .select(
      `id,period_id,report_type,period_key,user_id,team_id,reviewer_id,due_at,is_exempt,exempt_reason,
       first_submitted_at,is_late,late_minutes,
       person:profiles!report_obligations_user_id_fkey(display_name),
       reviewer:profiles!report_obligations_reviewer_id_fkey(display_name),
       team:teams(name), period:report_periods(opens_at)`,
    )
    .order("due_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const person = row["person"] as { display_name: string } | null;
    const reviewer = row["reviewer"] as { display_name: string } | null;
    const team = row["team"] as { name: string } | null;
    const period = row["period"] as { opens_at: string } | null;
    return {
      id: row["id"] as string,
      period_id: row["period_id"] as string,
      report_type: row["report_type"] as ReportKind,
      period_key: row["period_key"] as string,
      user_id: row["user_id"] as string,
      userName: person?.display_name ?? null,
      team_id: (row["team_id"] as string | null) ?? null,
      teamName: team?.name ?? null,
      reviewer_id: (row["reviewer_id"] as string | null) ?? null,
      reviewerName: reviewer?.display_name ?? null,
      due_at: row["due_at"] as string,
      opens_at: period?.opens_at ?? null,
      is_exempt: Boolean(row["is_exempt"]),
      exempt_reason: (row["exempt_reason"] as string | null) ?? null,
      first_submitted_at: (row["first_submitted_at"] as string | null) ?? null,
      is_late: Boolean(row["is_late"]),
      late_minutes: (row["late_minutes"] as number | null) ?? null,
    };
  });
}

export const reportObligationsQuery = () =>
  queryOptions({ queryKey: ["report-obligations"], queryFn: fetchObligations });

export type ObligationState = "exempt" | "submitted" | "late_submitted" | "upcoming" | "pending" | "overdue";

export const OBLIGATION_STATE_LABEL: Record<ObligationState, string> = {
  exempt: "Được miễn",
  submitted: "Đã gửi",
  late_submitted: "Đã gửi trễ",
  upcoming: "Chưa đến hạn",
  pending: "Chưa gửi",
  overdue: "Quá hạn",
};

export const OBLIGATION_STATE_TONE: Record<ObligationState, StatusTone> = {
  exempt: "neutral",
  submitted: "success",
  late_submitted: "warning",
  upcoming: "neutral",
  pending: "progress",
  overdue: "error",
};

/** Trạng thái nghĩa vụ suy ra từ mốc thời gian, không lưu trùng trong database. */
export function obligationState(
  row: ReportObligationRow,
  now: number = Date.now(),
): ObligationState {
  if (row.is_exempt) return "exempt";
  if (row.first_submitted_at) return row.is_late ? "late_submitted" : "submitted";
  const opens = row.opens_at ? new Date(row.opens_at).getTime() : null;
  if (opens !== null && now < opens) return "upcoming";
  return now > new Date(row.due_at).getTime() ? "overdue" : "pending";
}

/* ================= Người kiểm tra thay thế ================= */

export interface ReviewerAssignmentRow {
  id: string;
  principal_id: string;
  principalName: string | null;
  delegate_id: string;
  delegateName: string | null;
  team_id: string | null;
  teamName: string | null;
  report_type: ReportKind | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
}

async function fetchReviewerAssignments(): Promise<ReviewerAssignmentRow[]> {
  const { data, error } = await supabase
    .from("report_reviewer_assignments")
    .select(
      `id,principal_id,delegate_id,team_id,report_type,starts_at,ends_at,is_active,
       principal:profiles!report_reviewer_assignments_principal_id_fkey(display_name),
       delegate:profiles!report_reviewer_assignments_delegate_id_fkey(display_name),
       team:teams(name)`,
    )
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const principal = row["principal"] as { display_name: string } | null;
    const delegate = row["delegate"] as { display_name: string } | null;
    const team = row["team"] as { name: string } | null;
    return {
      id: row["id"] as string,
      principal_id: row["principal_id"] as string,
      principalName: principal?.display_name ?? null,
      delegate_id: row["delegate_id"] as string,
      delegateName: delegate?.display_name ?? null,
      team_id: (row["team_id"] as string | null) ?? null,
      teamName: team?.name ?? null,
      report_type: (row["report_type"] as ReportKind | null) ?? null,
      starts_at: row["starts_at"] as string,
      ends_at: (row["ends_at"] as string | null) ?? null,
      is_active: Boolean(row["is_active"]),
    };
  });
}

export const reviewerAssignmentsQuery = () =>
  queryOptions({ queryKey: ["report-reviewer-assignments"], queryFn: fetchReviewerAssignments });

export async function createReviewerAssignment(input: {
  principalId: string;
  delegateId: string;
  teamId: string | null;
  reportType: ReportKind | null;
  startsAt: string;
  endsAt: string | null;
}) {
  const { error } = await supabase.from("report_reviewer_assignments").insert({
    principal_id: input.principalId,
    delegate_id: input.delegateId,
    team_id: input.teamId,
    report_type: input.reportType,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
  });
  fail(error);
}

export async function setReviewerAssignmentActive(id: string, isActive: boolean) {
  const { error } = await supabase
    .from("report_reviewer_assignments")
    .update({ is_active: isActive })
    .eq("id", id);
  fail(error);
}

/* ================= Ngày không làm việc ================= */

export interface NonWorkingDayRow {
  id: string;
  day: string;
  team_id: string | null;
  teamName: string | null;
  user_id: string | null;
  userName: string | null;
  reason: string;
}

async function fetchNonWorkingDays(): Promise<NonWorkingDayRow[]> {
  const { data, error } = await supabase
    .from("report_non_working_days")
    .select(
      "id,day,team_id,user_id,reason,team:teams(name),person:profiles!report_non_working_days_user_id_fkey(display_name)",
    )
    .order("day", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const team = row["team"] as { name: string } | null;
    const person = row["person"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      day: row["day"] as string,
      team_id: (row["team_id"] as string | null) ?? null,
      teamName: team?.name ?? null,
      user_id: (row["user_id"] as string | null) ?? null,
      userName: person?.display_name ?? null,
      reason: row["reason"] as string,
    };
  });
}

export const nonWorkingDaysQuery = () =>
  queryOptions({ queryKey: ["report-non-working-days"], queryFn: fetchNonWorkingDays });

export async function createNonWorkingDay(input: {
  day: string;
  teamId: string | null;
  userId: string | null;
  reason: string;
}) {
  const { error } = await supabase.from("report_non_working_days").insert({
    day: input.day,
    team_id: input.teamId,
    user_id: input.userId,
    reason: input.reason,
  });
  fail(error);
}

/* ================= Đề nghị miễn nghĩa vụ ================= */

export interface ExemptionRequestRow {
  id: string;
  obligation_id: string;
  requested_by: string;
  requesterName: string | null;
  reason: string;
  status: Database["public"]["Enums"]["report_exemption_status"];
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}

async function fetchExemptionRequests(): Promise<ExemptionRequestRow[]> {
  const { data, error } = await supabase
    .from("report_exemption_requests")
    .select(
      "id,obligation_id,requested_by,reason,status,decision_note,decided_at,created_at,requester:profiles!report_exemption_requests_requested_by_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const requester = row["requester"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      obligation_id: row["obligation_id"] as string,
      requested_by: row["requested_by"] as string,
      requesterName: requester?.display_name ?? null,
      reason: row["reason"] as string,
      status: row["status"] as ExemptionRequestRow["status"],
      decision_note: (row["decision_note"] as string | null) ?? null,
      decided_at: (row["decided_at"] as string | null) ?? null,
      created_at: row["created_at"] as string,
    };
  });
}

export const exemptionRequestsQuery = () =>
  queryOptions({ queryKey: ["report-exemptions"], queryFn: fetchExemptionRequests });

export async function requestExemption(input: {
  obligationId: string;
  requestedBy: string;
  reason: string;
}) {
  const { error } = await supabase.from("report_exemption_requests").insert({
    obligation_id: input.obligationId,
    requested_by: input.requestedBy,
    reason: input.reason,
  });
  fail(error);
}

export async function decideExemption(id: string, approve: boolean, note: string | null) {
  const { error } = await supabase.rpc("report_decide_exemption", {
    _request: id,
    _approve: approve,
    ...(note ? { _note: note } : {}),
  });
  fail(error);
}

/* ================= Tạo kỳ thủ công (idempotent) ================= */

export async function generateDailyPeriods(day: string | null) {
  const { data, error } = await supabase.rpc("report_generate_daily", day ? { _day: day } : {});
  fail(error);
  return data as { day: string; periods_created: number; obligations_created: number };
}

export async function generateWeeklyPeriods(weekStart: string | null) {
  const { data, error } = await supabase.rpc(
    "report_generate_weekly",
    weekStart ? { _week_start: weekStart } : {},
  );

  fail(error);
  return data as { week_start: string; periods_created: number; obligations_created: number };
}
