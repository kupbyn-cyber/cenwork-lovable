import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { isSystemAdminRole, type AppRoleKey } from "@/lib/permissions";
import {
  RECOGNITION_CATEGORY_LABEL,
  addDays,
  previousPeriod,
  ratio,
  toPeriod,
  type EfficiencyMetrics,
  type PerfAlert,
  type PerfPeriod,
  type PerfScope,
  type PerfTotals,
  type PerformanceDashboard,
  type PersonPerformance,
  type QualityMetrics,
  type ReportMetrics,
  type TeamPerformance,
  type TrendPoint,
  type WorkloadMetrics,
} from "@/lib/performance";

/**
 * PERFORMANCE — tổng hợp Dashboard hiệu suất từ dữ liệu nguồn.
 *
 * Chạy bằng phiên người gọi nên RLS vẫn là ranh giới cuối cùng; phần lọc theo vai trò
 * ở đây thu hẹp thêm phạm vi và ẩn dữ liệu nhạy cảm trước khi trả về client.
 * Không ghi dữ liệu, không đổi Business Rule của Task/Report.
 */
type Client = SupabaseClient<Database>;

export interface PerformanceInput {
  from: string;
  to: string;
  teamId?: string | null;
  userId?: string | null;
}

const HANOI_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const hanoiDay = (iso: string) => HANOI_FORMATTER.format(new Date(iso));

type TaskRow = {
  id: string;
  project_id: string | null;
  assignee_id: string;
  team_id: string | null;
  status: Database["public"]["Enums"]["task_status"];
  deadline: string;
  created_at: string;
  completed_at: string | null;
};

function emptyWorkload(): WorkloadMetrics {
  return {
    primary: 0,
    collaborating: 0,
    not_started: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    overdue: 0,
    late_done: 0,
    carried_over: 0,
    projects: 0,
  };
}

function emptyReports(): ReportMetrics {
  return {
    required: 0,
    submitted: 0,
    on_time: 0,
    late_or_missing: 0,
    revision_required: 0,
    weekly_team: 0,
  };
}

function efficiencyOf(workload: WorkloadMetrics, durations: number[]): EfficiencyMetrics {
  const avg =
    durations.length > 0 ? durations.reduce((sum, v) => sum + v, 0) / durations.length : null;
  return {
    completion_rate: ratio(workload.done, workload.primary),
    on_time_rate: ratio(workload.done - workload.late_done, workload.done),
    overdue_rate: ratio(workload.overdue, workload.primary),
    avg_completion_hours: avg,
  };
}

function mergeWorkload(target: WorkloadMetrics, source: WorkloadMetrics) {
  target.primary += source.primary;
  target.collaborating += source.collaborating;
  target.not_started += source.not_started;
  target.in_progress += source.in_progress;
  target.review += source.review;
  target.done += source.done;
  target.overdue += source.overdue;
  target.late_done += source.late_done;
  target.carried_over += source.carried_over;
}

function mergeReports(target: ReportMetrics, source: ReportMetrics) {
  target.required += source.required;
  target.submitted += source.submitted;
  target.on_time += source.on_time;
  target.late_or_missing += source.late_or_missing;
  target.revision_required += source.revision_required;
}

