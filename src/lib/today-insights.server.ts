import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { isSystemAdminRole, type AppRoleKey } from "@/lib/permissions";
import {
  TEAM_ATTENTION_LIMIT,
  TEAM_ATTENTION_MIN_OVERDUE,
  TEAM_ATTENTION_OVERDUE_RATIO,
  type MarketingFocus,
  type MyFocus,
  type ReportPulse,
  type SystemFocus,
  type TaskBrief,
  type TeamAttention,
  type TeamFocus,
  type TodayInsights,
  type TodayScopeMetrics,
} from "@/lib/today-insights";

/**
 * CEN TODAY-03 — tổng hợp góc nhìn theo vai trò cho Trang chủ.
 * Chạy bằng phiên người gọi nên RLS vẫn là ranh giới dữ liệu cuối cùng;
 * phần lọc theo vai trò chỉ quyết định hiển thị khối nào.
 * Không tạo bảng trạng thái mới: mọi con số đọc trực tiếp từ module gốc.
 */
type Client = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
const HANOI_OFFSET_MS = 7 * 60 * 60 * 1000;

function hanoiToday(now = new Date()): string {
  return new Date(now.getTime() + HANOI_OFFSET_MS).toISOString().slice(0, 10);
}

function weekStartOf(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00+07:00`);
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - day * DAY_MS).toISOString().slice(0, 10);
}

function hanoiDate(ms: number): string {
  return new Date(ms + HANOI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Phạm vi thời gian đang chọn trên Dashboard (mốc epoch ms). */
export interface InsightsRange {
  start: number;
  end: number;
}

const ACTIVE_PROJECT_STATUSES = ["planning", "in_progress", "pending_acceptance"];
const UNAPPROVED_PROJECT_STATUSES = ["idea", "leader_review", "proposal", "rejected"];

export async function buildTodayInsights(
  supabase: Client,
  userId: string,
  role: AppRoleKey | null,
  leaderTeamId: string | null,
  range: InsightsRange,
): Promise<TodayInsights> {
  const now = new Date();
  const today = hanoiToday(now);
  const weekStart = weekStartOf(today);
  const privileged = isSystemAdminRole(role);
  const isAdmin = role === "admin";
  const failedSources: string[] = [];
  const rangeStartDate = hanoiDate(range.start);
  const rangeEndDate = hanoiDate(range.end);
  const rangeStartISO = new Date(range.start).toISOString();
  const rangeEndISO = new Date(range.end).toISOString();
  const viewRole: "admin" | "leader" | "member" = privileged
    ? "admin"
    : role === "leader"
      ? "leader"
      : "member";

  /**
   * PERF-02: mỗi nguồn dữ liệu vẫn được cô lập lỗi như trước,
   * nhưng các nguồn độc lập chạy song song thay vì xếp hàng chờ nhau.
   */
  async function source(name: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      console.error(`[today-insights] ${name}`, error);
      failedSources.push(name);
    }
  }

  function check(error: { message: string } | null) {
    if (error) throw new Error(error.message);
  }

  const me: MyFocus = {
    open_tasks: 0,
    overdue_tasks: 0,
    due_today: 0,
    done_this_week: 0,
    recognitions_received_week: 0,
  };

  type TaskRow = {
    id: string;
    name: string;
    team_id: string | null;
    assignee_id: string;
    status: Database["public"]["Enums"]["task_status"];
    deadline: string;
    completed_at: string | null;
  };

  let tasks: TaskRow[] = [];
  const nameById = new Map<string, string>();
  const teamOfUser = new Map<string, string | null>();
  let myDisplayName: string | null = null;

  type ProjectRow = {
    id: string;
    status: string;
    owner_id: string | null;
    responsible_team_id: string | null;
    deadline: string | null;
    completed_at: string | null;
  };
  type DailyRow = { author_id: string; status: string; report_date: string };
  type WeeklyRow = { status: string; submitted_at: string | null };
  type TeamRow = { id: string; name: string; leader_id: string | null };

  let projects: ProjectRow[] = [];
  let dailyRangeRows: DailyRow[] = [];
  let weeklyRangeRows: WeeklyRow[] = [];
  let teams: TeamRow[] = [];
  const dailyAuthorsToday = new Set<string>();
  // REPORT-FIX-01: Admin/CMO được miễn báo cáo ngày, không tính vào "chưa gửi".
  const dailyExempt = new Set<string>();
  const systemDraft: SystemFocus = {
    locked_accounts: 0,
    members_without_team: 0,
    telegram_unlinked: 0,
    telegram_failed: 0,
    outbox_pending: 0,
    outbox_failed: 0,
    announcements_overdue: 0,
  };

  // ---- Đợt 1: mọi truy vấn độc lập chạy song song, lỗi từng nguồn được cô lập ----
  const wave: Promise<void>[] = [];

  // Danh bạ dùng chung cho mọi khối (một truy vấn, tránh N+1).
  wave.push(source("profiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,display_name,primary_team_id,status,telegram_user_id,telegram_test_status")
      .limit(1000);
    check(error);
    for (const row of data ?? []) {
      nameById.set(row.id, row.display_name);
      teamOfUser.set(row.id, row.primary_team_id);
      if (row.id === userId) myDisplayName = row.display_name;
      if (isAdmin) {
        if (row.status === "locked") systemDraft.locked_accounts += 1;
        if (row.status !== "resigned" && !row.primary_team_id) systemDraft.members_without_team += 1;
        if (row.status === "active" && !row.telegram_user_id) systemDraft.telegram_unlinked += 1;
        if (row.telegram_test_status === "failed") systemDraft.telegram_failed += 1;
      }
    }
  }));

  wave.push(source("tasks", async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,name,team_id,assignee_id,status,deadline,completed_at")
      .eq("is_archived", false)
      .eq("approval_status", "approved")
      .is("deleted_at", null)
      .limit(2000);
    check(error);
    tasks = (data ?? []) as TaskRow[];
  }));

  wave.push(source("recognitions", async () => {
    const { count, error } = await supabase
      .from("recognitions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .is("revoked_at", null)
      .gte("created_at", `${weekStart}T00:00:00+07:00`);
    check(error);
    me.recognitions_received_week = count ?? 0;
  }));

  wave.push(source("daily_exempt_roles", async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["admin", "cmo"])
      .limit(1000);
    check(error);
    for (const row of data ?? []) dailyExempt.add(row.user_id);
  }));

  // Một truy vấn báo cáo ngày cho cả "hôm nay" lẫn phạm vi đang chọn.
  wave.push(source("daily_reports", async () => {
    const { data, error } = await supabase
      .from("daily_reports")
      .select("author_id,status,report_date")
      .gte("report_date", rangeStartDate)
      .lt("report_date", rangeEndDate)
      .limit(5000);
    check(error);
    dailyRangeRows = (data ?? []) as DailyRow[];
    for (const row of dailyRangeRows) {
      if (row.report_date !== today) continue;
      if (row.status === "submitted" || row.status === "approved") {
        dailyAuthorsToday.add(row.author_id);
      }
    }
  }));

  wave.push(source("weekly_reports", async () => {
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("status,submitted_at")
      .eq("status", "submitted")
      .gte("submitted_at", rangeStartISO)
      .lt("submitted_at", rangeEndISO)
      .limit(500);
    check(error);
    weeklyRangeRows = (data ?? []) as WeeklyRow[];
  }));

  wave.push(source("projects", async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id,status,owner_id,responsible_team_id,deadline,completed_at")
      .is("deleted_at", null)
      .limit(1000);
    check(error);
    projects = (data ?? []) as ProjectRow[];
  }));

  wave.push(source("teams", async () => {
    const { data, error } = await supabase.from("teams").select("id,name,leader_id").limit(200);
    check(error);
    teams = (data ?? []) as TeamRow[];
  }));

  if (isAdmin) {
    wave.push(source("system_outbox", async () => {
      const { data, error } = await supabase
        .from("telegram_outbox")
        .select("status")
        .in("status", ["pending", "failed"])
        .limit(1000);
      check(error);
      for (const row of data ?? []) {
        if (row.status === "pending") systemDraft.outbox_pending += 1;
        if (row.status === "failed") systemDraft.outbox_failed += 1;
      }
    }));

    wave.push(source("system_announcements", async () => {
      const { count, error } = await supabase
        .from("announcement_recipients")
        .select("id", { count: "exact", head: true })
        .in("status", ["unread", "reading"])
        .lt("due_at", now.toISOString());
      check(error);
      systemDraft.announcements_overdue = count ?? 0;
    }));
  }

  await Promise.all(wave);

  // ---- Đợt 2: tổng hợp trên dữ liệu đã tải, không phát sinh truy vấn mới ----
  for (const task of tasks) {
    const overdue = task.status !== "done" && new Date(task.deadline).getTime() < now.getTime();
    if (task.assignee_id !== userId) continue;
    if (task.status !== "done") {
      me.open_tasks += 1;
      if (overdue) me.overdue_tasks += 1;
      if (task.deadline.slice(0, 10) === today) me.due_today += 1;
    } else if (task.completed_at && task.completed_at >= `${weekStart}T00:00:00+07:00`) {
      me.done_this_week += 1;
    }
  }

  function overdueOf(list: TaskRow[]): TaskRow[] {
    return list.filter(
      (task) => task.status !== "done" && new Date(task.deadline).getTime() < now.getTime(),
    );
  }

  function brief(list: TaskRow[]): TaskBrief[] {
    return [...list]
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        name: task.name,
        assignee: nameById.get(task.assignee_id) ?? "Không rõ",
        deadline: task.deadline,
      }));
  }

  // ---- Leader: sức khỏe Team mình phụ trách ----
  let team: TeamFocus | null = null;
  if (leaderTeamId) {
    const data = teams.find((row) => row.id === leaderTeamId);
    if (data) {
      const members = [...teamOfUser.entries()]
        .filter(([, teamId]) => teamId === leaderTeamId)
        .map(([id]) => id);
      const teamTasks = tasks.filter((task) => task.team_id === leaderTeamId);
      const openTasks = teamTasks.filter((task) => task.status !== "done");
      const overdue = overdueOf(teamTasks);

      team = {
        team_id: data.id,
        team_name: data.name,
        member_count: members.length,
        open_tasks: openTasks.length,
        overdue_tasks: overdue.length,
        missing_daily: members
          .filter((id) => !dailyAuthorsToday.has(id) && !dailyExempt.has(id))
          .slice(0, 8)
          .map((id) => ({ id, name: nameById.get(id) ?? "Không rõ" })),
        pending_reviews: teamTasks.filter((task) => task.status === "review").length,
        top_overdue: brief(overdue),
      };
    }
  }

  // ---- CMO / Admin: sức khỏe marketing toàn hệ thống ----
  let marketing: MarketingFocus | null = null;
  if (privileged) {
    const attention: TeamAttention[] = [];
      for (const row of teams) {
        const teamTasks = tasks.filter((task) => task.team_id === row.id);
        const open = teamTasks.filter((task) => task.status !== "done");
        const overdue = overdueOf(teamTasks);
        const ratio = open.length === 0 ? 0 : overdue.length / open.length;
        const byCount = overdue.length >= TEAM_ATTENTION_MIN_OVERDUE;
        const byRatio = ratio >= TEAM_ATTENTION_OVERDUE_RATIO && overdue.length > 0;
        if (!byCount && !byRatio) continue;
        const missing = [...teamOfUser.entries()].filter(
          ([id, teamId]) => teamId === row.id && !dailyAuthorsToday.has(id) && !dailyExempt.has(id),
        ).length;
        attention.push({
          team_id: row.id,
          team_name: row.name,
          leader_name: row.leader_id ? (nameById.get(row.leader_id) ?? null) : null,
          open_tasks: open.length,
          overdue_tasks: overdue.length,
          overdue_ratio: ratio,
          missing_daily: missing,
          reason: byCount
            ? `${overdue.length} việc quá hạn`
            : `${Math.round(ratio * 100)}% việc đang mở bị quá hạn`,
        });
      }
      attention.sort((a, b) => b.overdue_tasks - a.overdue_tasks || b.overdue_ratio - a.overdue_ratio);

      const activeMembers = [...teamOfUser.entries()].filter(
        ([id, teamId]) => Boolean(teamId) && !dailyExempt.has(id),
      ).length;

      marketing = {
        teams_attention: attention.slice(0, TEAM_ATTENTION_LIMIT),
        total_teams: teams.length,
        projects_awaiting_decision: projects.filter(
          (project) => project.status === "leader_review" || project.status === "proposal",
        ).length,
        projects_overdue: projects.filter(
          (project) =>
            project.deadline !== null &&
            project.completed_at === null &&
            project.status !== "archived" &&
            project.status !== "rejected" &&
            project.deadline < today,
        ).length,
        overdue_tasks: overdueOf(tasks).length,
        daily_report_rate:
          activeMembers === 0 ? 0 : Math.min(1, dailyAuthorsToday.size / activeMembers),
      };
  }

  // ---- Admin: tình trạng vận hành kỹ thuật ----
  const system: SystemFocus | null = isAdmin ? systemDraft : null;

  // ---- KPI Dashboard: giữ nguyên công thức của today-metrics, chỉ trả về số đếm ----
  const scopedTasks = tasks.filter((task) => {
    if (viewRole === "member") return task.assignee_id === userId;
    if (viewRole === "leader" && leaderTeamId) {
      return task.team_id === leaderTeamId || teamOfUser.get(task.assignee_id) === leaderTeamId;
    }
    return true;
  });
  const scopedProjects = projects.filter((project) => {
    if (viewRole === "leader" && leaderTeamId) {
      return project.responsible_team_id === leaderTeamId || project.owner_id === userId;
    }
    if (viewRole === "member") return project.owner_id === userId;
    return true;
  });
  const openScoped = scopedTasks.filter((task) => task.status !== "done");
  const inRangeMs = (value: string | null | undefined) => {
    if (!value) return false;
    const iso = value.length === 10 ? `${value}T00:00:00+07:00` : value;
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return false;
    return time >= range.start && time < range.end;
  };

  const pendingDaily = dailyRangeRows.filter((row) => row.status === "submitted").length;
  const pendingWeekly = weeklyRangeRows.length;
  let pendingReports: number;
  if (viewRole === "member") {
    const mine = dailyRangeRows.find(
      (row) => row.author_id === userId && row.report_date === today,
    );
    pendingReports =
      !mine || mine.status === "draft" || mine.status === "changes_requested" ? 1 : 0;
  } else {
    pendingReports = pendingDaily + pendingWeekly;
  }

  const metrics: TodayScopeMetrics = {
    open_count: openScoped.length,
    active_projects: scopedProjects.filter(
      (project) =>
        ACTIVE_PROJECT_STATUSES.includes(project.status) &&
        !UNAPPROVED_PROJECT_STATUSES.includes(project.status),
    ).length,
    due_in_range_count: openScoped.filter((task) => inRangeMs(task.deadline)).length,
    overdue_count: overdueOf(scopedTasks).length,
    completed_in_range_count: scopedTasks.filter(
      (task) => task.status === "done" && inRangeMs(task.completed_at),
    ).length,
    pending_report_count: pendingReports,
  };
  const reports: ReportPulse = { pending_daily: pendingDaily, pending_weekly: pendingWeekly };

  return {
    role,
    display_name: myDisplayName,
    metrics,
    reports,
    me,
    team,
    marketing,
    system,
    failedSources,
    generated_at: now.toISOString(),
  };
}
