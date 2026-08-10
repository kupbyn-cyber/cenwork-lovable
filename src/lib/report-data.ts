import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Database } from "@/integrations/supabase/types";
import type { StatusTone } from "@/components/ui/status-badge";
import type { AppRoleKey } from "@/lib/permissions";
import { CEN_TIMEZONE, formatHanoiDate, hanoiStartOfDayMs } from "@/lib/datetime";
import { maskName, primeLockedIdentity } from "@/lib/member-identity";
import { NO_NOTE_TEXT, formatDailyItemLine } from "@/lib/daily-report-content";

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

/**
 * REPORT-REVIEW-UI-01 — nhãn trạng thái hiển thị ngoài danh sách.
 * Báo cáo đã vào luồng duyệt hiển thị "Chờ duyệt" thay cho "Đã gửi";
 * nếu đang chờ chính người dùng hiện tại duyệt thì nhấn mạnh hơn.
 */
export function reportStatusView(
  status: ReportStatus,
  awaitingMe = false,
): { label: string; tone: StatusTone } {
  if (status === "submitted") {
    return { label: "Chờ duyệt", tone: awaitingMe ? "warning" : "progress" };
  }
  return { label: REPORT_STATUS_LABEL[status], tone: REPORT_STATUS_TONE[status] };
}

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

/* ===== REPORT-WEEKLY-FLOW-01 — gọi báo cáo tuần theo số tuần trong năm ===== */

/** Số tuần ISO (tuần bắt đầu Thứ Hai) của một ngày `yyyy-MM-dd`. */
export function isoWeekNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** `Tuần 32`. */
export function weekNumberLabel(weekStart: string): string {
  return `Tuần ${isoWeekNumber(weekStart)}`;
}

/** `Tuần 32 · 05/08–11/08/2026`. */
export function formatWeekTitle(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const short = (value: string) => formatHanoiDate(value).slice(0, 5);
  return `${weekNumberLabel(weekStart)} · ${short(weekStart)}–${formatHanoiDate(end)}`;
}

/** `Báo cáo tuần 32 — Team Branding`. */
export function weeklyReportTitle(weekStart: string, teamName: string | null): string {
  return `Báo cáo tuần ${isoWeekNumber(weekStart)} — ${teamName ?? "Team"}`;
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
    authorName: maskName(author?.display_name) ?? null,
    team_id: (row["team_id"] as string | null) ?? null,
    teamName: team?.name ?? null,
    results: (row["results"] as string | null) ?? null,
    blockers: (row["blockers"] as string | null) ?? null,
    next_plan: (row["next_plan"] as string | null) ?? null,
    status: row["status"] as ReportStatus,
    reviewer_id: (row["reviewer_id"] as string | null) ?? null,
    reviewerName: maskName(reviewer?.display_name) ?? null,
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
  snapshot: WeeklySnapshot | null;
}

