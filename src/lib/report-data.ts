import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { AppRoleKey } from "@/lib/permissions";
import { CEN_TIMEZONE, formatHanoiDate, hanoiStartOfDayMs } from "@/lib/datetime";

/**
 * CEN 1.0 — M4 Reports data layer.
 * Đọc/ghi qua client trình duyệt; RLS + trigger database là ràng buộc thật.
 * Helper quyền ở đây chỉ để UI ẩn/disable đúng.
 */
export type ReportStatus = Database["public"]["Enums"]["report_status"];

export const REPORT_STATUS_ORDER: ReportStatus[] = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Bản nháp",
  submitted: "Đã gửi",
  changes_requested: "Yêu cầu chỉnh sửa",
  approved: "Đã duyệt",
};

export const REPORT_STATUS_TONE: Record<ReportStatus, StatusTone> = {
  draft: "neutral",
  submitted: "progress",
  changes_requested: "warning",
  approved: "success",
};

/* ================= Ngày và tuần theo giờ Hà Nội ================= */

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CEN_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày hôm nay `yyyy-MM-dd` theo giờ Hà Nội. */
export function hanoiToday(): string {
  return dayFormatter.format(new Date());
}

/** Thứ Hai của tuần chứa `dateStr` (`yyyy-MM-dd`). */
export function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  const isoDow = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  base.setUTCDate(base.getUTCDate() - (isoDow - 1));
  return base.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Nhãn tuần: `Tuần dd/MM – dd/MM/yyyy`. */
export function formatWeekLabel(weekStart: string): string {
  return `${formatHanoiDate(weekStart)} – ${formatHanoiDate(addDays(weekStart, 6))}`;
}

/* ================= Báo cáo ngày ================= */

