import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { isSystemAdminRole, type AppRoleKey } from "@/lib/permissions";
import {
  addDays,
  monthStart,
  previousPeriod,
  ratio,
  toPeriod,
  weekStart,
  type PerfPeriod,
} from "@/lib/performance";
import {
  DASH_HINT,
  deltaLabel,
  formatRate,
  type DashAttentionItem,
  type DashKpi,
  type DashMemberRow,
  type DashOpsAlert,
  type DashProjectRow,
  type DashQuality,
  type DashReportStatus,
  type DashScope,
  type DashTeamAverage,
  type DashTeamRow,
  type DashTrendPoint,
  type DashWorkloadSlice,
  type DashboardData,
} from "@/lib/dashboard";
import { OVERLOAD_MIN_OPEN, OVERLOAD_RATIO, TEAM_MIN_SIZE_FOR_AVG } from "@/lib/ops-alerts";

/**
 * DASH-CORE-01 — data layer duy nhất của Dashboard hiệu suất.
 *
 * Chạy bằng phiên người gọi nên RLS là ranh giới cuối cùng; phần lọc theo vai trò ở đây
 * thu hẹp thêm phạm vi và không bao giờ trả dữ liệu đồng nghiệp cho Member.
 * Chỉ đọc; không thay đổi Business Rule của Task, Project hay báo cáo.
 */
type Client = SupabaseClient<Database>;

export interface DashboardInput {
  from: string;
  to: string;
  teamId?: string | null;
}

const OPEN_STATUSES = new Set(["not_started", "in_progress", "review"]);
const PROJECT_STALE_DAYS = 7;
const DAY_MS = 86_400_000;

type TaskRow = {
  id: string;
  name: string;
  project_id: string | null;
  assignee_id: string;
  team_id: string | null;
  status: Database["public"]["Enums"]["task_status"];
  approval_status: Database["public"]["Enums"]["task_approval_status"];
  deadline: string;
  created_at: string;
  completed_at: string | null;
  manually_archived_at: string | null;
};

const TASK_COLUMNS =
  "id,name,project_id,assignee_id,team_id,status,approval_status,deadline,created_at,completed_at,manually_archived_at";

/** Mục A — Task hợp lệ cho mọi công thức. */
function isValidTask(task: TaskRow): boolean {
  if (task.approval_status === "pending" || task.approval_status === "withdrawn") return false;
  if (task.manually_archived_at !== null && task.status !== "done") return false;
  return true;
}

const isOpen = (task: TaskRow) => OPEN_STATUSES.has(task.status);
const inRange = (iso: string | null, p: PerfPeriod) =>
  iso !== null && iso >= p.startISO && iso < p.endISO;

interface CoreMetrics {
  due_total: number;
  completed_in_period: number;
  completion_rate: number | null;
  done_with_completion: number;
  on_time: number;
  on_time_rate: number | null;
  violated: number;
  overdue_now: number;
  open_tasks: number;
}

function coreMetrics(tasks: TaskRow[], period: PerfPeriod, nowISO: string): CoreMetrics {
  let dueTotal = 0;
  let completedInPeriod = 0;
  let doneWithCompletion = 0;
  let onTime = 0;
  let violated = 0;
  let overdueNow = 0;
  let open = 0;

  for (const task of tasks) {
    const dueInPeriod = task.deadline >= period.startISO && task.deadline < period.endISO;
    const done = task.status === "done";

    // B — tỷ lệ hoàn thành theo deadline trong kỳ.
    if (dueInPeriod) {
      dueTotal += 1;
      if (done && task.completed_at !== null && task.completed_at < period.endISO) {
        completedInPeriod += 1;
      }
      // E — vi phạm deadline trong kỳ.
      if (done && task.completed_at !== null && task.completed_at > task.deadline) violated += 1;
      else if (!done && task.deadline < nowISO) violated += 1;
    }

    // C — tỷ lệ đúng hạn theo thời điểm hoàn thành trong kỳ.
    if (done && inRange(task.completed_at, period)) {
      doneWithCompletion += 1;
      if (task.completed_at !== null && task.completed_at <= task.deadline) onTime += 1;
    }

    // D — đang quá hạn (trạng thái hiện tại, không giới hạn theo kỳ).
    if (!done && task.deadline < nowISO) overdueNow += 1;
    // F — Task đang mở.
    if (isOpen(task)) open += 1;
  }

  return {
    due_total: dueTotal,
    completed_in_period: completedInPeriod,
    completion_rate: ratio(completedInPeriod, dueTotal),
    done_with_completion: doneWithCompletion,
    on_time: onTime,
    on_time_rate: ratio(onTime, doneWithCompletion),
    violated,
    overdue_now: overdueNow,
    open_tasks: open,
  };
}

