import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { isSystemAdminRole, type AppRoleKey } from "@/lib/permissions";
import {
  TEAM_ATTENTION_LIMIT,
  TEAM_ATTENTION_MIN_OVERDUE,
  TEAM_ATTENTION_OVERDUE_RATIO,
  type MarketingFocus,
  type MyFocus,
  type SystemFocus,
  type TaskBrief,
  type TeamAttention,
  type TeamFocus,
  type TodayInsights,
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

export async function buildTodayInsights(
  supabase: Client,
  userId: string,
  role: AppRoleKey | null,
  leaderTeamId: string | null,
): Promise<TodayInsights> {
  const now = new Date();
  const today = hanoiToday(now);
  const weekStart = weekStartOf(today);
  const privileged = isSystemAdminRole(role);
  const isAdmin = role === "admin";
  const failedSources: string[] = [];

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

  // Danh bạ dùng chung cho mọi khối (một truy vấn, tránh N+1).
  await source("profiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,display_name,primary_team_id,status,telegram_user_id,telegram_test_status")
      .limit(1000);
    check(error);
    for (const row of data ?? []) {
      nameById.set(row.id, row.display_name);
      teamOfUser.set(row.id, row.primary_team_id);
    }
  });

  await source("tasks", async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,name,team_id,assignee_id,status,deadline,completed_at")
      .eq("is_archived", false)
      .is("deleted_at", null)
      .limit(2000);
    check(error);
    tasks = (data ?? []) as TaskRow[];

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
  });

  await source("recognitions", async () => {
    const { count, error } = await supabase
      .from("recognitions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .is("revoked_at", null)
      .gte("created_at", `${weekStart}T00:00:00+07:00`);
    check(error);
    me.recognitions_received_week = count ?? 0;
  });

  const dailyAuthorsToday = new Set<string>();
  await source("daily_reports", async () => {
    const { data, error } = await supabase
      .from("daily_reports")
      .select("author_id,status")
      .eq("report_date", today)
      .limit(1000);
    check(error);
    for (const row of data ?? []) {
      if (row.status === "submitted" || row.status === "approved") dailyAuthorsToday.add(row.author_id);
    }
  });

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
    await source("team_focus", async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("id", leaderTeamId)
        .maybeSingle();
      check(error);
      if (!data) return;

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
          .filter((id) => !dailyAuthorsToday.has(id))
          .slice(0, 8)
          .map((id) => ({ id, name: nameById.get(id) ?? "Không rõ" })),
        pending_reviews: teamTasks.filter((task) => task.status === "review").length,
        top_overdue: brief(overdue),
      };
    });
  }

  // ---- CMO / Admin: sức khỏe marketing toàn hệ thống ----
  let marketing: MarketingFocus | null = null;
  if (privileged) {
    await source("marketing_focus", async () => {
      const { data: teamRows, error } = await supabase
        .from("teams")
        .select("id,name,leader_id")
        .limit(200);
      check(error);
      const teams = teamRows ?? [];

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
          ([id, teamId]) => teamId === row.id && !dailyAuthorsToday.has(id),
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

      const { data: projectRows, error: projectError } = await supabase
        .from("projects")
        .select("id,status,deadline,completed_at")
        .is("deleted_at", null)
        .limit(500);
      check(projectError);
      const projects = projectRows ?? [];

      const activeMembers = [...teamOfUser.values()].filter(Boolean).length;

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
    });
  }

  // ---- Admin: tình trạng vận hành kỹ thuật ----
  let system: SystemFocus | null = null;
  if (isAdmin) {
    const draft: SystemFocus = {
      locked_accounts: 0,
      members_without_team: 0,
      telegram_unlinked: 0,
      telegram_failed: 0,
      outbox_pending: 0,
      outbox_failed: 0,
      announcements_overdue: 0,
    };

    await source("system_accounts", async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,status,primary_team_id,telegram_user_id,telegram_test_status")
        .limit(1000);
      check(error);
      for (const row of data ?? []) {
        if (row.status === "locked") draft.locked_accounts += 1;
        if (row.status !== "resigned" && !row.primary_team_id) draft.members_without_team += 1;
        if (row.status === "active" && !row.telegram_user_id) draft.telegram_unlinked += 1;
        if (row.telegram_test_status === "failed") draft.telegram_failed += 1;
      }
    });

    await source("system_outbox", async () => {
      const { data, error } = await supabase
        .from("telegram_outbox")
        .select("status")
        .in("status", ["pending", "failed"])
        .limit(1000);
      check(error);
      for (const row of data ?? []) {
        if (row.status === "pending") draft.outbox_pending += 1;
        if (row.status === "failed") draft.outbox_failed += 1;
      }
    });

    await source("system_announcements", async () => {
      const { count, error } = await supabase
        .from("announcement_recipients")
        .select("id", { count: "exact", head: true })
        .in("status", ["unread", "reading"])
        .lt("due_at", now.toISOString());
      check(error);
      draft.announcements_overdue = count ?? 0;
    });

    system = draft;
  }

  return {
    role,
    me,
    team,
    marketing,
    system,
    failedSources,
    generated_at: now.toISOString(),
  };
}
