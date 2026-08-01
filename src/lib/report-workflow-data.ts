import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { ReportKind } from "@/lib/report-obligation-data";

/**
 * CEN 1.0 — REPORT-02 luồng nghiệp vụ báo cáo.
 * Mọi ràng buộc thật (bắt buộc nội dung, quyền xử lý, đúng hạn/muộn, bản chụp nguồn)
 * đều nằm ở database function; lớp này chỉ gọi và ánh xạ dữ liệu cho UI.
 */
export type ReportDocStatus = Database["public"]["Enums"]["report_doc_status"];
export type ReportReviewAction = Database["public"]["Enums"]["report_review_action"];
export type ReportLinkKind = Database["public"]["Enums"]["report_link_kind"];

export const DOC_STATUS_LABEL: Record<ReportDocStatus, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  pending_review: "Chờ xác nhận",
  revision_required: "Cần bổ sung",
  confirmed: "Đã xác nhận",
  reopened: "Đã mở lại",
  published: "Đã phát hành",
};

export const DOC_STATUS_TONE: Record<ReportDocStatus, StatusTone> = {
  draft: "neutral",
  submitted: "progress",
  pending_review: "warning",
  revision_required: "error",
  confirmed: "success",
  reopened: "progress",
  published: "success",
};

export const REVIEW_ACTION_LABEL: Record<ReportReviewAction, string> = {
  comment: "Phản hồi",
  request_revision: "Yêu cầu bổ sung",
  confirm: "Xác nhận",
  reopen_request: "Yêu cầu mở lại",
  reopen_approve: "Chấp thuận mở lại",
  reopen_reject: "Từ chối mở lại",
  summary_feedback: "Phản hồi tổng hợp",
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/* ================= Báo cáo ================= */

export interface ReportSectionRow {
  id: string;
  report_id: string;
  team_id: string | null;
  teamName: string | null;
  position: number;
  done_work: string | null;
  results: string | null;
  unfinished: string | null;
  blockers: string | null;
  next_plan: string | null;
  support_needed: string | null;
  no_work_flag: boolean;
  no_work_reason: string | null;
  no_backlog_flag: boolean;
}

export interface ReportLinkRow {
  id: string;
  report_id: string;
  section_id: string | null;
  link_type: ReportLinkKind;
  task_id: string | null;
  project_id: string | null;
  url: string | null;
  evidence_text: string | null;
  summary: string | null;
  snapshot: Record<string, unknown>;
  snapshot_version: number;
}

export interface ReportDocRow {
  id: string;
  obligation_id: string | null;
  period_id: string | null;
  report_type: ReportKind;
  period_key: string;
  author_id: string;
  authorName: string | null;
  team_id: string | null;
  teamName: string | null;
  project_id: string | null;
  projectName: string | null;
  status: ReportDocStatus;
  requires_ack: boolean;
  due_at: string | null;
  current_version: number;
  revision_round: number;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  reviewer_id: string | null;
  reviewerName: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

const DOC_SELECT = `
  id,obligation_id,period_id,report_type,period_key,author_id,team_id,project_id,status,requires_ack,
  due_at,current_version,revision_round,first_submitted_at,last_submitted_at,reviewer_id,confirmed_by,
  confirmed_at,updated_at,
  author:profiles!reports_author_id_fkey(display_name),
  reviewer:profiles!reports_reviewer_id_fkey(display_name),
  team:teams(name), project:projects(name)
`;

function mapDoc(raw: unknown): ReportDocRow {
  const row = raw as Record<string, unknown>;
  const author = row["author"] as { display_name: string } | null;
  const reviewer = row["reviewer"] as { display_name: string } | null;
  const team = row["team"] as { name: string } | null;
  const project = row["project"] as { name: string } | null;
  return {
    id: row["id"] as string,
    obligation_id: (row["obligation_id"] as string | null) ?? null,
    period_id: (row["period_id"] as string | null) ?? null,
    report_type: row["report_type"] as ReportKind,
    period_key: row["period_key"] as string,
    author_id: row["author_id"] as string,
    authorName: author?.display_name ?? null,
    team_id: (row["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    project_id: (row["project_id"] as string | null) ?? null,
    projectName: project?.name ?? null,
    status: row["status"] as ReportDocStatus,
    requires_ack: Boolean(row["requires_ack"]),
    due_at: (row["due_at"] as string | null) ?? null,
    current_version: (row["current_version"] as number) ?? 0,
    revision_round: (row["revision_round"] as number) ?? 0,
    first_submitted_at: (row["first_submitted_at"] as string | null) ?? null,
    last_submitted_at: (row["last_submitted_at"] as string | null) ?? null,
    reviewer_id: (row["reviewer_id"] as string | null) ?? null,
    reviewerName: reviewer?.display_name ?? null,
    confirmed_by: (row["confirmed_by"] as string | null) ?? null,
    confirmed_at: (row["confirmed_at"] as string | null) ?? null,
    updated_at: row["updated_at"] as string,
  };
}

async function fetchDocs(): Promise<ReportDocRow[]> {
  const { data, error } = await supabase
    .from("reports")
    .select(DOC_SELECT)
    .order("updated_at", { ascending: false })
    .limit(300);
  fail(error);
  return (data ?? []).map(mapDoc);
}

export const reportDocsQuery = () =>
  queryOptions({ queryKey: ["report-docs"], queryFn: fetchDocs });

async function fetchDoc(reportId: string) {
  const { data, error } = await supabase.from("reports").select(DOC_SELECT).eq("id", reportId).maybeSingle();
  fail(error);
  if (!data) throw new Error("Không tìm thấy báo cáo hoặc bạn không có quyền xem");
  return mapDoc(data);
}

export const reportDocQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-doc", reportId], queryFn: () => fetchDoc(reportId) });

async function fetchSections(reportId: string): Promise<ReportSectionRow[]> {
  const { data, error } = await supabase
    .from("report_sections")
    .select(
      `id,report_id,team_id,position,done_work,results,unfinished,blockers,next_plan,support_needed,
       no_work_flag,no_work_reason,no_backlog_flag, team:teams(name)`,
    )
    .eq("report_id", reportId)
    .order("position", { ascending: true });
  fail(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const team = row["team"] as { name: string } | null;
    return {
      id: row["id"] as string,
      report_id: row["report_id"] as string,
      team_id: (row["team_id"] as string | null) ?? null,
      teamName: team?.name ?? null,
      position: (row["position"] as number) ?? 0,
      done_work: (row["done_work"] as string | null) ?? null,
      results: (row["results"] as string | null) ?? null,
      unfinished: (row["unfinished"] as string | null) ?? null,
      blockers: (row["blockers"] as string | null) ?? null,
      next_plan: (row["next_plan"] as string | null) ?? null,
      support_needed: (row["support_needed"] as string | null) ?? null,
      no_work_flag: Boolean(row["no_work_flag"]),
      no_work_reason: (row["no_work_reason"] as string | null) ?? null,
      no_backlog_flag: Boolean(row["no_backlog_flag"]),
    };
  });
}

export const reportSectionsQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-sections", reportId], queryFn: () => fetchSections(reportId) });

async function fetchLinks(reportId: string): Promise<ReportLinkRow[]> {
  const { data, error } = await supabase
    .from("report_links")
    .select(
      "id,report_id,section_id,link_type,task_id,project_id,url,evidence_text,summary,snapshot,snapshot_version",
    )
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  fail(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: row["id"] as string,
      report_id: row["report_id"] as string,
      section_id: (row["section_id"] as string | null) ?? null,
      link_type: row["link_type"] as ReportLinkKind,
      task_id: (row["task_id"] as string | null) ?? null,
      project_id: (row["project_id"] as string | null) ?? null,
      url: (row["url"] as string | null) ?? null,
      evidence_text: (row["evidence_text"] as string | null) ?? null,
      summary: (row["summary"] as string | null) ?? null,
      snapshot: ((row["snapshot"] as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
      snapshot_version: (row["snapshot_version"] as number) ?? 0,
    };
  });
}

export const reportLinksQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-links", reportId], queryFn: () => fetchLinks(reportId) });

export interface ReportVersionRow {
  id: string;
  version: number;
  submission_kind: Database["public"]["Enums"]["report_submission_kind"];
  content_snapshot: Json;
  source_snapshot: Json;
  created_at: string;
  created_by: string | null;
}

async function fetchVersions(reportId: string): Promise<ReportVersionRow[]> {
  const { data, error } = await supabase
    .from("report_versions")
    .select("id,version,submission_kind,content_snapshot,source_snapshot,created_at,created_by")
    .eq("report_id", reportId)
    .order("version", { ascending: false });
  fail(error);
  return (data ?? []) as ReportVersionRow[];
}

export const reportVersionsQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-versions", reportId], queryFn: () => fetchVersions(reportId) });

export interface ReportReviewRow {
  id: string;
  action: ReportReviewAction;
  body: string | null;
  version: number | null;
  round: number;
  actor_id: string;
  actorName: string | null;
  created_at: string;
}

async function fetchReviews(reportId: string): Promise<ReportReviewRow[]> {
  const { data, error } = await supabase
    .from("report_reviews")
    .select("id,action,body,version,round,actor_id,created_at,actor:profiles!report_reviews_actor_id_fkey(display_name)")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const actor = row["actor"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      action: row["action"] as ReportReviewAction,
      body: (row["body"] as string | null) ?? null,
      version: (row["version"] as number | null) ?? null,
      round: (row["round"] as number) ?? 0,
      actor_id: row["actor_id"] as string,
      actorName: actor?.display_name ?? null,
      created_at: row["created_at"] as string,
    };
  });
}

export const reportReviewsQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-reviews", reportId], queryFn: () => fetchReviews(reportId) });

export interface ReopenRequestRow {
  id: string;
  report_id: string;
  requested_by: string;
  reason: string;
  planned_changes: string;
  status: Database["public"]["Enums"]["report_exemption_status"];
  decision_note: string | null;
  created_at: string;
}

async function fetchReopenRequests(reportId: string): Promise<ReopenRequestRow[]> {
  const { data, error } = await supabase
    .from("report_reopen_requests")
    .select("id,report_id,requested_by,reason,planned_changes,status,decision_note,created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as ReopenRequestRow[];
}

export const reopenRequestsQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-reopen", reportId], queryFn: () => fetchReopenRequests(reportId) });

/* ================= Thao tác ================= */

export async function ensureReportForObligation(obligationId: string): Promise<string> {
  const { data, error } = await supabase.rpc("report_ensure", { _obligation: obligationId });
  fail(error);
  return data as string;
}

export async function saveSection(
  sectionId: string,
  patch: Partial<Pick<ReportSectionRow,
    "done_work" | "results" | "unfinished" | "blockers" | "next_plan" | "support_needed" |
    "no_work_flag" | "no_work_reason" | "no_backlog_flag">>,
) {
  const { error } = await supabase.from("report_sections").update(patch).eq("id", sectionId);
  fail(error);
}

export async function addTaskLink(input: {
  reportId: string;
  sectionId: string | null;
  taskId: string;
  summary: string | null;
}) {
  const { error } = await supabase.from("report_links").insert({
    report_id: input.reportId,
    section_id: input.sectionId,
    link_type: "task",
    task_id: input.taskId,
    summary: input.summary,
  });
  fail(error);
}

export async function addProjectLink(input: {
  reportId: string;
  sectionId: string | null;
  projectId: string;
  summary: string | null;
}) {
  const { error } = await supabase.from("report_links").insert({
    report_id: input.reportId,
    section_id: input.sectionId,
    link_type: "project",
    project_id: input.projectId,
    summary: input.summary,
  });
  fail(error);
}

export async function removeLink(linkId: string) {
  const { error } = await supabase.from("report_links").delete().eq("id", linkId);
  fail(error);
}

export async function submitReport(reportId: string): Promise<ReportDocStatus> {
  const { data, error } = await supabase.rpc("report_submit", { _report: reportId });
  fail(error);
  return data as ReportDocStatus;
}

export async function reviewReport(reportId: string, action: ReportReviewAction, body: string | null) {
  const { data, error } = await supabase.rpc("report_review", {
    _report: reportId,
    _action: action,
    _body: body ?? "",
  });
  fail(error);
  return data as ReportDocStatus;
}

export async function requestReopen(reportId: string, reason: string, planned: string) {
  const { error } = await supabase.rpc("report_reopen_request", {
    _report: reportId,
    _reason: reason,
    _planned: planned,
  });
  fail(error);
}

export async function decideReopen(requestId: string, approve: boolean, note: string | null) {
  const { error } = await supabase.rpc("report_reopen_decide", {
    _request: requestId,
    _approve: approve,
    _note: note ?? "",
  });
  fail(error);
}

export async function transferReportAuthor(reportId: string, newAuthorId: string, reason: string) {
  const { error } = await supabase.rpc("report_transfer_author", {
    _report: reportId,
    _new_author: newAuthorId,
    _reason: reason,
  });
  fail(error);
}

export async function exemptObligation(obligationId: string, reason: string) {
  const { error } = await supabase.rpc("report_exempt_obligation", {
    _obligation: obligationId,
    _reason: reason,
  });
  fail(error);
}

export async function generateProjectPeriods(day: string | null) {
  const { data, error } = await supabase.rpc("report_generate_project", day ? { _day: day } : {});
  fail(error);
  return data as unknown as { periods_created: number; obligations_created: number };
}

export interface SuggestedSource {
  kind: "task";
  id: string;
  name: string;
  status: string;
  deadline: string | null;
  project_id: string | null;
  project_name: string | null;
  team_id: string | null;
}

async function fetchSuggestions(reportId: string): Promise<SuggestedSource[]> {
  const { data, error } = await supabase.rpc("report_suggest_sources", { _report: reportId });
  fail(error);
  return (data as unknown as SuggestedSource[] | null) ?? [];
}

export const reportSuggestionsQuery = (reportId: string) =>
  queryOptions({ queryKey: ["report-suggestions", reportId], queryFn: () => fetchSuggestions(reportId) });

/* ================= Tổng hợp Team hằng tuần ================= */

export interface TeamSummaryRow {
  id: string;
  team_id: string;
  teamName: string | null;
  week_start: string;
  leader_id: string;
  leaderName: string | null;
  status: ReportDocStatus;
  highlights: string | null;
  unfinished: string | null;
  blockers: string | null;
  next_priorities: string | null;
  support_needed: string | null;
  submission_note: string | null;
  system_snapshot: Record<string, unknown>;
  current_version: number;
  published_at: string | null;
}

async function fetchTeamSummaries(): Promise<TeamSummaryRow[]> {
  const { data, error } = await supabase
    .from("team_weekly_summaries")
    .select(
      `id,team_id,week_start,leader_id,status,highlights,unfinished,blockers,next_priorities,
       support_needed,submission_note,system_snapshot,current_version,published_at,
       team:teams(name), leader:profiles!team_weekly_summaries_leader_id_fkey(display_name)`,
    )
    .order("week_start", { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const team = row["team"] as { name: string } | null;
    const leader = row["leader"] as { display_name: string } | null;
    return {
      id: row["id"] as string,
      team_id: row["team_id"] as string,
      teamName: team?.name ?? null,
      week_start: row["week_start"] as string,
      leader_id: row["leader_id"] as string,
      leaderName: leader?.display_name ?? null,
      status: row["status"] as ReportDocStatus,
      highlights: (row["highlights"] as string | null) ?? null,
      unfinished: (row["unfinished"] as string | null) ?? null,
      blockers: (row["blockers"] as string | null) ?? null,
      next_priorities: (row["next_priorities"] as string | null) ?? null,
      support_needed: (row["support_needed"] as string | null) ?? null,
      submission_note: (row["submission_note"] as string | null) ?? null,
      system_snapshot: ((row["system_snapshot"] as Record<string, unknown> | null) ?? {}),
      current_version: (row["current_version"] as number) ?? 0,
      published_at: (row["published_at"] as string | null) ?? null,
    };
  });
}

export const teamSummariesQuery = () =>
  queryOptions({ queryKey: ["team-weekly-summaries"], queryFn: fetchTeamSummaries });

export async function ensureTeamSummary(teamId: string, weekStart: string): Promise<string> {
  const { data, error } = await supabase.rpc("team_summary_ensure", {
    _team: teamId,
    _week_start: weekStart,
  });
  fail(error);
  return data as string;
}

export async function saveTeamSummary(
  summaryId: string,
  patch: Partial<Pick<TeamSummaryRow,
    "highlights" | "unfinished" | "blockers" | "next_priorities" | "support_needed" | "submission_note">>,
) {
  const { error } = await supabase.from("team_weekly_summaries").update(patch).eq("id", summaryId);
  fail(error);
}

export async function publishTeamSummary(summaryId: string) {
  const { error } = await supabase.rpc("team_summary_publish", { _summary: summaryId });
  fail(error);
}

export async function feedbackTeamSummary(summaryId: string, requestRevision: boolean, body: string) {
  const { error } = await supabase.rpc("team_summary_feedback", {
    _summary: summaryId,
    _request_revision: requestRevision,
    _body: body,
  });
  fail(error);
}

/** Thứ Hai của tuần chứa ngày đưa vào, theo múi giờ Hà Nội. */
export function hanoiWeekStart(date: Date = new Date()): string {
  const hanoi = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dow = (hanoi.getDay() + 6) % 7;
  hanoi.setDate(hanoi.getDate() - dow);
  const month = String(hanoi.getMonth() + 1).padStart(2, "0");
  const day = String(hanoi.getDate()).padStart(2, "0");
  return `${hanoi.getFullYear()}-${month}-${day}`;
}