/** Các mốc bucket cho khối xu hướng: 8 tuần, 6 tháng hoặc theo ngày. */
function trendBuckets(
  period: PerfPeriod,
): { granularity: "day" | "week" | "month"; buckets: Array<{ key: string; label: string; period: PerfPeriod }> } {
  const buckets: Array<{ key: string; label: string; period: PerfPeriod }> = [];
  // Kỳ "Tuần"/"Tháng" thường là kỳ đang chạy (chưa đủ 7 ngày hoặc chưa hết tháng),
  // nên nhận diện theo mốc bắt đầu thay vì theo số ngày.
  const isWeek = weekStart(period.from) === period.from && period.days <= 7;
  const isMonth =
    !isWeek &&
    period.from === monthStart(period.from) &&
    period.to.slice(0, 7) === period.from.slice(0, 7);

  if (isWeek) {
    for (let i = 7; i >= 0; i -= 1) {
      const start = addDays(period.from, -7 * i);
      const end = addDays(start, 6);
      // Mốc cuối là kỳ đang chạy: cắt theo ngày kết thúc thực tế của bộ lọc.
      const p = toPeriod({ from: start, to: end > period.to ? period.to : end });
      buckets.push({ key: start, label: `T${start.slice(8, 10)}/${start.slice(5, 7)}`, period: p });
    }
    return { granularity: "week", buckets };
  }

  if (isMonth) {
    const baseYear = Number(period.from.slice(0, 4));
    const baseMonth = Number(period.from.slice(5, 7));
    for (let i = 5; i >= 0; i -= 1) {
      // Số học theo chuỗi ngày giờ Hà Nội để không lệch múi giờ ở ngày mùng 1.
      const index = baseYear * 12 + (baseMonth - 1) - i;
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextIndex = index + 1;
      const nextFrom = `${Math.floor(nextIndex / 12)}-${String((nextIndex % 12) + 1).padStart(2, "0")}-01`;
      const monthEnd = addDays(nextFrom, -1);
      const to = monthEnd > period.to ? period.to : monthEnd;
      buckets.push({ key: from, label: from.slice(0, 7), period: toPeriod({ from, to }) });
    }
    return { granularity: "month", buckets };
  }

  // Hôm nay: 7 ngày gần nhất. Khoảng ngày tùy chọn: từng ngày (tối đa 31 mốc).
  const span = period.days === 1 ? 7 : Math.min(period.days, 31);
  const last = period.days === 1 ? period.from : period.to;
  for (let i = span - 1; i >= 0; i -= 1) {
    const day = addDays(last, -i);
    buckets.push({
      key: day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      period: toPeriod({ from: day, to: day }),
    });
  }
  return { granularity: "day", buckets };
}