const WEEKLY_SELECT = `
  id,team_id,week_start,leader_id,highlights,unfinished,blockers,next_week_plan,status,
  reviewer_id,review_note,submitted_at,reviewed_at,created_at,updated_at,snapshot,
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
    leaderName: maskName(leader?.display_name) ?? null,
    highlights: (row["highlights"] as string | null) ?? null,
    unfinished: (row["unfinished"] as string | null) ?? null,
    blockers: (row["blockers"] as string | null) ?? null,
    next_week_plan: (row["next_week_plan"] as string | null) ?? null,
    status: row["status"] as ReportStatus,
    reviewer_id: (row["reviewer_id"] as string | null) ?? null,
    reviewerName: maskName(reviewer?.display_name) ?? null,
    review_note: (row["review_note"] as string | null) ?? null,
    submitted_at: (row["submitted_at"] as string | null) ?? null,
    reviewed_at: (row["reviewed_at"] as string | null) ?? null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
    snapshot: (row["snapshot"] as WeeklySnapshot | null) ?? null,
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

/* ===== REPORT-WEEKLY-FLOW-01 — tự tổng hợp nội dung báo cáo tuần ===== */

export interface WeeklyProjectItem {
  id: string;
  name: string;
  status: string;
  note: string;
}

export interface WeeklyTaskItem {
  id: string;
  name: string;
  assigneeName: string | null;
  projectName: string | null;
  result: string | null;
  deadline: string;
}

export interface WeeklyPersonItem {
  id: string;
  name: string;
  done: number;
  open: number;
  overdue: number;
  dailySent: number;
  dailyMissing: number;
  needsSupport: boolean;
}

export interface WeeklySnapshot {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  projects: {
    active: number;
    completed: number;
    delayed: number;
    noUpdate: number;
    attention: number;
    items: WeeklyProjectItem[];
  };
  tasks: {
    completed: WeeklyTaskItem[];
    attention: WeeklyTaskItem[];
    counts: {
      completed: number;
      onTime: number;
      overdue: number;
      open: number;
      review: number;
      changesRequested: number;
    };
  };
  people: WeeklyPersonItem[];
  daily: {
    complete: string[];
    missing: string[];
    highlights: string[];
  };
}

const PROJECT_STATUS_TEXT: Record<string, string> = {
  idea: "Ý tưởng",
  leader_review: "Leader duyệt",
  proposal: "Đề xuất",
  planning: "Lập kế hoạch",
  in_progress: "Đang triển khai",
  pending_acceptance: "Chờ nghiệm thu",
  completed: "Hoàn thành",
  archived: "Lưu trữ",
  rejected: "Từ chối",
};

/** Số ngày làm việc (Thứ Hai–Thứ Sáu) đã trôi qua trong tuần, tính đến hôm nay. */
function workingDaysElapsed(weekStart: string): string[] {
  const today = hanoiToday();
  const days: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const day = addDays(weekStart, i);
    if (day > today) break;
    days.push(day);
  }
  return days;
}

/**
 * Tổng hợp toàn bộ tình hình vận hành của Team trong tuần từ Dự án, Task,
 * nhân sự và Báo cáo ngày. Leader chỉ kiểm tra và nhận xét.
 */
export async function fetchWeeklySnapshot(
  teamId: string,
  weekStart: string,
): Promise<WeeklySnapshot> {
  await primeLockedIdentity();
  const weekEnd = addDays(weekStart, 6);
  const startMs = hanoiStartOfDayMs(weekStart) ?? 0;
  const endMs = (hanoiStartOfDayMs(weekEnd) ?? 0) + 24 * 60 * 60 * 1000;
  const now = Date.now();

  const [membersRes, linkRes, tasksRes, dailyRes] = await Promise.all([
    supabase.from("profiles").select("id,display_name,status").eq("primary_team_id", teamId),
    supabase.from("project_teams").select("project_id").eq("team_id", teamId),
    supabase
      .from("tasks")
      .select(
        "id,name,status,deadline,updated_at,completed_at,result_text,result_updated_at,is_archived,cancelled_at,approval_status,team_id,assignee_id,project_id," +
          "assignee:profiles!tasks_assignee_id_fkey(display_name),project:projects(name)",
      )
      .eq("team_id", teamId)
      .is("cancelled_at", null)
      .limit(1000),
    supabase
      .from("daily_reports")
      .select("id,author_id,report_date,status,results,submitted_at")
      .eq("team_id", teamId)
      .gte("report_date", weekStart)
      .lte("report_date", weekEnd),
  ]);
  for (const res of [membersRes, linkRes, tasksRes, dailyRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const members = (membersRes.data ?? []).filter((m) => m.status === "active");
  const memberName = new Map(members.map((m) => [m.id, maskName(m.display_name) ?? "—"]));

  /* ---- Phần 1: Dự án ---- */
  const projectIds = new Set((linkRes.data ?? []).map((row) => row.project_id));
  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("id,name,status,deadline,updated_at,completed_at,responsible_team_id")
    .is("manually_archived_at", null)
    .limit(500);
  if (projectError) throw new Error(projectError.message);

  const projects = (projectRows ?? []).filter(
    (row) => row.responsible_team_id === teamId || projectIds.has(row.id),
  );
  const projectStats = { active: 0, completed: 0, delayed: 0, noUpdate: 0, attention: 0 };
  const projectItems: WeeklyProjectItem[] = [];
  for (const row of projects) {
    const updated = new Date(row.updated_at as string).getTime();
    const completedAt = row.completed_at ? new Date(row.completed_at).getTime() : null;
    const deadline = row.deadline ? new Date(`${row.deadline}T23:59:59+07:00`).getTime() : null;
    const notes: string[] = [];

    if (completedAt !== null && completedAt >= startMs && completedAt < endMs) {
      projectStats.completed += 1;
      notes.push("Hoàn thành trong tuần");
    } else if (row.status === "in_progress" || row.status === "planning") {
      projectStats.active += 1;
    }
    const delayed =
      row.status !== "completed" &&
      row.status !== "archived" &&
      deadline !== null &&
      deadline < now;
    if (delayed) {
      projectStats.delayed += 1;
      notes.push("Chậm tiến độ");
    }
    const stale = row.status !== "completed" && (Number.isNaN(updated) || updated < startMs);
    if (stale) {
      projectStats.noUpdate += 1;
      notes.push("Không cập nhật trong tuần");
    }
    if (delayed || (stale && row.status === "in_progress")) {
      projectStats.attention += 1;
      notes.push("Cần CMO/Admin chú ý");
    }
    if (notes.length > 0) {
      projectItems.push({
        id: row.id,
        name: row.name,
        status: PROJECT_STATUS_TEXT[row.status as string] ?? String(row.status),
        note: notes.join(" · "),
      });
    }
  }
  projectItems.sort((a, b) => b.note.length - a.note.length);

  /* ---- Phần 2: Task ---- */
  type RawWeeklyTask = {
    id: string;
    name: string;
    status: string;
    deadline: string;
    updated_at: string;
    completed_at: string | null;
    result_text: string | null;
    result_updated_at: string | null;
    is_archived: boolean;
    approval_status: string;
    assignee_id: string;
    assignee: { display_name: string } | null;
    project: { name: string } | null;
  };
  const tasks = ((tasksRes.data ?? []) as unknown as RawWeeklyTask[]).filter(
    (row) => row.approval_status === "approved",
  );
  const changesRequestedCount = ((tasksRes.data ?? []) as unknown as RawWeeklyTask[]).filter(
    (row) => row.approval_status === "changes_requested" && !row.is_archived,
  ).length;

  const completedTasks: WeeklyTaskItem[] = [];
  const attentionTasks: WeeklyTaskItem[] = [];
  const counts = { completed: 0, onTime: 0, overdue: 0, open: 0, review: 0, changesRequested: 0 };
  counts.changesRequested = changesRequestedCount;
  const perPerson = new Map<string, WeeklyPersonItem>();
  function person(id: string): WeeklyPersonItem {
    let entry = perPerson.get(id);
    if (!entry) {
      entry = {
        id,
        name: memberName.get(id) ?? "—",
        done: 0,
        open: 0,
        overdue: 0,
        dailySent: 0,
        dailyMissing: 0,
        needsSupport: false,
      };
      perPerson.set(id, entry);
    }
    return entry;
  }
  for (const member of members) person(member.id);

  for (const row of tasks) {
    const deadline = new Date(row.deadline).getTime();
    const item: WeeklyTaskItem = {
      id: row.id,
      name: row.name,
      assigneeName: maskName(row.assignee?.display_name ?? null) ?? null,
      projectName: row.project?.name ?? null,
      result: (row.result_text ?? "").trim() || null,
      deadline: row.deadline,
    };
    if (row.status === "done") {
      const doneAt = new Date(
        (row.completed_at ?? row.result_updated_at ?? row.updated_at) as string,
      ).getTime();
      if (Number.isNaN(doneAt) || doneAt < startMs || doneAt >= endMs) continue;
      counts.completed += 1;
      if (!Number.isNaN(deadline) && doneAt <= deadline) counts.onTime += 1;
      completedTasks.push(item);
      person(row.assignee_id).done += 1;
      continue;
    }
    if (row.is_archived) continue;
    counts.open += 1;
    person(row.assignee_id).open += 1;
    if (row.status === "review") counts.review += 1;
    if (!Number.isNaN(deadline) && deadline < now) {
      counts.overdue += 1;
      person(row.assignee_id).overdue += 1;
      attentionTasks.push(item);
    } else if (row.status === "review") {
      attentionTasks.push(item);
    }
  }

  /* ---- Phần 3 + 4: Báo cáo ngày ---- */
  const dailyRows = dailyRes.data ?? [];
  const workDays = workingDaysElapsed(weekStart);
  const highlights: string[] = [];
  const submittedByPerson = new Map<string, Set<string>>();
  for (const row of dailyRows) {
    if (row.status === "draft") continue;
    const set = submittedByPerson.get(row.author_id) ?? new Set<string>();
    set.add(row.report_date);
    submittedByPerson.set(row.author_id, set);
    if (row.status === "approved" && (row.results ?? "").trim() && highlights.length < 8) {
      highlights.push(`${formatHanoiDate(row.report_date)} · ${(row.results ?? "").trim()}`);
    }
  }

  const complete: string[] = [];
  const missing: string[] = [];
  for (const entry of perPerson.values()) {
    const sent = submittedByPerson.get(entry.id)?.size ?? 0;
    entry.dailySent = sent;
    entry.dailyMissing = Math.max(workDays.length - sent, 0);
    entry.needsSupport = entry.overdue > 0 || entry.dailyMissing >= 2;
    if (entry.dailyMissing === 0 && workDays.length > 0) complete.push(entry.name);
    else missing.push(`${entry.name} (thiếu ${entry.dailyMissing}/${workDays.length})`);
  }

  return {
    weekStart,
    weekEnd,
    weekNumber: isoWeekNumber(weekStart),
    projects: { ...projectStats, items: projectItems.slice(0, 5) },
    tasks: {
      completed: completedTasks.slice(0, 30),
      attention: attentionTasks.slice(0, 30),
      counts,
    },
    people: [...perPerson.values()].sort((a, b) => a.name.localeCompare(b.name)),
    daily: { complete, missing, highlights },
  };
}

export const weeklySnapshotQuery = (teamId: string | null, weekStart: string) =>
  queryOptions({
    queryKey: ["weekly-snapshot", teamId, weekStart],
    queryFn: () => (teamId ? fetchWeeklySnapshot(teamId, weekStart) : Promise.resolve(null)),
    enabled: Boolean(teamId && weekStart),
  });

/** Tóm tắt snapshot thành văn bản lưu kèm báo cáo (cột `unfinished`). */
export function weeklySnapshotSummary(snapshot: WeeklySnapshot): string {
  const c = snapshot.tasks.counts;
  return [
    `Dự án: đang triển khai ${snapshot.projects.active} | hoàn thành trong tuần ${snapshot.projects.completed} | chậm tiến độ ${snapshot.projects.delayed} | không cập nhật ${snapshot.projects.noUpdate} | cần chú ý ${snapshot.projects.attention}`,
    `Task: hoàn thành ${c.completed} | đúng hạn ${c.onTime} | quá hạn ${c.overdue} | còn mở ${c.open} | chờ kiểm tra ${c.review} | yêu cầu sửa ${c.changesRequested}`,
    `Báo cáo ngày: đủ ${snapshot.daily.complete.length} người | thiếu/muộn ${snapshot.daily.missing.length} người`,
  ].join("\n");
}

/**
 * Tìm hoặc tạo bản nháp báo cáo tuần cho Team + tuần (không tạo trùng).
 * Gọi khi Leader mở tab Báo cáo tuần hoặc bấm tạo.
 */
export async function ensureWeeklyDraft(
  teamId: string,
  leaderId: string,
  weekStart: string,
): Promise<string> {
  const week = weekStartOf(weekStart);
  const { data: existing, error: findError } = await supabase
    .from("weekly_reports")
    .select("id")
    .eq("team_id", teamId)
    .eq("week_start", week)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("weekly_reports")
    .insert({
      team_id: teamId,
      week_start: week,
      leader_id: leaderId,
      status: "draft",
      highlights: "",
      unfinished: "",
      blockers: "",
      next_week_plan: "",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

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
  await primeLockedIdentity();
  const dayStart = hanoiStartOfDayMs(reportDate);
  if (dayStart === null) return [];
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,name,status,priority,deadline,start_date,updated_at,assignee_id,is_archived,project:projects(name),task_participants(user_id)",
    )
    .eq("is_archived", false)
    .eq("approval_status", "approved")
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

/**
 * Kết quả đạt được tự điền cho Báo cáo ngày.
 * Chỉ lấy Task mà người gửi là người phụ trách, đã hoàn thành trong đúng ngày
 * báo cáo (giờ Hà Nội) và đã có Kết quả công việc.
 * Định dạng mỗi dòng: `Tên công việc — Kết quả công việc`.
 */
export async function fetchDailyResultLines(
  authorId: string,
  reportDate: string,
): Promise<string[]> {
  await primeLockedIdentity();
  const dayStart = hanoiStartOfDayMs(reportDate);
  if (dayStart === null) return [];
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("tasks")
    .select("id,name,result_text,result_updated_at,updated_at,deadline")
    .eq("assignee_id", authorId)
    .eq("approval_status", "approved")
    .eq("status", "done")
    .not("result_text", "is", null)
    .order("deadline", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const lines: string[] = [];
  for (const row of data ?? []) {
    const doneAt = new Date((row.result_updated_at ?? row.updated_at) as string).getTime();
    if (Number.isNaN(doneAt) || doneAt < dayStart || doneAt >= dayEnd) continue;
    const result = (row.result_text ?? "").trim();
    if (!result) continue;
    lines.push(`${row.name} — ${result}`);
  }
  return lines;
}

export const dailyResultLinesQuery = (authorId: string | null, reportDate: string) =>
  queryOptions({
    queryKey: ["daily-result-lines", authorId, reportDate],
    queryFn: () => (authorId ? fetchDailyResultLines(authorId, reportDate) : Promise.resolve([])),
    enabled: Boolean(authorId && reportDate),
  });

export const dailyTaskRefsQuery = (authorId: string | null, reportDate: string) =>
  queryOptions({
    queryKey: ["daily-task-refs", authorId, reportDate],
    queryFn: () => (authorId ? fetchDailyTaskRefs(authorId, reportDate) : Promise.resolve([])),
    enabled: Boolean(authorId && reportDate),
  });

/* ====== REPORT-DAILY-FLOW-02 — snapshot Báo cáo ngày tự sinh từ Task ====== */

export interface DailyCompletedTask {
  id: string;
  name: string;
  result: string;
  projectName: string | null;
  completedAt: string | null;
}

export interface DailySnapshot {
  /** Task người gửi phụ trách chính, hoàn thành trong ngày và đã có kết quả. */
  completed: DailyCompletedTask[];
  /** Task hoàn thành trong ngày nhưng chưa cập nhật kết quả — chặn gửi báo cáo. */
  missingResult: { id: string; name: string }[];
  openCount: number;
  overdueCount: number;
  reviewCount: number;
}

/**
 * Tự sinh nội dung Báo cáo ngày từ Task của chính người gửi (assignee).
 * Không tính Task chỉ tham gia/phối hợp, không tính Task đã hủy hoặc lưu trữ.
 */
export async function fetchDailySnapshot(
  authorId: string,
  reportDate: string,
): Promise<DailySnapshot> {
  const dayStart = hanoiStartOfDayMs(reportDate);
  const empty: DailySnapshot = {
    completed: [],
    missingResult: [],
    openCount: 0,
    overdueCount: 0,
    reviewCount: 0,
  };
  if (dayStart === null) return empty;
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,name,status,deadline,result_text,result_updated_at,updated_at,is_archived,cancelled_at,completed_at,project:projects(name)",
    )
    .eq("assignee_id", authorId)
    .eq("approval_status", "approved")
    .is("cancelled_at", null)
    .limit(500);
  if (error) throw new Error(error.message);

  const snapshot: DailySnapshot = { ...empty, completed: [], missingResult: [] };
  const now = Date.now();
  for (const row of data ?? []) {
    if (row.status === "done") {
      const doneAt = new Date((row.result_updated_at ?? row.updated_at) as string).getTime();
      if (Number.isNaN(doneAt) || doneAt < dayStart || doneAt >= dayEnd) continue;
      const result = (row.result_text ?? "").trim();
      const project = (row as Record<string, unknown>)["project"] as { name?: string } | null;
      if (result)
        snapshot.completed.push({
          id: row.id,
          name: row.name,
          result,
          projectName: project?.name ?? null,
          completedAt:
            ((row as Record<string, unknown>)["completed_at"] as string | null) ??
            (row.result_updated_at as string | null) ??
            null,
        });
      else snapshot.missingResult.push({ id: row.id, name: row.name });
      continue;
    }
    if (row.is_archived) continue;
    snapshot.openCount += 1;
    if (row.status === "review") snapshot.reviewCount += 1;
    const deadline = new Date(row.deadline).getTime();
    if (!Number.isNaN(deadline) && deadline < now) snapshot.overdueCount += 1;
  }
  snapshot.completed.sort((a, b) => a.name.localeCompare(b.name));
  return snapshot;
}

export const dailySnapshotQuery = (authorId: string | null, reportDate: string) =>
  queryOptions({
    queryKey: ["daily-snapshot", authorId, reportDate],
    queryFn: () => (authorId ? fetchDailySnapshot(authorId, reportDate) : Promise.resolve(null)),
    enabled: Boolean(authorId && reportDate),
  });

/** Ba phần nội dung lưu vào báo cáo tại thời điểm gửi (snapshot cố định). */
export function snapshotToReportContent(snapshot: DailySnapshot, note: string) {
  const results =
    snapshot.completed.length > 0
      ? snapshot.completed.map((task) => formatDailyItemLine(task)).join("\n")
      : "Không có Task hoàn thành hôm nay.";
  const blockers =
    `Còn mở: ${snapshot.openCount} | Quá hạn: ${snapshot.overdueCount} | ` +
    `Chờ kiểm tra: ${snapshot.reviewCount}`;
  return { results, blockers, nextPlan: note.trim() || NO_NOTE_TEXT };
}

/** Ghi chú bắt buộc khi có Task quá hạn hoặc không hoàn thành Task nào trong ngày. */
export function isDailyNoteRequired(snapshot: DailySnapshot): boolean {
  return snapshot.overdueCount > 0 || snapshot.completed.length === 0;
}

/* ================= Quyền (UI) ================= */

export interface ReportAccessContext {
  userId: string | null;
  role: AppRoleKey | null;
  leaderTeamId: string | null;
}

/* ========== REPORT-REVIEW-UI-01 — xác định người duyệt thật sự ========== */

export interface ReviewerDirectoryMember {
  id: string;
  role: AppRoleKey | null;
  status: string;
  primary_team_id: string | null;
  display_name?: string | null;
}

export interface ReviewerDirectoryTeam {
  id: string;
  leader_id: string | null;
}

export interface ReviewerDirectory {
  members: ReviewerDirectoryMember[];
  teams: ReviewerDirectoryTeam[];
}

export const EMPTY_REVIEWER_DIRECTORY: ReviewerDirectory = { members: [], teams: [] };

function activeWithRole(dir: ReviewerDirectory, role: AppRoleKey): string | null {
  return dir.members.find((m) => m.role === role && m.status === "active")?.id ?? null;
}

function isActive(dir: ReviewerDirectory, id: string | null | undefined): boolean {
  if (!id) return false;
  return dir.members.some((m) => m.id === id && m.status === "active");
}

/**
 * Luồng duyệt:
 * - Báo cáo Member → Leader Team chính.
 * - Báo cáo Leader → CMO.
 * - Báo cáo tuần → CMO.
 * Admin chỉ là người duyệt khi được chỉ định trực tiếp (`reviewer_id`, gồm cả tiếp quản)
 * hoặc khi không còn Leader/CMO hợp lệ.
 */
export function resolveDailyReviewerId(
  report: DailyReportRow,
  dir: ReviewerDirectory,
): string | null {
  if (report.reviewer_id) return report.reviewer_id;
  return resolveDailyReviewerForAuthor(report.author_id, report.team_id, dir);
}

/**
 * Người duyệt dự kiến của một báo cáo ngày chưa tồn tại (dùng để chặn gửi khi thiếu).
 * Member → Leader Team chính; Leader → CMO; Admin chỉ dự phòng khi không có CMO hợp lệ.
 */
export function resolveDailyReviewerForAuthor(
  authorId: string,
  teamId: string | null,
  dir: ReviewerDirectory,
): string | null {
  const author = dir.members.find((m) => m.id === authorId) ?? null;
  if (author?.role !== "leader") {
    const team = teamId ?? author?.primary_team_id ?? null;
    const leaderId = team ? (dir.teams.find((t) => t.id === team)?.leader_id ?? null) : null;
    if (leaderId && leaderId !== authorId && isActive(dir, leaderId)) return leaderId;
  }
  const cmo = activeWithRole(dir, "cmo");
  if (cmo && cmo !== authorId) return cmo;
  const admin = activeWithRole(dir, "admin");
  return admin && admin !== authorId ? admin : null;
}

/**
 * REPORT-DAILY-LIST-01 — tên người duyệt hiển thị ngoài danh sách.
 * Không bao giờ để trống khi báo cáo đang cần duyệt: thiếu người duyệt thì báo rõ.
 */
export function dailyReviewerView(
  report: DailyReportRow,
  dir: ReviewerDirectory,
): { name: string | null; missing: boolean } {
  const reviewerId = resolveDailyReviewerId(report, dir);
  if (!reviewerId) {
    return { name: null, missing: report.status === "submitted" };
  }
  const name =
    report.reviewerName ??
    maskName(dir.members.find((m) => m.id === reviewerId)?.display_name ?? null) ??
    null;
  return { name, missing: !name && report.status === "submitted" };
}

export function resolveWeeklyReviewerId(
  report: WeeklyReportRow,
  dir: ReviewerDirectory,
): string | null {
  if (report.reviewer_id) return report.reviewer_id;
  const cmo = activeWithRole(dir, "cmo");
  if (cmo && cmo !== report.leader_id) return cmo;
  const admin = activeWithRole(dir, "admin");
  return admin && admin !== report.leader_id ? admin : null;
}

/** Người duyệt dự kiến của báo cáo tuần chưa tồn tại: CMO trước, Admin dự phòng. */
export function resolveWeeklyReviewerForLeader(
  leaderId: string,
  dir: ReviewerDirectory,
): string | null {
  const cmo = activeWithRole(dir, "cmo");
  if (cmo && cmo !== leaderId) return cmo;
  const admin = activeWithRole(dir, "admin");
  return admin && admin !== leaderId ? admin : null;
}

export const WEEKLY_REVIEWER_MISSING_MESSAGE =
  "Chưa xác định được người duyệt báo cáo tuần.";

/** Tên người duyệt hiển thị ngoài danh sách báo cáo tuần. */
export function weeklyReviewerView(
  report: WeeklyReportRow,
  dir: ReviewerDirectory,
): { name: string | null; missing: boolean } {
  const reviewerId = resolveWeeklyReviewerId(report, dir);
  if (!reviewerId) return { name: null, missing: report.status !== "approved" };
  const name =
    report.reviewerName ??
    maskName(dir.members.find((m) => m.id === reviewerId)?.display_name ?? null) ??
    null;
  return { name, missing: !name && report.status === "submitted" };
}

/** Quá hạn duyệt: đã gửi nhưng để quá 48 giờ chưa xử lý. */
export function isReviewOverdue(row: {
  status: ReportStatus;
  submitted_at: string | null;
}): boolean {
  if (row.status !== "submitted" || !row.submitted_at) return false;
  return Date.now() - new Date(row.submitted_at).getTime() > 48 * 60 * 60 * 1000;
}

/** Admin đang không phải người duyệt vẫn có thể chủ động tiếp quản. */
export function canTakeoverReview(
  row: { status: ReportStatus },
  ctx: ReportAccessContext,
  awaitingMe: boolean,
): boolean {
  return ctx.role === "admin" && row.status === "submitted" && !awaitingMe;
}

export async function takeoverReportReview(
  kind: "daily" | "weekly",
  id: string,
  reason: string | null,
) {
  const args: { _kind: string; _id: string; _reason?: string } = { _kind: kind, _id: id };
  if (reason) args._reason = reason;
  const { error } = await supabase.rpc(
    "report_review_takeover",
    args as { _kind: string; _id: string; _reason: string },
  );
  fail(error);
}

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
 * Chỉ đúng người duyệt hiện tại mới thấy hành động duyệt.
 * Quyền xem toàn hệ thống (Admin/CMO) không tự biến thành quyền duyệt.
 */
export function canReviewDaily(
  report: DailyReportRow,
  ctx: ReportAccessContext,
  dir: ReviewerDirectory,
) {
  if (!ctx.userId || report.author_id === ctx.userId) return false;
  if (report.status !== "submitted") return false;
  return resolveDailyReviewerId(report, dir) === ctx.userId;
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

export function canReviewWeekly(
  report: WeeklyReportRow,
  ctx: ReportAccessContext,
  dir: ReviewerDirectory,
) {
  if (!ctx.userId || report.leader_id === ctx.userId) return false;
  if (report.status !== "submitted") return false;
  return resolveWeeklyReviewerId(report, dir) === ctx.userId;
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
  snapshot?: WeeklySnapshot | null;
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
      snapshot: (input.snapshot ?? null) as never,
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
      snapshot: (input.snapshot ?? null) as never,
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
  await primeLockedIdentity();
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

/* ================= Chống trùng báo cáo ngày ================= */

/**
 * Đọc lại báo cáo ngày của chính người dùng cho một ngày (nguồn sự thật ở server).
 * Dùng ngay trước khi ghi để không tạo bản ghi trùng khi UI đang giữ dữ liệu cũ.
 */
export async function fetchMyDailyReport(
  authorId: string,
  reportDate: string,
): Promise<DailyReportRow | null> {
  await primeLockedIdentity();
  const { data, error } = await supabase
    .from("daily_reports")
    .select(DAILY_SELECT)
    .eq("author_id", authorId)
    .eq("report_date", reportDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDaily(data as Record<string, unknown>) : null;
}

export const myDailyReportQuery = (authorId: string | null, reportDate: string) =>
  queryOptions({
    queryKey: ["daily-report-mine", authorId, reportDate],
    queryFn: () =>
      authorId ? fetchMyDailyReport(authorId, reportDate) : Promise.resolve(null),
    enabled: Boolean(authorId && reportDate),
  });
