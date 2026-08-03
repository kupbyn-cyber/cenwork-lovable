import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  IMBALANCE_GAP,
  IMBALANCE_HIGH,
  IMBALANCE_LOW,
  OPS_ALERT_SEVERITY,
  OVERDUE_MIN,
  OVERLOAD_MIN_OPEN,
  OVERLOAD_RATIO,
  PROJECT_STALE_DAYS,
  REWORK_MIN,
  TEAM_MIN_SIZE_FOR_AVG,
  sortOpsAlerts,
  type OpsAlert,
  type OpsAlertKind,
  type OpsAlertsResult,
} from "@/lib/ops-alerts";

/**
 * TODAY-ALERTS-01 — cảnh báo điều hành cho Admin/CMO trên CEN Today.
 * Chạy bằng phiên người gọi (RLS giữ nguyên); chỉ đọc dữ liệu nghiệp vụ sẵn có.
 * Không thay đổi Business Rule của Task/Project/Báo cáo.
 */
type Client = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;

function mk(
  kind: OpsAlertKind,
  parts: Omit<OpsAlert, "kind" | "severity">,
): OpsAlert {
  return { kind, severity: OPS_ALERT_SEVERITY[kind], ...parts };
}

export async function buildOpsAlerts(
  supabase: Client,
  bounds: { startISO: string; endISO: string },
): Promise<OpsAlertsResult> {
  const now = new Date();
  const nowISO = now.toISOString();
  const failedSources: string[] = [];
  const alerts: OpsAlert[] = [];

  async function source(name: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      console.error(`[ops-alerts] ${name}`, error);
      failedSources.push(name);
    }
  }
  function check(error: { message: string } | null) {
    if (error) throw new Error(error.message);
  }

  // ---- Đối tượng đánh giá: Leader/Member đang hoạt động, có Team chính ----
  const privilegedIds = new Set<string>();
  await source("user_roles", async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["admin", "cmo"])
      .limit(1000);
    check(error);
    for (const row of data ?? []) privilegedIds.add(row.user_id);
  });

  const nameById = new Map<string, string>();
  const teamOfUser = new Map<string, string>();
  await source("profiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,display_name,primary_team_id,status")
      .eq("status", "active")
      .not("primary_team_id", "is", null)
      .limit(1000);
    check(error);
    for (const row of data ?? []) {
      if (privilegedIds.has(row.id)) continue;
      nameById.set(row.id, row.display_name);
      if (row.primary_team_id) teamOfUser.set(row.id, row.primary_team_id);
    }
  });

  const teamNames = new Map<string, string>();
  await source("teams", async () => {
    const { data, error } = await supabase.from("teams").select("id,name").limit(200);
    check(error);
    for (const row of data ?? []) teamNames.set(row.id, row.name);
  });

  type TaskRow = {
    id: string;
    name: string;
    assignee_id: string;
    project_id: string | null;
    status: Database["public"]["Enums"]["task_status"];
    approval_status: Database["public"]["Enums"]["task_approval_status"];
    deadline: string;
    updated_at: string;
  };
  let openTasks: TaskRow[] = [];
  await source("tasks", async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,name,assignee_id,project_id,status,approval_status,deadline,updated_at")
      .eq("is_archived", false)
      .is("deleted_at", null)
      .in("approval_status", ["approved", "changes_requested"])
      .neq("status", "done")
      .limit(5000);
    check(error);
    openTasks = ((data ?? []) as TaskRow[]).filter((task) => nameById.has(task.assignee_id));
  });

  const openByPerson = new Map<string, TaskRow[]>();
  for (const task of openTasks) {
    const list = openByPerson.get(task.assignee_id) ?? [];
    list.push(task);
    openByPerson.set(task.assignee_id, list);
  }

  // 1) Nhân sự có nhiều công việc quá hạn (theo bộ lọc thời gian của deadline).
  for (const [personId, list] of openByPerson) {
    const overdue = list.filter(
      (task) =>
        task.deadline < nowISO && task.deadline >= bounds.startISO && task.deadline < bounds.endISO,
    );
    if (overdue.length < OVERDUE_MIN) continue;
    const oldest = overdue.map((t) => t.deadline).sort()[0] ?? null;
    alerts.push(
      mk("person_overdue", {
        id: `overdue-${personId}`,
        subject: nameById.get(personId) ?? "Không rõ",
        detail: `có ${overdue.length} công việc quá hạn.`,
        magnitude: overdue.length,
        current: false,
        since: oldest,
        to: "/tasks",
      }),
    );
  }

  // 2) Nhân sự có khối lượng công việc quá cao (trạng thái hiện tại).
  const membersOfTeam = new Map<string, string[]>();
  for (const [personId, teamId] of teamOfUser) {
    const list = membersOfTeam.get(teamId) ?? [];
    list.push(personId);
    membersOfTeam.set(teamId, list);
  }
  for (const [teamId, members] of membersOfTeam) {
    const counts = members.map((id) => (openByPerson.get(id) ?? []).length);
    const avg = counts.reduce((sum, n) => sum + n, 0) / Math.max(1, counts.length);
    const useAverage = members.length >= TEAM_MIN_SIZE_FOR_AVG;
    members.forEach((personId, index) => {
      const open = counts[index] ?? 0;
      if (open < OVERLOAD_MIN_OPEN) return;
      if (useAverage && !(avg > 0 && open >= avg * OVERLOAD_RATIO)) return;
      const percent = avg > 0 ? Math.round((open / avg - 1) * 100) : 0;
      alerts.push(
        mk("person_overload", {
          id: `overload-${personId}`,
          subject: nameById.get(personId) ?? "Không rõ",
          detail: useAverage
            ? `có ${open} công việc đang mở, cao hơn ${percent}% mức trung bình của Team ${teamNames.get(teamId) ?? ""}`.trim() +
              "."
            : `có ${open} công việc đang mở.`,
          magnitude: open,
          current: true,
          since: null,
          to: "/tasks",
        }),
      );
    });

    // 3) Team phân bổ công việc mất cân đối (trạng thái hiện tại).
    if (counts.length >= 2) {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      if (max >= IMBALANCE_HIGH && min <= IMBALANCE_LOW && max - min >= IMBALANCE_GAP) {
        alerts.push(
          mk("team_imbalance", {
            id: `imbalance-${teamId}`,
            subject: `Team ${teamNames.get(teamId) ?? "không rõ"}`,
            detail: `đang phân bổ công việc chưa cân đối: cao nhất ${max} việc, thấp nhất ${min} việc.`,
            magnitude: max - min,
            current: true,
            since: null,
            to: "/performance",
          }),
        );
      }
    }
  }

  // 4) Công việc bị yêu cầu sửa nhiều lần (theo bộ lọc thời gian của lần yêu cầu).
  await source("task_rework", async () => {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("entity_id,before_data,after_data,created_at")
      .eq("entity_type", "task")
      .gte("created_at", bounds.startISO)
      .lt("created_at", bounds.endISO)
      .limit(5000);
    check(error);
    const countByTask = new Map<string, number>();
    const firstAt = new Map<string, string>();
    for (const row of data ?? []) {
      if (!row.entity_id) continue;
      const before = row.before_data as { status?: string; approval_status?: string } | null;
      const after = row.after_data as { status?: string; approval_status?: string } | null;
      const backFromReview =
        before?.status === "review" && after?.status && after.status !== "review" && after.status !== "done";
      const changesRequested =
        after?.approval_status === "changes_requested" &&
        before?.approval_status !== "changes_requested";
      if (!backFromReview && !changesRequested) continue;
      countByTask.set(row.entity_id, (countByTask.get(row.entity_id) ?? 0) + 1);
      if (!firstAt.has(row.entity_id)) firstAt.set(row.entity_id, row.created_at);
    }
    const hot = [...countByTask.entries()].filter(([, count]) => count >= REWORK_MIN);
    if (hot.length === 0) return;
    const { data: taskRows, error: taskError } = await supabase
      .from("tasks")
      .select("id,name")
      .in(
        "id",
        hot.map(([id]) => id),
      )
      .is("deleted_at", null)
      .limit(200);
    check(taskError);
    for (const task of taskRows ?? []) {
      const count = countByTask.get(task.id) ?? 0;
      alerts.push(
        mk("task_rework", {
          id: `rework-${task.id}`,
          subject: `“${task.name}”`,
          detail: `đã bị yêu cầu sửa ${count} lần.`,
          magnitude: count,
          current: false,
          since: firstAt.get(task.id) ?? null,
          to: "/tasks/$taskId",
          params: { taskId: task.id },
        }),
      );
    }
  });

  // 5) Dự án lâu không có cập nhật (trạng thái hiện tại).
  await source("project_stale", async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,status,updated_at")
      .is("deleted_at", null)
      .in("status", ["approved", "in_progress"])
      .limit(300);
    check(error);
    const projects = data ?? [];
    if (projects.length === 0) return;
    const lastActivity = new Map<string, string>();
    for (const project of projects) lastActivity.set(project.id, project.updated_at);

    const { data: taskRows, error: taskError } = await supabase
      .from("tasks")
      .select("project_id,updated_at")
      .in(
        "project_id",
        projects.map((p) => p.id),
      )
      .is("deleted_at", null)
      .limit(5000);
    check(taskError);
    for (const row of taskRows ?? []) {
      if (!row.project_id) continue;
      const current = lastActivity.get(row.project_id);
      if (!current || row.updated_at > current) lastActivity.set(row.project_id, row.updated_at);
    }

    for (const project of projects) {
      const last = lastActivity.get(project.id);
      if (!last) continue;
      const days = Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS);
      if (days < PROJECT_STALE_DAYS) continue;
      alerts.push(
        mk("project_stale", {
          id: `stale-${project.id}`,
          subject: `Dự án ${project.name}`,
          detail: `chưa có cập nhật trong ${days} ngày.`,
          magnitude: days,
          current: true,
          since: last,
          to: "/projects/$projectId",
          params: { projectId: project.id },
        }),
      );
    }
  });

  // 6) Nhân sự không có công việc đang mở (trạng thái hiện tại).
  for (const [personId, name] of nameById) {
    if ((openByPerson.get(personId) ?? []).length > 0) continue;
    alerts.push(
      mk("person_idle", {
        id: `idle-${personId}`,
        subject: name,
        detail: "hiện không có công việc đang mở.",
        magnitude: 0,
        current: true,
        since: null,
        to: "/tasks",
      }),
    );
  }

  return { alerts: sortOpsAlerts(alerts), failedSources, generated_at: nowISO };
}