export async function buildDashboard(
  supabase: Client,
  viewerId: string,
  role: AppRoleKey | null,
  input: DashboardInput,
): Promise<DashboardData> {
  const period = toPeriod({ from: input.from, to: input.to });
  const previous = previousPeriod(period);
  const nowISO = new Date().toISOString();
  const unavailable: string[] = [];

  async function source<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      console.error(`[dashboard] ${name}`, error);
      if (!unavailable.includes(name)) unavailable.push(name);
      return fallback;
    }
  }

  const privileged = isSystemAdminRole(role);

  const teams = await source<Array<{ id: string; name: string; leader_id: string | null }>>(
    "teams",
    async () => {
      const { data, error } = await supabase.from("teams").select("id,name,leader_id").limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    [],
  );
  const leaderTeamIds = teams.filter((t) => t.leader_id === viewerId).map((t) => t.id);

  let scope: DashScope = "member";
  if (privileged) scope = "org";
  else if (role === "leader" && leaderTeamIds.length > 0) scope = "team";

  const selectedTeamId =
    scope === "org" && input.teamId && teams.some((t) => t.id === input.teamId)
      ? input.teamId
      : scope === "team"
        ? (leaderTeamIds[0] ?? null)
        : null;

  const { buckets, granularity } = trendBuckets(period);
  const trendStart = buckets[0]?.period.from ?? period.from;
  const windowStartISO = toPeriod({ from: trendStart, to: period.to }).startISO;
  // Mốc sớm nhất cần nạp dữ liệu: bao gồm cả kỳ trước để so sánh không bị thiếu Task.
  const metricsStartISO =
    previous.startISO < windowStartISO ? previous.startISO : windowStartISO;

  /* --------------------------- Tải Task theo phạm vi --------------------------- */
  function scopedTaskQuery() {
    // Lớp dữ liệu tự triển khai không biên dịch được `not.in.(a,b)` dạng chuỗi:
    // dùng hai điều kiện <> tương đương, giữ nguyên ngữ nghĩa loại pending/withdrawn.
    let q = supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .is("deleted_at", null)
      .neq("approval_status", "pending")
      .neq("approval_status", "withdrawn");
    if (scope === "member") q = q.eq("assignee_id", viewerId);
    else if (selectedTeamId) q = q.eq("team_id", selectedTeamId);
    return q;
  }

  const windowTasks = await source<TaskRow[]>(
    "tasks_window",
    async () => {
      const { data, error } = await scopedTaskQuery()
        .gte("deadline", windowStartISO)
        .lt("deadline", period.endISO)
        .limit(8000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as TaskRow[]).filter(isValidTask);
    },
    [],
  );

  const openTasks = await source<TaskRow[]>(
    "tasks_open",
    async () => {
      const { data, error } = await scopedTaskQuery().neq("status", "done").limit(8000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as TaskRow[]).filter(isValidTask);
    },
    [],
  );

  const previousTasks = await source<TaskRow[]>(
    "tasks_previous",
    async () => {
      if (previous.startISO >= windowStartISO) return [];
      const { data, error } = await scopedTaskQuery()
        .gte("deadline", previous.startISO)
        .lt("deadline", windowStartISO)
        .limit(8000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as TaskRow[]).filter(isValidTask);
    },
    [],
  );

  // Task hoàn thành trong cửa sổ nhưng có deadline nằm ngoài cửa sổ: cần cho tỷ lệ đúng hạn.
  const completedTasks = await source<TaskRow[]>(
    "tasks_completed",
    async () => {
      const { data, error } = await scopedTaskQuery()
        .eq("status", "done")
        .gte("completed_at", metricsStartISO)
        .lt("completed_at", period.endISO)
        .limit(8000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as TaskRow[]).filter(isValidTask);
    },
    [],
  );

  const taskById = new Map<string, TaskRow>();
  for (const list of [windowTasks, openTasks, previousTasks, completedTasks]) {
    for (const task of list) taskById.set(task.id, task);
  }
  const allTasks = [...taskById.values()];

  const current = coreMetrics(allTasks, period, nowISO);
  const prior = coreMetrics(allTasks, previous, nowISO);

  const trend: DashTrendPoint[] = buckets.map((bucket) => {
    const m = coreMetrics(allTasks, bucket.period, nowISO);
    return {
      key: bucket.key,
      label: bucket.label,
      completion_rate: m.completion_rate,
      on_time_rate: m.on_time_rate,
      done: m.completed_in_period,
      violated: m.violated,
    };
  });

  /* ------------------------------ Danh bạ nhân sự ------------------------------ */
  type ProfileRow = { id: string; display_name: string; primary_team_id: string | null };
  const profiles =
    scope === "member"
      ? []
      : await source<ProfileRow[]>(
          "profiles",
          async () => {
            let q = supabase
              .from("profiles")
              .select("id,display_name,primary_team_id")
              .eq("status", "active")
              .is("locked_at", null)
              .limit(1000);
            if (selectedTeamId) q = q.eq("primary_team_id", selectedTeamId);
            const { data, error } = await q;
            if (error) throw new Error(error.message);
            return (data ?? []) as ProfileRow[];
          },
          [],
        );
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  /* ------------------------- Lịch sử phê duyệt (mục G/H) ------------------------- */
  const quality = await source<DashQuality | null>(
    "task_review_stats",
    async () => {
      const { data, error } = await supabase.rpc("dashboard_task_review_stats", {
        p_from: period.from,
        p_to: period.to,
        ...(scope === "member" ? { p_user: viewerId } : {}),
        ...(scope === "org" && selectedTeamId ? { p_team: selectedTeamId } : {}),
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as
        | {
            status: string;
            changes_requested_count: number;
            first_pass_tasks: number;
            evaluated_tasks: number;
          }
        | undefined;
      if (!row) return null;
      return {
        status: row.status === "ok" ? "ok" : "historical_data_incomplete",
        changes_requested: row.changes_requested_count ?? 0,
        first_pass_tasks: row.first_pass_tasks ?? 0,
        evaluated_tasks: row.evaluated_tasks ?? 0,
        first_pass_rate: ratio(row.first_pass_tasks ?? 0, row.evaluated_tasks ?? 0),
      };
    },
    null,
  );

  /** Yêu cầu sửa theo Task, dùng cho bảng Team và bảng thành viên. */
  const changesByTask = await source<Map<string, number>>(
    "task_approval_events",
    async () => {
      const { data, error } = await supabase
        .from("task_approval_events")
        .select("task_id")
        .eq("event_type", "changes_requested")
        .gte("created_at", period.startISO)
        .lt("created_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      const map = new Map<string, number>();
      for (const row of data ?? []) map.set(row.task_id, (map.get(row.task_id) ?? 0) + 1);
      return map;
    },
    new Map<string, number>(),
  );

  /* --------------------------------- Báo cáo --------------------------------- */
  let reports: DashReportStatus | null = null;
  const lateReportByUser = new Map<string, number>();
  if (scope !== "member") {
    reports = await source<DashReportStatus | null>(
      "report_obligations",
      async () => {
        let q = supabase
          .from("report_obligations")
          .select("user_id,team_id,due_at,is_exempt,first_submitted_at,is_late,report:reports(status)")
          .gte("due_at", period.startISO)
          .lt("due_at", period.endISO)
          .limit(5000);
        if (selectedTeamId) q = q.eq("team_id", selectedTeamId);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const result: DashReportStatus = {
          required: 0,
          submitted: 0,
          on_time: 0,
          late_or_missing: 0,
          missing: 0,
          pending_review: 0,
        };
        for (const row of data ?? []) {
          if (row.is_exempt) continue;
          result.required += 1;
          if (row.first_submitted_at) {
            result.submitted += 1;
            if (row.is_late) {
              result.late_or_missing += 1;
              lateReportByUser.set(row.user_id, (lateReportByUser.get(row.user_id) ?? 0) + 1);
            } else result.on_time += 1;
            const linked = row.report as unknown as { status: string } | null;
            if (linked && linked.status === "submitted") result.pending_review += 1;
          } else if (row.due_at < nowISO) {
            result.late_or_missing += 1;
            result.missing += 1;
            lateReportByUser.set(row.user_id, (lateReportByUser.get(row.user_id) ?? 0) + 1);
          }
        }
        return result;
      },
      null,
    );
  }

  /* --------------------------- Trung bình Team (Member) --------------------------- */
  let teamAverage: DashTeamAverage | null = null;
  if (scope === "member") {
    teamAverage = await source<DashTeamAverage | null>(
      "member_team_average",
      async () => {
        const { data, error } = await supabase.rpc("dashboard_member_team_average", {
          p_from: period.from,
          p_to: period.to,
        });
        if (error) throw new Error(error.message);
        const row = (Array.isArray(data) ? data[0] : data) as
          | {
              status: string;
              team_size: number;
              completion_rate: number | null;
              ontime_rate: number | null;
              completed_tasks: number | null;
              open_tasks: number | null;
            }
          | undefined;
        if (!row) return null;
        const status =
          row.status === "ok"
            ? "ok"
            : row.status === "no_team"
              ? "no_team"
              : "insufficient_team_size";
        return {
          status,
          team_size: row.team_size ?? 0,
          completion_rate: row.completion_rate === null ? null : Number(row.completion_rate) / 100,
          on_time_rate: row.ontime_rate === null ? null : Number(row.ontime_rate) / 100,
          completed_tasks: row.completed_tasks,
          open_tasks: row.open_tasks,
        } satisfies DashTeamAverage;
      },
      null,
    );
  }

  /* ------------------------------ Cảnh báo điều hành ------------------------------ */
  let opsAlerts: DashOpsAlert[] | null = null;
  let attentionTeamIds = new Set<string>();
  if (scope === "org") {
    const result = await source(
      "ops_alerts",
      async () => {
        const { buildOpsAlerts } = await import("@/lib/ops-alerts.server");
        return buildOpsAlerts(supabase, { startISO: period.startISO, endISO: period.endISO });
      },
      null,
    );
    if (result) {
      const relevant = result.alerts.filter(
        (a) => a.kind !== "person_idle" && (!selectedTeamId || a.team_id === selectedTeamId),
      );
      attentionTeamIds = new Set(
        relevant.map((a) => a.team_id).filter((id): id is string => Boolean(id)),
      );
      opsAlerts = relevant.slice(0, 8).map((alert) => ({
        id: alert.id,
        subject: alert.subject,
        detail: alert.detail,
        drill: { to: alert.to, ...(alert.params ? { params: alert.params } : {}) },
      }));
    }
  }

  /* --------------------------------- Dự án --------------------------------- */
  let projects: DashProjectRow[] | null = null;
  if (scope !== "member") {
    projects = await source<DashProjectRow[]>(
      "projects",
      async () => {
        let q = supabase
          .from("projects")
          .select("id,name,status,updated_at,responsible_team_id")
          .is("deleted_at", null)
          .neq("status", "completed")
          .neq("status", "archived")
          .neq("status", "rejected")
          .limit(300);
        if (selectedTeamId) q = q.eq("responsible_team_id", selectedTeamId);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const list = data ?? [];
        if (list.length === 0) return [];
        const ids = list.map((p) => p.id);
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("project_id,status,deadline,approval_status,manually_archived_at,updated_at")
          .in("project_id", ids)
          .is("deleted_at", null)
          .neq("approval_status", "pending")
          .neq("approval_status", "withdrawn")
          .limit(8000);
        if (taskError) throw new Error(taskError.message);
        const agg = new Map<
          string,
          { total: number; done: number; overdue: number; last: string | null }
        >();
        for (const row of taskRows ?? []) {
          if (!row.project_id) continue;
          if (row.manually_archived_at !== null && row.status !== "done") continue;
          const bucket = agg.get(row.project_id) ?? { total: 0, done: 0, overdue: 0, last: null };
          bucket.total += 1;
          if (row.status === "done") bucket.done += 1;
          else if (row.deadline < nowISO) bucket.overdue += 1;
          if (!bucket.last || row.updated_at > bucket.last) bucket.last = row.updated_at;
          agg.set(row.project_id, bucket);
        }
        return list
          .map((project) => {
            const bucket = agg.get(project.id) ?? { total: 0, done: 0, overdue: 0, last: null };
            const last =
              bucket.last && bucket.last > project.updated_at ? bucket.last : project.updated_at;
            const staleDays = Math.floor((Date.now() - new Date(last).getTime()) / DAY_MS);
            return {
              id: project.id,
              name: project.name,
              team_name: project.responsible_team_id
                ? (teamNameById.get(project.responsible_team_id) ?? null)
                : null,
              done: bucket.done,
              total: bucket.total,
              progress: ratio(bucket.done, bucket.total),
              overdue_tasks: bucket.overdue,
              stale_days: staleDays >= PROJECT_STALE_DAYS ? staleDays : null,
            } satisfies DashProjectRow;
          })
          .sort(
            (a, b) => b.overdue_tasks - a.overdue_tasks || (b.stale_days ?? 0) - (a.stale_days ?? 0),
          );
      },
      [],
    );
  }

  /* ------------------------------ Bảng so sánh Team ------------------------------ */
  let teamRows: DashTeamRow[] | null = null;
  let workload: DashWorkloadSlice[] | null = null;
  if (scope === "org") {
    const memberCount = new Map<string, number>();
    for (const profile of profiles) {
      if (!profile.primary_team_id) continue;
      memberCount.set(profile.primary_team_id, (memberCount.get(profile.primary_team_id) ?? 0) + 1);
    }
    const visibleTeams = selectedTeamId ? teams.filter((t) => t.id === selectedTeamId) : teams;
    teamRows = visibleTeams.map((team) => {
      const teamTasks = allTasks.filter((t) => t.team_id === team.id);
      const m = coreMetrics(teamTasks, period, nowISO);
      const changes = teamTasks.reduce((sum, t) => sum + (changesByTask.get(t.id) ?? 0), 0);
      const reasons: string[] = [];
      if (attentionTeamIds.has(team.id)) reasons.push("Có cảnh báo điều hành");
      if (m.overdue_now > 0) reasons.push(`${m.overdue_now} Task đang quá hạn`);
      const needsAttention = reasons.length > 0;
      return {
        team_id: team.id,
        team_name: team.name,
        members: memberCount.get(team.id) ?? 0,
        tasks: teamTasks.length,
        open_tasks: m.open_tasks,
        completion_rate: m.completion_rate,
        on_time_rate: m.on_time_rate,
        overdue_rate: ratio(m.overdue_now, m.open_tasks),
        changes_requested: changes,
        needs_attention: needsAttention,
        attention_reasons: reasons,
      } satisfies DashTeamRow;
    });
    // KPI "Team cần chú ý" phải đếm đúng số dòng được đánh dấu trong bảng so sánh.
    attentionTeamIds = new Set(teamRows.filter((row) => row.needs_attention).map((r) => r.team_id));
    const totalOpen = teamRows.reduce((sum, row) => sum + row.open_tasks, 0);
    workload = teamRows.map((row) => ({
      team_id: row.team_id,
      team_name: row.team_name,
      open_tasks: row.open_tasks,
      share: ratio(row.open_tasks, totalOpen),
    }));
  }

  /* --------------------------- Bảng thành viên (Leader) --------------------------- */
  let memberRows: DashMemberRow[] | null = null;
  let overloaded = 0;
  if (scope === "team") {
    const openByPerson = new Map<string, TaskRow[]>();
    for (const task of allTasks) {
      if (!isOpen(task)) continue;
      const list = openByPerson.get(task.assignee_id) ?? [];
      list.push(task);
      openByPerson.set(task.assignee_id, list);
    }
    const teamProfiles = profiles.filter((p) => p.primary_team_id === selectedTeamId);
    const counts = teamProfiles.map((p) => (openByPerson.get(p.id) ?? []).length);
    const avg = counts.length > 0 ? counts.reduce((s, n) => s + n, 0) / counts.length : 0;
    const useAverage = teamProfiles.length >= TEAM_MIN_SIZE_FOR_AVG;

    memberRows = teamProfiles.map((profile) => {
      const own = allTasks.filter((t) => t.assignee_id === profile.id);
      const m = coreMetrics(own, period, nowISO);
      const open = (openByPerson.get(profile.id) ?? []).length;
      const over =
        open >= OVERLOAD_MIN_OPEN && (!useAverage || (avg > 0 && open >= avg * OVERLOAD_RATIO));
      if (over) overloaded += 1;
      return {
        user_id: profile.id,
        display_name: profile.display_name,
        open_tasks: open,
        overdue: m.overdue_now,
        on_time_rate: m.on_time_rate,
        changes_requested: own.reduce((sum, t) => sum + (changesByTask.get(t.id) ?? 0), 0),
        late_reports: lateReportByUser.get(profile.id) ?? 0,
        load: over ? "over" : useAverage && avg > 0 && open < avg * 0.5 ? "under" : "balanced",
      } satisfies DashMemberRow;
    });
    memberRows.sort((a, b) => b.open_tasks - a.open_tasks);
  }

  /* ---------------------------- Nội dung cần chú ý ---------------------------- */
  const attentionSource = [...taskById.values()].filter(
    (task) =>
      isOpen(task) &&
      (task.deadline < nowISO ||
        (task.deadline >= period.startISO && task.deadline < period.endISO) ||
        task.status === "review" ||
        (changesByTask.get(task.id) ?? 0) > 0),
  );
  const attention: DashAttentionItem[] = attentionSource
    .map((task) => {
      const changes = changesByTask.get(task.id) ?? 0;
      const overdue = task.deadline < nowISO;
      const kind: DashAttentionItem["kind"] = overdue
        ? "overdue"
        : changes > 0
          ? "changes_requested"
          : task.status === "review"
            ? "review"
            : "due";
      const who = scope === "member" ? "" : `${nameById.get(task.assignee_id) ?? "Không rõ"} · `;
      const meta =
        kind === "overdue"
          ? `${who}Quá hạn từ ${task.deadline.slice(0, 10)}`
          : kind === "changes_requested"
            ? `${who}Bị yêu cầu sửa ${changes} lần`
            : kind === "review"
              ? `${who}Đang chờ kiểm tra`
              : `${who}Đến hạn ${task.deadline.slice(0, 10)}`;
      return {
        id: task.id,
        title: task.name,
        meta,
        kind,
        tone: kind === "overdue" ? "danger" : kind === "changes_requested" ? "warning" : "default",
        drill: { to: "/tasks/$taskId", params: { taskId: task.id } },
      } satisfies DashAttentionItem;
    })
    .sort((a, b) => {
      const order = { overdue: 0, changes_requested: 1, review: 2, due: 3 };
      return order[a.kind] - order[b.kind];
    })
    .slice(0, 12);

  /* ------------------------------- Bộ KPI theo vai trò ------------------------------- */
  const rangeSearch = { from: period.from, to: period.to };
  const teamSearch = selectedTeamId ? { team: selectedTeamId } : {};
  const kpis: DashKpi[] = [];

  if (scope === "org") {
    kpis.push(
      {
        key: "completion",
        label: "Tỷ lệ Task hoàn thành",
        hint: DASH_HINT.completion_rate,
        value: formatRate(current.completion_rate),
        sub: `${current.completed_in_period}/${current.due_total} Task có deadline trong kỳ`,
        compare: deltaLabel(current.completion_rate, prior.completion_rate, "rate"),
        drill: { to: "/tasks", search: { ...rangeSearch, ...teamSearch } },
      },
      {
        key: "on_time",
        label: "Tỷ lệ Task đúng hạn",
        hint: DASH_HINT.on_time_rate,
        value: formatRate(current.on_time_rate),
        sub: `${current.on_time}/${current.done_with_completion} Task hoàn thành trong kỳ`,
        compare: deltaLabel(current.on_time_rate, prior.on_time_rate, "rate"),
        drill: { to: "/tasks", search: { ...rangeSearch, ...teamSearch, status: "done" } },
      },
      {
        key: "overdue",
        label: "Task quá hạn",
        hint: DASH_HINT.overdue_now,
        value: String(current.overdue_now),
        sub: `Vi phạm deadline trong kỳ: ${current.violated}`,
        tone: current.overdue_now > 0 ? "danger" : "default",
        drill: { to: "/tasks", search: { ...teamSearch, kind: "overdue" } },
      },
      {
        key: "teams_attention",
        label: "Team cần chú ý",
        hint: DASH_HINT.teams_attention,
        value: String(attentionTeamIds.size),
        sub: `${teams.length} Team trong hệ thống`,
        tone: attentionTeamIds.size > 0 ? "warning" : "default",
        drill: { to: "/organization" },
      },
    );
  } else if (scope === "team") {
    const dueInRange = allTasks.filter(
      (t) => t.deadline >= period.startISO && t.deadline < period.endISO,
    ).length;
    const reviewCount = allTasks.filter((t) => t.status === "review").length;
    kpis.push(
      {
        key: "due",
        label: "Task đến hạn trong kỳ",
        hint: DASH_HINT.due_in_range,
        value: String(dueInRange),
        sub: `Đang quá hạn: ${current.overdue_now}`,
        compare: deltaLabel(dueInRange, prior.due_total, "count"),
        drill: { to: "/tasks", search: { ...rangeSearch, ...teamSearch } },
      },
      {
        key: "review",
        label: "Task cần duyệt",
        hint: DASH_HINT.awaiting_review,
        value: String(reviewCount),
        tone: reviewCount > 0 ? "warning" : "default",
        drill: { to: "/tasks", search: { ...teamSearch, status: "review" } },
      },
      {
        key: "overload",
        label: "Nhân sự quá tải",
        hint: DASH_HINT.overload,
        value: String(overloaded),
        sub: `${memberRows?.length ?? 0} thành viên đang hoạt động`,
        tone: overloaded > 0 ? "warning" : "default",
        drill: { to: "/members", search: { ...teamSearch } },
      },
      {
        key: "reports",
        label: "Báo cáo chưa nộp",
        hint: DASH_HINT.reports_missing,
        value: String(reports?.missing ?? 0),
        sub: reports
          ? `${reports.submitted}/${reports.required} đã nộp · ${reports.late_or_missing - reports.missing} nộp muộn`
          : "Không đọc được dữ liệu",
        tone: (reports?.missing ?? 0) > 0 ? "warning" : "default",
        drill: { to: "/reports", search: { ...rangeSearch, ...teamSearch } },
      },
    );
  } else {
    kpis.push(
      {
        key: "on_time",
        label: "Task đúng hạn",
        hint: DASH_HINT.member_on_time,
        value: String(current.on_time),
        sub: `${formatRate(current.on_time_rate)} trong ${current.done_with_completion} Task hoàn thành`,
        compare: deltaLabel(current.on_time_rate, prior.on_time_rate, "rate"),
        tone: "success",
        drill: { to: "/tasks", search: { ...rangeSearch, mine: "1", status: "done" } },
      },
      {
        key: "overdue",
        label: "Task quá hạn",
        hint: DASH_HINT.overdue_now,
        value: String(current.overdue_now),
        sub: `Vi phạm deadline trong kỳ: ${current.violated}`,
        tone: current.overdue_now > 0 ? "danger" : "default",
        drill: { to: "/tasks", search: { mine: "1", kind: "overdue" } },
      },
      {
        key: "review",
        label: "Task chờ kiểm tra",
        hint: DASH_HINT.member_review,
        value: String(allTasks.filter((t) => t.status === "review").length),
        drill: { to: "/tasks", search: { mine: "1", status: "review" } },
      },
      {
        key: "changes",
        label: "Task được yêu cầu sửa",
        hint: DASH_HINT.changes_requested,
        value: String(quality?.changes_requested ?? 0),
        sub:
          quality?.status === "historical_data_incomplete"
            ? "Kỳ này có phần dữ liệu lịch sử chưa đầy đủ"
            : null,
        tone: (quality?.changes_requested ?? 0) > 0 ? "warning" : "default",
        drill: { to: "/tasks", search: { mine: "1", ...rangeSearch } },
      },
    );
  }

  const personal =
    scope === "member"
      ? {
          completion_rate: current.completion_rate,
          on_time_rate: current.on_time_rate,
          completed_tasks: current.completed_in_period,
          open_tasks: current.open_tasks,
          overdue: current.overdue_now,
          review: allTasks.filter((t) => t.status === "review").length,
        }
      : null;

  return {
    scope,
    role,
    viewer_id: viewerId,
    period,
    previous,
    granularity,
    teams: scope === "org" ? teams.map((t) => ({ id: t.id, name: t.name })) : [],
    selected_team_id: selectedTeamId,
    kpis,
    trend,
    attention,
    team_rows: teamRows,
    member_rows: memberRows,
    projects,
    workload,
    reports,
    quality,
    personal,
    team_average: teamAverage,
    ops_alerts: opsAlerts,
    unavailable,
    generated_at: nowISO,
  };
}