export interface DailyReportRow {
  id: string;
  report_date: string;
  author_id: string;
  authorName: string | null;
  team_id: string | null;
  teamName: string | null;
  results: string | null;
  blockers: string | null;
  next_plan: string | null;
  status: ReportStatus;
  reviewer_id: string | null;
  reviewerName: string | null;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const DAILY_SELECT = `
  id,report_date,author_id,team_id,results,blockers,next_plan,status,reviewer_id,review_note,
  submitted_at,reviewed_at,created_at,updated_at,
  author:profiles!daily_reports_author_id_fkey(id,display_name),
  reviewer:profiles!daily_reports_reviewer_id_fkey(id,display_name),
  team:teams(id,name)
`;

type Named = { display_name: string } | null;

function mapDaily(row: Record<string, unknown>): DailyReportRow {
  const author = row["author"] as Named;
  const reviewer = row["reviewer"] as Named;
  const team = row["team"] as { name: string } | null;
  return {
    id: row["id"] as string,
    report_date: row["report_date"] as string,
    author_id: row["author_id"] as string,
    authorName: author?.display_name ?? null,
    team_id: (row["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    results: (row["results"] as string | null) ?? null,
    blockers: (row["blockers"] as string | null) ?? null,
    next_plan: (row["next_plan"] as string | null) ?? null,
    status: row["status"] as ReportStatus,
    reviewer_id: (row["reviewer_id"] as string | null) ?? null,
    reviewerName: reviewer?.display_name ?? null,
    review_note: (row["review_note"] as string | null) ?? null,
    submitted_at: (row["submitted_at"] as string | null) ?? null,
    reviewed_at: (row["reviewed_at"] as string | null) ?? null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

async function fetchDailyReports(): Promise<DailyReportRow[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select(DAILY_SELECT)
    .order("report_date", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapDaily(row as Record<string, unknown>));
}

async function fetchDailyReport(id: string): Promise<DailyReportRow> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select(DAILY_SELECT)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return mapDaily(data as Record<string, unknown>);
}

export const dailyReportsQuery = () =>
  queryOptions({ queryKey: ["daily-reports"], queryFn: fetchDailyReports });

export const dailyReportQuery = (id: string) =>
  queryOptions({ queryKey: ["daily-report", id], queryFn: () => fetchDailyReport(id) });

/* ================= Báo cáo tuần ================= */

export interface WeeklyReportRow {
  id: string;
  team_id: string;
  teamName: string | null;
  week_start: string;
  leader_id: string;
  leaderName: string | null;
  highlights: string | null;
  unfinished: string | null;
  blockers: string | null;
  next_week_plan: string | null;
  status: ReportStatus;
  reviewer_id: string | null;
  reviewerName: string | null;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const WEEKLY_SELECT = `
  id,team_id,week_start,leader_id,highlights,unfinished,blockers,next_week_plan,status,
  reviewer_id,review_note,submitted_at,reviewed_at,created_at,updated_at,
  leader:profiles!weekly_reports_leader_id_fkey(id,display_name),
  reviewer:profiles!weekly_reports_reviewer_id_fkey(id,display_name),
  team:teams(id,name)
`;

function mapWeekly(row: Record<string, unknown>): WeeklyReportRow {
  const leader = row["leader"] as Named;
  const reviewer = row["reviewer"] as Named;
  const team = row["team"] as { name: string } | null;
  return {
    id: row["id"] as string,
    team_id: row["team_id"] as string,
    teamName: team?.name ?? null,
    week_start: row["week_start"] as string,
    leader_id: row["leader_id"] as string,
    leaderName: leader?.display_name ?? null,
    highlights: (row["highlights"] as string | null) ?? null,
    unfinished: (row["unfinished"] as string | null) ?? null,
    blockers: (row["blockers"] as string | null) ?? null,
    next_week_plan: (row["next_week_plan"] as string | null) ?? null,
    status: row["status"] as ReportStatus,
    reviewer_id: (row["reviewer_id"] as string | null) ?? null,
    reviewerName: reviewer?.display_name ?? null,
    review_note: (row["review_note"] as string | null) ?? null,
    submitted_at: (row["submitted_at"] as string | null) ?? null,
    reviewed_at: (row["reviewed_at"] as string | null) ?? null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

async function fetchWeeklyReports(): Promise<WeeklyReportRow[]> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(WEEKLY_SELECT)
    .order("week_start", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapWeekly(row as Record<string, unknown>));
}

async function fetchWeeklyReport(id: string): Promise<WeeklyReportRow> {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select(WEEKLY_SELECT)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return mapWeekly(data as Record<string, unknown>);
}

export const weeklyReportsQuery = () =>
  queryOptions({ queryKey: ["weekly-reports"], queryFn: fetchWeeklyReports });

export const weeklyReportQuery = (id: string) =>
  queryOptions({ queryKey: ["weekly-report", id], queryFn: () => fetchWeeklyReport(id) });

/* ================= Tổng hợp Task trong ngày ================= */

export interface ReportTaskRef {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["task_status"];
  priority: Database["public"]["Enums"]["task_priority"];
  deadline: string;
  projectName: string | null;
  role: "assignee" | "participant";
}

interface RawTask {
  id: string;
  name: string;
  status: ReportTaskRef["status"];
  priority: ReportTaskRef["priority"];
  deadline: string;
  start_date: string | null;
  updated_at: string;
  assignee_id: string;
  is_archived: boolean;
  project: { name: string } | null;
  task_participants: { user_id: string }[] | null;
}

/**
 * Task “có hoạt động trong ngày” của một người:
 * người đó phụ trách hoặc tham gia, và trong ngày đó Task có cập nhật,
 * đến hạn, hoặc đang trong khoảng thực hiện và chưa hoàn thành.
 */
export async function fetchDailyTaskRefs(
  authorId: string,
  reportDate: string,
): Promise<ReportTaskRef[]> {
  const dayStart = hanoiStartOfDayMs(reportDate);
  if (dayStart === null) return [];
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,name,status,priority,deadline,start_date,updated_at,assignee_id,is_archived,project:projects(name),task_participants(user_id)",
    )
    .eq("is_archived", false)
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawTask[];
  const refs: ReportTaskRef[] = [];
  for (const task of rows) {
    const isAssignee = task.assignee_id === authorId;
    const isParticipant = (task.task_participants ?? []).some((p) => p.user_id === authorId);
    if (!isAssignee && !isParticipant) continue;

    const updated = new Date(task.updated_at).getTime();
    const deadline = new Date(task.deadline).getTime();
    const started = task.start_date ? hanoiStartOfDayMs(task.start_date) : null;

    const active =
      (updated >= dayStart && updated < dayEnd) ||
      (deadline >= dayStart && deadline < dayEnd) ||
      (task.status !== "done" &&
        started !== null &&
        started <= dayEnd &&
        deadline >= dayStart);
    if (!active) continue;

    refs.push({
      id: task.id,
      name: task.name,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline,
      projectName: task.project?.name ?? null,
      role: isAssignee ? "assignee" : "participant",
    });
  }
  return refs;
}

export const dailyTaskRefsQuery = (authorId: string | null, reportDate: string) =>
  queryOptions({
    queryKey: ["daily-task-refs", authorId, reportDate],
    queryFn: () => (authorId ? fetchDailyTaskRefs(authorId, reportDate) : Promise.resolve([])),
    enabled: Boolean(authorId && reportDate),
  });

/* ================= Quyền (UI) ================= */

export interface ReportAccessContext {
  userId: string | null;
  role: AppRoleKey | null;
  leaderTeamId: string | null;
}

const privileged = (ctx: ReportAccessContext) => ctx.role === "admin" || ctx.role === "cmo";

/** Member và Leader phải gửi báo cáo ngày. */
export function mustSubmitDaily(ctx: ReportAccessContext) {
  return ctx.role === "member" || ctx.role === "leader";
}

export function isDailyAuthor(report: DailyReportRow, ctx: ReportAccessContext) {
  return Boolean(ctx.userId && report.author_id === ctx.userId);
}

export function canEditDaily(report: DailyReportRow, ctx: ReportAccessContext) {
  return (
    isDailyAuthor(report, ctx) &&
    (report.status === "draft" || report.status === "changes_requested")
  );
}

/**
 * Member gửi cho Leader Team chính; Leader gửi cho CMO/Admin.
 * `authorIsLeader` lấy từ danh sách thành viên (vai trò người gửi).
 */
export function canReviewDaily(
  report: DailyReportRow,
  ctx: ReportAccessContext,
  authorIsLeader: boolean,
) {
  if (!ctx.userId || report.author_id === ctx.userId) return false;
  if (report.status !== "submitted") return false;
  if (privileged(ctx)) return true;
  if (authorIsLeader) return false;
  return Boolean(
    ctx.role === "leader" && ctx.leaderTeamId && report.team_id === ctx.leaderTeamId,
  );
}

export function canCreateWeekly(ctx: ReportAccessContext) {
  return ctx.role === "leader" && Boolean(ctx.leaderTeamId);
}

export function canEditWeekly(report: WeeklyReportRow, ctx: ReportAccessContext) {
  return (
    Boolean(ctx.userId && report.leader_id === ctx.userId) &&
    (report.status === "draft" || report.status === "changes_requested")
  );
}

export function canReviewWeekly(report: WeeklyReportRow, ctx: ReportAccessContext) {
  return privileged(ctx) && report.status === "submitted";
}

/* ================= Ghi dữ liệu ================= */

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface DailyReportInput {
  reportDate: string;
  teamId: string | null;
  results: string;
  blockers: string;
  nextPlan: string;
  status: Extract<ReportStatus, "draft" | "submitted">;
}

export async function createDailyReport(input: DailyReportInput & { authorId: string }) {
  const { data, error } = await supabase
    .from("daily_reports")
    .insert({
      report_date: input.reportDate,
      author_id: input.authorId,
      team_id: input.teamId,
      results: input.results,
      blockers: input.blockers,
      next_plan: input.nextPlan,
      status: input.status,
    })
    .select("id")
    .single();
  fail(error);
  return data!.id;
}

export async function updateDailyReport(id: string, input: Omit<DailyReportInput, "reportDate">) {
  const { error } = await supabase
    .from("daily_reports")
    .update({
      team_id: input.teamId,
      results: input.results,
      blockers: input.blockers,
      next_plan: input.nextPlan,
      status: input.status,
    })
    .eq("id", id);
  fail(error);
}

export async function reviewDailyReport(
  id: string,
  decision: "approved" | "changes_requested",
  note: string,
) {
  const { error } = await supabase
    .from("daily_reports")
    .update({ status: decision, review_note: note })
    .eq("id", id);
  fail(error);
}

export interface WeeklyReportInput {
  teamId: string;
  weekStart: string;
  highlights: string;
  unfinished: string;
  blockers: string;
  nextWeekPlan: string;
  status: Extract<ReportStatus, "draft" | "submitted">;
}

export async function createWeeklyReport(input: WeeklyReportInput & { leaderId: string }) {
  const { data, error } = await supabase
    .from("weekly_reports")
    .insert({
      team_id: input.teamId,
      week_start: input.weekStart,
      leader_id: input.leaderId,
      highlights: input.highlights,
      unfinished: input.unfinished,
      blockers: input.blockers,
      next_week_plan: input.nextWeekPlan,
      status: input.status,
    })
    .select("id")
    .single();
  fail(error);
  return data!.id;
}

export async function updateWeeklyReport(
  id: string,
  input: Omit<WeeklyReportInput, "teamId" | "weekStart">,
) {
  const { error } = await supabase
    .from("weekly_reports")
    .update({
      highlights: input.highlights,
      unfinished: input.unfinished,
      blockers: input.blockers,
      next_week_plan: input.nextWeekPlan,
      status: input.status,
    })
    .eq("id", id);
  fail(error);
}

export async function reviewWeeklyReport(
  id: string,
  decision: "approved" | "changes_requested",
  note: string,
) {
  const { error } = await supabase
    .from("weekly_reports")
    .update({ status: decision, review_note: note })
    .eq("id", id);
  fail(error);
}

/* ================= Lịch sử ================= */

export interface ReportHistoryEntry {
  id: string;
  action: string;
  actor_email: string | null;
  created_at: string;
  before_data: unknown;
  after_data: unknown;
}

export async function fetchReportHistory(
  entityType: "daily_report" | "weekly_report",
  id: string,
): Promise<ReportHistoryEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,actor_email,created_at,before_data,after_data")
    .eq("entity_type", entityType)
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportHistoryEntry[];
}

export const reportHistoryQuery = (entityType: "daily_report" | "weekly_report", id: string) =>
  queryOptions({
    queryKey: ["report-history", entityType, id],
    queryFn: () => fetchReportHistory(entityType, id),
  });