export async function buildPerformanceDashboard(
  supabase: Client,
  viewerId: string,
  role: AppRoleKey | null,
  input: PerformanceInput,
): Promise<PerformanceDashboard> {
  const period = toPeriod({ from: input.from, to: input.to });
  const previous = previousPeriod(period);
  const nowISO = new Date().toISOString();
  const unavailable: string[] = [];

  const privileged = isSystemAdminRole(role);

  async function source<T>(name: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      console.error(`[performance] ${name}`, error);
      unavailable.push(name);
      return fallback;
    }
  }

  // --- Danh bạ và Team (một truy vấn, không N+1) ---
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, job_title, primary_team_id, status");
  if (profileError) throw new Error(profileError.message);

  const { data: teamRows, error: teamError } = await supabase
    .from("teams")
    .select("id, name, leader_id");
  if (teamError) throw new Error(teamError.message);

  const teams = teamRows ?? [];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const profiles = (profileRows ?? []).filter((p) => p.status !== "resigned" || true);
  const viewerProfile = profiles.find((p) => p.id === viewerId) ?? null;

  // --- Phạm vi Team dựa trên Team chính; Team phối hợp không mở rộng quyền ---
  const leaderTeamIds = teams.filter((t) => t.leader_id === viewerId).map((t) => t.id);
  let scope: PerfScope = "self_team";
  let allowedTeamIds: string[];
  if (privileged) {
    scope = "org";
    allowedTeamIds = teams.map((t) => t.id);
  } else if (role === "leader" && leaderTeamIds.length > 0) {
    scope = "team";
    allowedTeamIds = leaderTeamIds;
  } else {
    scope = "self_team";
    allowedTeamIds = viewerProfile?.primary_team_id ? [viewerProfile.primary_team_id] : [];
  }

  const selectedTeamId =
    input.teamId && allowedTeamIds.includes(input.teamId) ? input.teamId : null;
  const activeTeamIds = selectedTeamId ? [selectedTeamId] : allowedTeamIds;

  let people = profiles.filter(
    (p) => p.primary_team_id !== null && activeTeamIds.includes(p.primary_team_id),
  );
  // Người xem luôn thấy dữ liệu cá nhân đầy đủ kể cả khi chưa có Team chính.
  if (!people.some((p) => p.id === viewerId) && viewerProfile && !selectedTeamId) {
    people = [viewerProfile, ...people];
  }
  if (input.userId && people.some((p) => p.id === input.userId)) {
    people = people.filter((p) => p.id === input.userId);
  }
  const personIds = people.map((p) => p.id);
  const teamOf = new Map(people.map((p) => [p.id, p.primary_team_id]));

  const canSeeSensitive = (personId: string) => {
    if (privileged) return true;
    if (personId === viewerId) return true;
    if (role === "leader") {
      const team = teamOf.get(personId) ?? null;
      return team !== null && leaderTeamIds.includes(team);
    }
    return false;
  };

  if (personIds.length === 0) {
    const totals: PerfTotals = {
      workload: emptyWorkload(),
      efficiency: efficiencyOf(emptyWorkload(), []),
      reports: emptyReports(),
    };
    return {
      scope,
      role,
      viewer_id: viewerId,
      period,
      previous,
      teams: teams
        .filter((t) => allowedTeamIds.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name })),
      people: [],
      team_details: [],
      totals,
      previous_totals: totals,
      trend: [],
      alerts: [],
      unavailable,
    };
  }

  // --- Task (loại Task hủy / lưu trữ ngay từ truy vấn) ---
  const tasks = await source<TaskRow[]>(
    "tasks",
    async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, project_id, assignee_id, team_id, status, deadline, created_at, completed_at")
        .is("deleted_at", null)
        .is("manually_archived_at", null)
        .eq("is_archived", false)
        .in("assignee_id", personIds)
        .lt("created_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as TaskRow[];
    },
    [],
  );

  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // --- Task phối hợp (thống kê riêng, không cộng trùng với phụ trách chính) ---
  const participants = await source<Array<{ task_id: string; user_id: string }>>(
    "task_participants",
    async () => {
      const { data, error } = await supabase
        .from("task_participants")
        .select("task_id, user_id")
        .in("user_id", personIds)
        .limit(5000);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    [],
  );

  /** Task thuộc kỳ khi có phát sinh trong kỳ: tạo, tới hạn hoặc hoàn thành trong kỳ. */
  const inPeriod = (task: TaskRow, p: PerfPeriod) => {
    const created = task.created_at >= p.startISO && task.created_at < p.endISO;
    const due = task.deadline >= p.startISO && task.deadline < p.endISO;
    const done =
      task.completed_at !== null && task.completed_at >= p.startISO && task.completed_at < p.endISO;
    return created || due || done;
  };

  type Bucket = {
    workload: WorkloadMetrics;
    durations: number[];
    projects: Set<string>;
  };
  const makeBucket = (): Bucket => ({
    workload: emptyWorkload(),
    durations: [],
    projects: new Set<string>(),
  });

  function accumulate(bucket: Bucket, task: TaskRow) {
    const w = bucket.workload;
    w.primary += 1;
    if (task.project_id) bucket.projects.add(task.project_id);
    const isDone = task.status === "done";
    if (isDone) {
      w.done += 1;
      if (task.completed_at && task.completed_at > task.deadline) w.late_done += 1;
      if (task.completed_at) {
        const hours =
          (new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 3_600_000;
        if (hours >= 0) bucket.durations.push(hours);
      }
    } else {
      if (task.status === "not_started") w.not_started += 1;
      if (task.status === "in_progress") w.in_progress += 1;
      if (task.status === "review") w.review += 1;
      if (task.deadline < nowISO) w.overdue += 1;
    }
  }

  const currentByPerson = new Map<string, Bucket>();
  const previousByPerson = new Map<string, Bucket>();
  for (const id of personIds) {
    currentByPerson.set(id, makeBucket());
    previousByPerson.set(id, makeBucket());
  }

  for (const task of tasks) {
    const cur = currentByPerson.get(task.assignee_id);
    if (cur && inPeriod(task, period)) accumulate(cur, task);
    const prev = previousByPerson.get(task.assignee_id);
    if (prev && inPeriod(task, previous)) accumulate(prev, task);
    // Task tồn từ kỳ trước: deadline trước kỳ và tới nay vẫn chưa hoàn thành.
    if (cur && task.status !== "done" && task.deadline < period.startISO) {
      cur.workload.carried_over += 1;
    }
  }

  for (const row of participants) {
    const task = taskById.get(row.task_id);
    const bucket = currentByPerson.get(row.user_id);
    if (!bucket) continue;
    if (!task) {
      // Task ngoài tập phụ trách chính đã tải: đếm phối hợp theo quan hệ, không suy diễn trạng thái.
      bucket.workload.collaborating += 1;
      continue;
    }
    if (task.assignee_id === row.user_id) continue;
    if (inPeriod(task, period)) bucket.workload.collaborating += 1;
  }

  // --- Chất lượng: lấy từ lịch sử chuyển trạng thái Task trong Audit Log ---
  const qualityByPerson = new Map<string, QualityMetrics>();
  await source(
    "task_quality",
    async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("entity_id, before_data, after_data, created_at")
        .eq("entity_type", "task")
        .gte("created_at", period.startISO)
        .lt("created_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      const reworkByTask = new Map<string, number>();
      const reviewedTasks = new Set<string>();
      const approvedTasks = new Set<string>();
      for (const row of data ?? []) {
        const before = (row.before_data as { status?: string } | null)?.status ?? null;
        const after = (row.after_data as { status?: string } | null)?.status ?? null;
        if (!row.entity_id || before === after) continue;
        if (after === "review") reviewedTasks.add(row.entity_id);
        if (before === "review" && after !== "done") {
          reviewedTasks.add(row.entity_id);
          reworkByTask.set(row.entity_id, (reworkByTask.get(row.entity_id) ?? 0) + 1);
        }
        if (before === "review" && after === "done") {
          reviewedTasks.add(row.entity_id);
          approvedTasks.add(row.entity_id);
        }
      }
      for (const id of personIds) {
        const own = tasks.filter((t) => t.assignee_id === id && reviewedTasks.has(t.id));
        const reworked = own.filter((t) => (reworkByTask.get(t.id) ?? 0) > 0);
        const events = own.reduce((sum, t) => sum + (reworkByTask.get(t.id) ?? 0), 0);
        qualityByPerson.set(id, {
          approved_direct: own.filter((t) => approvedTasks.has(t.id) && !reworked.includes(t))
            .length,
          reworked_tasks: reworked.length,
          rework_events: events,
          rework_rate: ratio(reworked.length, own.length),
        });
      }
      return null;
    },
    null,
  );

  // --- Báo cáo: đọc từ nghĩa vụ báo cáo, không tính lại Business Rule ---
  const reportsByPerson = new Map<string, ReportMetrics>();
  for (const id of personIds) reportsByPerson.set(id, emptyReports());
  const previousReportTotals = emptyReports();

  await source(
    "report_obligations",
    async () => {
      const { data, error } = await supabase
        .from("report_obligations")
        .select("user_id, team_id, report_type, due_at, is_exempt, first_submitted_at, is_late")
        .in("user_id", personIds)
        .gte("due_at", previous.startISO)
        .lt("due_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const current = row.due_at >= period.startISO;
        if (row.is_exempt) continue;
        const target = current ? reportsByPerson.get(row.user_id) : previousReportTotals;
        if (!target) continue;
        target.required += 1;
        if (row.first_submitted_at) {
          target.submitted += 1;
          if (row.is_late) target.late_or_missing += 1;
          else target.on_time += 1;
        } else if (row.due_at < nowISO) {
          target.late_or_missing += 1;
        }
        if (current && row.report_type === "weekly") {
          target.weekly_team += 1;
        }
      }
      return null;
    },
    null,
  );

  await source(
    "reports_revision",
    async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("author_id, status, due_at")
        .in("author_id", personIds)
        .eq("status", "revision_required")
        .is("deleted_at", null)
        .gte("due_at", period.startISO)
        .lt("due_at", period.endISO)
        .limit(2000);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const target = row.author_id ? reportsByPerson.get(row.author_id) : null;
        if (target) target.revision_required += 1;
      }
      return null;
    },
    null,
  );

  // --- Ghi nhận và MVP: chỉ đọc, không triển khai lại ---
  const recognitionByPerson = new Map<string, Map<string, number>>();
  await source(
    "recognitions",
    async () => {
      const { data, error } = await supabase
        .from("recognitions")
        .select("receiver_id, category, created_at")
        .in("receiver_id", personIds)
        .is("revoked_at", null)
        .gte("created_at", period.startISO)
        .lt("created_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const map = recognitionByPerson.get(row.receiver_id) ?? new Map<string, number>();
        map.set(row.category, (map.get(row.category) ?? 0) + 1);
        recognitionByPerson.set(row.receiver_id, map);
      }
      return null;
    },
    null,
  );

  const votesByPerson = new Map<string, number>();
  await source(
    "mvp_votes",
    async () => {
      const { data, error } = await supabase
        .from("mvp_votes")
        .select("votee_id, is_valid, created_at")
        .in("votee_id", personIds)
        .gte("created_at", period.startISO)
        .lt("created_at", period.endISO)
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (row.is_valid === false) continue;
        votesByPerson.set(row.votee_id, (votesByPerson.get(row.votee_id) ?? 0) + 1);
      }
      return null;
    },
    null,
  );

  const awardsByPerson = new Map<string, string[]>();
  await source(
    "mvp_awards",
    async () => {
      const { data, error } = await supabase
        .from("mvp_award_results")
        .select("recipient_id, award_type, status, published_at")
        .in("recipient_id", personIds)
        .eq("status", "published")
        .gte("published_at", period.startISO)
        .lt("published_at", period.endISO)
        .limit(1000);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const list = awardsByPerson.get(row.recipient_id) ?? [];
        list.push(row.award_type);
        awardsByPerson.set(row.recipient_id, list);
      }
      return null;
    },
    null,
  );

  // --- Ghép dữ liệu nhân sự ---
  const peopleResult: PersonPerformance[] = people.map((profile) => {
    const bucket = currentByPerson.get(profile.id) ?? makeBucket();
    bucket.workload.projects = bucket.projects.size;
    const sensitive = canSeeSensitive(profile.id);
    const categories = Array.from(recognitionByPerson.get(profile.id)?.entries() ?? []).map(
      ([key, count]) => ({
        key,
        label: RECOGNITION_CATEGORY_LABEL[key] ?? key,
        count,
      }),
    );
    return {
      user_id: profile.id,
      display_name: profile.display_name,
      job_title: profile.job_title,
      team_id: profile.primary_team_id,
      team_name: profile.primary_team_id ? (teamName.get(profile.primary_team_id) ?? null) : null,
      is_self: profile.id === viewerId,
      workload: bucket.workload,
      efficiency: efficiencyOf(bucket.workload, bucket.durations),
      quality: sensitive ? (qualityByPerson.get(profile.id) ?? null) : null,
      reports: sensitive ? (reportsByPerson.get(profile.id) ?? emptyReports()) : null,
      recognition: {
        received: categories.reduce((sum, c) => sum + c.count, 0),
        categories,
        votes_received: votesByPerson.get(profile.id) ?? 0,
        awards: awardsByPerson.get(profile.id) ?? [],
      },
    };
  });

  // --- Chi tiết Team ---
  const teamDetails: TeamPerformance[] = activeTeamIds
    .map((teamId) => {
      const members = peopleResult.filter((p) => p.team_id === teamId);
      if (members.length === 0) return null;
      const workload = emptyWorkload();
      const durations: number[] = [];
      const reports = emptyReports();
      let anySensitive = false;
      for (const member of members) {
        mergeWorkload(workload, member.workload);
        workload.projects += 0;
        const bucket = currentByPerson.get(member.user_id);
        if (bucket) durations.push(...bucket.durations);
        if (member.reports) {
          anySensitive = true;
          mergeReports(reports, member.reports);
        }
      }
      const projectSet = new Set<string>();
      for (const member of members) {
        const bucket = currentByPerson.get(member.user_id);
        bucket?.projects.forEach((p) => projectSet.add(p));
      }
      workload.projects = projectSet.size;
      const leader = teams.find((t) => t.id === teamId)?.leader_id ?? null;
      return {
        team_id: teamId,
        team_name: teamName.get(teamId) ?? "Team",
        leader_name: leader ? (profiles.find((p) => p.id === leader)?.display_name ?? null) : null,
        members: members.length,
        workload,
        efficiency: efficiencyOf(workload, durations),
        reports: anySensitive ? reports : null,
      } satisfies TeamPerformance;
    })
    .filter((t): t is TeamPerformance => t !== null);

  // --- Tổng quan và so sánh kỳ liền trước ---
  function totalsOf(buckets: Bucket[], reportMetrics: ReportMetrics | null): PerfTotals {
    const workload = emptyWorkload();
    const durations: number[] = [];
    const projectSet = new Set<string>();
    for (const bucket of buckets) {
      mergeWorkload(workload, bucket.workload);
      durations.push(...bucket.durations);
      bucket.projects.forEach((p) => projectSet.add(p));
    }
    workload.projects = projectSet.size;
    return { workload, efficiency: efficiencyOf(workload, durations), reports: reportMetrics };
  }

  const visibleReportTotals = (() => {
    const totals = emptyReports();
    let any = false;
    for (const person of peopleResult) {
      if (!person.reports) continue;
      any = true;
      mergeReports(totals, person.reports);
      totals.weekly_team += person.reports.weekly_team;
    }
    return any ? totals : null;
  })();

  const totals = totalsOf(Array.from(currentByPerson.values()), visibleReportTotals);
  const previousTotals = totalsOf(
    Array.from(previousByPerson.values()),
    visibleReportTotals ? previousReportTotals : null,
  );

  // --- Xu hướng theo ngày ---
  const trendMap = new Map<string, TrendPoint>();
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) {
    trendMap.set(day, { date: day, done: 0, late_done: 0, created: 0, due: 0 });
  }
  for (const task of tasks) {
    if (!currentByPerson.has(task.assignee_id)) continue;
    if (task.completed_at && task.completed_at >= period.startISO && task.completed_at < period.endISO) {
      const point = trendMap.get(hanoiDay(task.completed_at));
      if (point) {
        point.done += 1;
        if (task.completed_at > task.deadline) point.late_done += 1;
      }
    }
    if (task.created_at >= period.startISO && task.created_at < period.endISO) {
      const point = trendMap.get(hanoiDay(task.created_at));
      if (point) point.created += 1;
    }
    if (task.deadline >= period.startISO && task.deadline < period.endISO) {
      const point = trendMap.get(hanoiDay(task.deadline));
      if (point) point.due += 1;
    }
  }
  const trend = Array.from(trendMap.values());

  // --- Cảnh báo (mô tả tình trạng, không kết luận nhân sự) ---
  const alerts: PerfAlert[] = [];
  const workloadValues = peopleResult.map((p) => p.workload.primary);
  const avgWorkload =
    workloadValues.length > 0
      ? workloadValues.reduce((sum, v) => sum + v, 0) / workloadValues.length
      : 0;
  for (const person of peopleResult) {
    if (person.workload.overdue >= 3) {
      alerts.push({
        id: `overdue-${person.user_id}`,
        kind: "overdue",
        title: `${person.display_name}: ${person.workload.overdue} Task quá hạn`,
        detail: "Task chưa hoàn thành và đã qua deadline trong phạm vi kỳ đang xem.",
      });
    }
    if (avgWorkload > 0 && person.workload.primary >= Math.max(8, avgWorkload * 1.5)) {
      alerts.push({
        id: `workload-${person.user_id}`,
        kind: "workload",
        title: `${person.display_name}: khối lượng ${person.workload.primary} Task`,
        detail: "Cao hơn 50% so với mức trung bình của phạm vi đang xem.",
      });
    }
    if (person.reports && person.reports.late_or_missing >= 2) {
      alerts.push({
        id: `reports-${person.user_id}`,
        kind: "reports",
        title: `${person.display_name}: ${person.reports.late_or_missing} báo cáo muộn hoặc thiếu`,
        detail: "Tính theo nghĩa vụ báo cáo có hạn nộp trong kỳ.",
      });
    }
  }

  return {
    scope,
    role,
    viewer_id: viewerId,
    period,
    previous,
    teams: teams
      .filter((t) => allowedTeamIds.includes(t.id))
      .map((t) => ({ id: t.id, name: t.name })),
    people: peopleResult,
    team_details: teamDetails,
    totals,
    previous_totals: previousTotals,
    trend,
    alerts,
    unavailable,
  };
}
