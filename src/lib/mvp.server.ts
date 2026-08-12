import { normalizeTaskWeight } from "@/lib/task-weight";
import {
  computeMvpScore,
  proposeMvpAwards,
  MVP_CRITERION_MAX,
  type MvpAnnouncementInput,
  type MvpAwardCandidate,
  type MvpCriterion,
  type MvpReportObligationInput,
  type MvpTaskInput,
} from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 xử lý nghiệp vụ MVP phía server.
 * Chỉ chạy trong handler của server function; luôn dùng phiên của người gọi
 * để RLS và trigger database vẫn là ràng buộc cuối cùng.
 */

/** Client Supabase tối giản — tránh phụ thuộc kiểu sinh tự động ở tầng này. */
type Db = {
  from: (table: string) => any;
};


/** `yyyy-MM-dd` giờ Hà Nội → mốc ISO UTC đầu/cuối ngày. */
function hanoiDayBoundary(dateStr: string, end: boolean): string {
  return new Date(`${dateStr}T${end ? "23:59:59.999" : "00:00:00.000"}+07:00`).toISOString();
}

/** Danh sách ngày `yyyy-MM-dd` trong khoảng (bao gồm hai đầu). */
function dateRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  for (let d = start; d.getTime() <= end.getTime(); d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Thứ Hai–Thứ Sáu là ngày phải gửi báo cáo ngày theo quy tắc CEN hiện hành. */
function isWorkingWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export interface SnapshotSyncResult {
  added: number;
  updated: number;
  excluded: number;
  restored: number;
  total: number;
  excludedReasons: Record<string, number>;
}

/**
 * MVP-FIX-02 — Đồng bộ ảnh chụp công việc của kỳ.
 * Chỉ chạy khi kỳ chưa khóa dữ liệu (data_locked_at). Sau khi khóa, ảnh chụp
 * là nguồn dữ liệu duy nhất cho phần chấm điểm công việc.
 */
export async function snapshotCycleTasks(supabase: Db, cycleId: string): Promise<SnapshotSyncResult> {
  const { data: cycle, error: cycleError } = await supabase
    .from("mvp_cycles")
    .select("id,week_start,week_end,status,data_locked_at")
    .eq("id", cycleId)
    .single();
  if (cycleError || !cycle) throw new Error(cycleError?.message ?? "Không tìm thấy kỳ MVP.");
  if (cycle.status === "published") throw new Error("Kỳ đã công bố, không thể thu thập lại.");
  if (cycle.data_locked_at)
    throw new Error("Kỳ đã khóa dữ liệu, ảnh chụp công việc không thể thay đổi.");

  return syncCycleTaskSnapshot(supabase, cycle as Record<string, unknown>);
}

/** Đồng bộ thực tế — dùng chung cho thu thập thủ công và bước khóa kỳ. */
export async function syncCycleTaskSnapshot(
  supabase: Db,
  cycle: Record<string, unknown>,
): Promise<SnapshotSyncResult> {
  const cycleId = cycle["id"] as string;
  const from = hanoiDayBoundary(cycle["week_start"] as string, false);
  const to = hanoiDayBoundary(cycle["week_end"] as string, true);

  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select(
      "id,assignee_id,work_weight,deadline,status,completed_at,project_id,is_archived,deleted_at,cancelled_at,approval_status,project:projects(id,deleted_at)",
    )
    .gte("deadline", from)
    .lte("deadline", to);
  if (taskError) throw new Error(taskError.message);

  const eligible = new Map<string, Record<string, unknown>>();
  for (const task of (tasks ?? []) as Record<string, unknown>[]) {
    const project = task["project"] as { deleted_at?: string | null } | null;
    if (!task["assignee_id"]) continue;
    if (task["is_archived"]) continue;
    if (task["deleted_at"]) continue;
    if (task["cancelled_at"]) continue;
    if (task["approval_status"] && task["approval_status"] !== "approved") continue;
    if (task["project_id"] && project?.deleted_at) continue;
    eligible.set(task["id"] as string, task);
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("mvp_cycle_tasks")
    .select(
      "id,task_id,user_id,weight,original_deadline,final_status,final_completed_at,excluded_at",
    )
    .eq("cycle_id", cycleId);
  if (existingError) throw new Error(existingError.message);
  const existing = new Map<string, Record<string, unknown>>(
    ((existingRows ?? []) as Record<string, unknown>[]).map((row) => [row["task_id"] as string, row]),
  );

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  let restored = 0;

  for (const [taskId, task] of eligible) {
    const snapshot = {
      user_id: task["assignee_id"] as string,
      // MVP-FIX-03 — Trọng số lấy trực tiếp từ Task, không suy từ Mức ưu tiên.
      weight: normalizeTaskWeight(task["work_weight"]),
      original_deadline: task["deadline"] as string,
      final_status: task["status"] as string,
      final_completed_at: (task["completed_at"] as string | null) ?? null,
    };
    const current = existing.get(taskId);
    if (!current) {
      inserts.push({ cycle_id: cycleId, task_id: taskId, ...snapshot, snapshot_at: now });
      continue;
    }
    const changed =
      current["user_id"] !== snapshot.user_id ||
      Number(current["weight"]) !== snapshot.weight ||
      String(current["original_deadline"] ?? "") !== String(snapshot.original_deadline ?? "") ||
      current["final_status"] !== snapshot.final_status ||
      String(current["final_completed_at"] ?? "") !== String(snapshot.final_completed_at ?? "");
    const wasExcluded = Boolean(current["excluded_at"]);
    if (!changed && !wasExcluded) continue;
    const { error } = await supabase
      .from("mvp_cycle_tasks")
      .update({ ...snapshot, snapshot_at: now, excluded_at: null, excluded_reason: null })
      .eq("id", current["id"] as string);
    if (error) throw new Error(error.message);
    if (wasExcluded) restored += 1;
    if (changed) updated += 1;
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("mvp_cycle_tasks").insert(inserts);
    if (error) throw new Error(error.message);
  }

  // Loại mềm các công việc không còn đủ điều kiện (giữ dấu vết, không xóa cứng).
  const excludedReasons: Record<string, number> = {};
  let excluded = 0;
  const liveById = new Map(
    ((tasks ?? []) as Record<string, unknown>[]).map((t) => [t["id"] as string, t]),
  );
  for (const [taskId, row] of existing) {
    if (eligible.has(taskId)) continue;
    const reason = exclusionReason(liveById.get(taskId));
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
    excluded += 1;
    if (row["excluded_at"]) continue;
    const { error } = await supabase
      .from("mvp_cycle_tasks")
      .update({ excluded_at: now, excluded_reason: reason, snapshot_at: now })
      .eq("id", row["id"] as string);
    if (error) throw new Error(error.message);
  }

  return {
    added: inserts.length,
    updated,
    restored,
    excluded,
    total: eligible.size,
    excludedReasons,
  };
}

function exclusionReason(task: Record<string, unknown> | undefined): string {
  if (!task) return "out_of_range_or_deleted";
  if (task["deleted_at"]) return "deleted";
  if (task["cancelled_at"]) return "cancelled";
  if (task["is_archived"]) return "archived";
  if (!task["assignee_id"]) return "no_assignee";
  if (task["approval_status"] && task["approval_status"] !== "approved") return "not_approved";
  const project = task["project"] as { deleted_at?: string | null } | null;
  if (task["project_id"] && project?.deleted_at) return "project_deleted";
  return "other";
}

interface ComputeContext {
  weekStart: string;
  weekEnd: string;
}

/** Tính lại toàn bộ bảng điểm của kỳ từ dữ liệu hệ thống + đánh giá đã gửi. */
export async function computeCycleScores(supabase: Db, cycleId: string) {
  const { data: cycle, error: cycleError } = await supabase
    .from("mvp_cycles")
    .select("id,week_start,week_end,status,data_locked_at")
    .eq("id", cycleId)
    .single();
  if (cycleError || !cycle) throw new Error(cycleError?.message ?? "Không tìm thấy kỳ MVP.");
  if (cycle.status === "published") throw new Error("Kỳ đã công bố, không thể tính lại điểm.");

  // Kỳ chưa khóa: làm mới ảnh chụp trước khi chấm để dữ liệu preview khớp Task hiện tại.
  // Kỳ đã khóa: chỉ đọc ảnh chụp, không đụng dữ liệu live.
  if (!cycle.data_locked_at) {
    await syncCycleTaskSnapshot(supabase, cycle as Record<string, unknown>);
  }

  const ctx: ComputeContext = {
    weekStart: cycle.week_start as string,
    weekEnd: cycle.week_end as string,
  };

  const weekFrom = hanoiDayBoundary(ctx.weekStart, false);
  const weekTo = hanoiDayBoundary(ctx.weekEnd, true);

  const [
    cycleTasks,
    profiles,
    leaderRoles,
    teams,
    dailyReports,
    weeklyReports,
    votes,
    reviews,
    bonusApproved,
    announcementRecipients,
    adminCmoRoles,
    reportObligationRows,
    nonWorkingDays,
  ] = await Promise.all([

      supabase
        .from("mvp_cycle_tasks")
        .select(
          "task_id,user_id,weight,is_committed,original_deadline,final_status,final_completed_at," +
            "task:tasks(id,name)",
        )
        .eq("cycle_id", cycleId)
        .is("excluded_at", null),
      supabase
        .from("profiles")
        .select("id,primary_team_id,created_at,locked_at")
        .eq("status", "active"),
      supabase.from("user_roles").select("user_id,role").eq("role", "leader"),
      supabase.from("teams").select("id,leader_id"),
      supabase
        .from("daily_reports")
        .select("author_id,status,report_date")
        .gte("report_date", ctx.weekStart)
        .lte("report_date", ctx.weekEnd)
        .in("status", ["submitted", "approved"]),
      supabase
        .from("weekly_reports")
        .select("team_id,leader_id,status")
        .eq("week_start", ctx.weekStart)
        .in("status", ["submitted", "approved"]),
      supabase.from("mvp_votes").select("votee_id").eq("cycle_id", cycleId).eq("is_valid", true),
      supabase
        .from("mvp_manual_reviews")
        .select(
          "subject_id,reviewer_id,quality_score,proactive_score,impact_score,teamwork_score," +
            "reason,evidence,submitted_at,reviewer:profiles!mvp_manual_reviews_reviewer_id_fkey(id,display_name)",
        )
        .eq("cycle_id", cycleId)
        .eq("status", "submitted"),
      // Bonus đóng góp đặc biệt: chỉ tính phần đã được CMO duyệt.
      supabase
        .from("mvp_bonus_proposals")
        .select("subject_id,points")
        .eq("cycle_id", cycleId)
        .eq("status", "approved"),
      // Thông báo bắt buộc xác nhận có hạn rơi trong kỳ — tái dùng dữ liệu M6.1/M6.2.
      supabase
        .from("announcement_recipients")
        .select(
          "announcement_id,user_id,status,due_at,acknowledged_at,exempt_reason,created_at," +
            "announcement:announcements(id,title,status,due_at,revoked_at)",
        )
        .gte("due_at", weekFrom)
        .lte("due_at", weekTo),
      // Admin/CMO không thuộc diện gửi báo cáo ngày (Business Rule REPORT-FIX-01).
      supabase.from("user_roles").select("user_id,role").in("role", ["admin", "cmo"]),
      // Nguồn nghĩa vụ báo cáo chính thức nếu hệ thống đã sinh dữ liệu.
      supabase
        .from("report_obligations")
        .select("user_id,report_type,period_key,due_at,is_exempt,exempt_reason,first_submitted_at")
        .gte("period_key", ctx.weekStart)
        .lte("period_key", `${ctx.weekEnd}z`),
      // Ngày nghỉ/không làm việc đã được duyệt — không đưa vào mẫu số báo cáo.
      supabase
        .from("report_non_working_days")
        .select("day,team_id,user_id,reason")
        .gte("day", ctx.weekStart)
        .lte("day", ctx.weekEnd),

    ]);

  for (const result of [
    cycleTasks,
    profiles,
    leaderRoles,
    teams,
    dailyReports,
    weeklyReports,
    votes,
    reviews,
    bonusApproved,
    announcementRecipients,
    adminCmoRoles,
    reportObligationRows,
    nonWorkingDays,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }


  const tasksByUser = new Map<string, MvpTaskInput[]>();
  /** Dữ liệu bất thường: Task done nhưng thiếu completed_at (không tự suy đoán). */
  let doneWithoutCompletedAt = 0;
  for (const raw of (cycleTasks.data ?? []) as Record<string, unknown>[]) {
    const userId = raw["user_id"] as string;
    if (!userId) continue;
    const list = tasksByUser.get(userId) ?? [];
    // Toàn bộ dữ liệu chấm điểm Task lấy từ ảnh chụp của kỳ.
    const status = raw["final_status"] as string;
    const completedAt = (raw["final_completed_at"] as string | null) ?? null;
    const deadline = raw["original_deadline"] as string;
    if (status === "done" && !completedAt) doneWithoutCompletedAt += 1;
    const task = raw["task"] as { name?: string } | null;
    list.push({
      taskId: raw["task_id"] as string,
      ...(task?.name ? { title: task.name } : {}),
      weight: Number(raw["weight"] ?? 1),
      status,
      deadline,
      completedAt: status === "done" ? completedAt : null,
      isCommitted: Boolean(raw["is_committed"]),
    });
    tasksByUser.set(userId, list);
  }
  if (doneWithoutCompletedAt > 0) {
    console.warn(
      `[mvp] Kỳ ${cycleId}: ${doneWithoutCompletedAt} công việc done nhưng thiếu completed_at — không tính đúng hạn.`,
    );
  }

  const leaderIds = new Set(
    ((leaderRoles.data ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  const teamOfLeader = new Map<string, string>();
  for (const team of (teams.data ?? []) as { id: string; leader_id: string | null }[]) {
    if (team.leader_id) teamOfLeader.set(team.leader_id, team.id);
  }

  /** Ngày đã có báo cáo hợp lệ: `userId|yyyy-MM-dd`. */
  const dailyDone = new Set<string>();
  for (const row of (dailyReports.data ?? []) as { author_id: string; report_date: string }[]) {
    dailyDone.add(`${row.author_id}|${String(row.report_date).slice(0, 10)}`);
  }

  const weeklyDone = new Set(
    ((weeklyReports.data ?? []) as { team_id: string }[]).map((row) => row.team_id),
  );

  const voteCount = new Map<string, number>();
  for (const row of (votes.data ?? []) as { votee_id: string }[]) {
    voteCount.set(row.votee_id, (voteCount.get(row.votee_id) ?? 0) + 1);
  }
  const topVotes = Math.max(0, ...Array.from(voteCount.values()));

  const reviewByUser = new Map<
    string,
    { quality: number; proactive: number; impact: number; teamwork: number }
  >();
  const reviewMetaByUser = new Map<
    string,
    {
      reviewerId: string | null;
      reviewerName: string | null;
      reason: string | null;
      evidence: string | null;
      submittedAt: string | null;
    }
  >();
  for (const row of (reviews.data ?? []) as Record<string, unknown>[]) {
    reviewByUser.set(row["subject_id"] as string, {
      quality: Number(row["quality_score"] ?? 0),
      proactive: Number(row["proactive_score"] ?? 0),
      impact: Number(row["impact_score"] ?? 0),
      teamwork: Number(row["teamwork_score"] ?? 0),
    });
    const reviewer = row["reviewer"] as { display_name?: string } | null;
    reviewMetaByUser.set(row["subject_id"] as string, {
      reviewerId: (row["reviewer_id"] as string | null) ?? null,
      reviewerName: reviewer?.display_name ?? null,
      reason: (row["reason"] as string | null) ?? null,
      evidence: (row["evidence"] as string | null) ?? null,
      submittedAt: (row["submitted_at"] as string | null) ?? null,
    });
  }

  const bonusByUser = new Map<string, number>();
  for (const row of (bonusApproved.data ?? []) as { subject_id: string; points: number }[]) {
    bonusByUser.set(row.subject_id, (bonusByUser.get(row.subject_id) ?? 0) + Number(row.points ?? 0));
  }

  /**
   * Thông báo bắt buộc xác nhận theo từng nhân sự.
   * Bắt buộc xác nhận = thông báo đã phát hành và có hạn xác nhận (due_at).
   * Chỉ đọc dữ liệu M6 đang có, không sinh bảng hay trường mới.
   */
  const announcementsByUser = new Map<string, MvpAnnouncementInput[]>();
  const recipientRows = (announcementRecipients.data ?? []) as Record<string, unknown>[];

  /**
   * MVP-FIX-04 — Lịch sử hạn xác nhận của người nhận.
   * Dùng để phát hiện hạn bị đổi sau khi người nhận đã quá hạn theo hạn cũ.
   */
  const announcementIds = Array.from(
    new Set(
      recipientRows
        .map((row) => (row["announcement"] as Record<string, unknown> | null)?.["id"] as string)
        .filter(Boolean),
    ),
  );
  const historyByPair = new Map<string, { dueAt: string; acknowledgedAt: string | null }[]>();
  if (announcementIds.length > 0) {
    const { data: historyRows, error: historyError } = await supabase
      .from("announcement_recipient_history")
      .select("announcement_id,user_id,version,due_at,acknowledged_at")
      .in("announcement_id", announcementIds);
    if (historyError) throw new Error(historyError.message);
    for (const row of (historyRows ?? []) as Record<string, unknown>[]) {
      const key = `${row["announcement_id"]}|${row["user_id"]}`;
      const list = historyByPair.get(key) ?? [];
      list.push({
        dueAt: row["due_at"] as string,
        acknowledgedAt: (row["acknowledged_at"] as string | null) ?? null,
      });
      historyByPair.set(key, list);
    }
  }

  for (const raw of recipientRows) {
    const announcement = raw["announcement"] as Record<string, unknown> | null;
    if (!announcement) continue;
    if (announcement["status"] !== "published") continue;
    if (!announcement["due_at"]) continue;
    const userId = raw["user_id"] as string;
    const currentDue = (raw["due_at"] as string | null) ?? null;
    const ackAt = (raw["acknowledged_at"] as string | null) ?? null;
    // Hạn cũ đã bị bỏ lỡ (chưa xác nhận tại thời điểm đó) và sau đó bị dời ra sau.
    let missedHistoricalDue: string | null = null;
    for (const past of historyByPair.get(`${announcement["id"]}|${userId}`) ?? []) {
      if (!past.dueAt) continue;
      if (currentDue && new Date(past.dueAt).getTime() >= new Date(currentDue).getTime()) continue;
      const ackForThatVersion = past.acknowledgedAt ?? ackAt;
      const missed =
        !ackForThatVersion ||
        new Date(ackForThatVersion).getTime() > new Date(past.dueAt).getTime();
      if (!missed) continue;
      if (
        !missedHistoricalDue ||
        new Date(past.dueAt).getTime() < new Date(missedHistoricalDue).getTime()
      ) {
        missedHistoricalDue = past.dueAt;
      }
    }
    const list = announcementsByUser.get(userId) ?? [];
    list.push({
      announcementId: announcement["id"] as string,
      title: (announcement["title"] as string) ?? "",
      dueAt: currentDue,
      receivedAt: (raw["created_at"] as string | null) ?? null,
      acknowledgedAt: ackAt,
      isRevoked: Boolean(announcement["revoked_at"]),
      isExempt: raw["status"] === "exempt",
      exemptReason: (raw["exempt_reason"] as string | null) ?? null,
      dueChangedAfterOverdue: missedHistoricalDue !== null,
      gradingDueAt: missedHistoricalDue,
    });
    announcementsByUser.set(userId, list);
  }
  // Mốc khóa kỳ: thời điểm chốt dữ liệu của kỳ, nếu chưa có thì lấy hiện tại.
  const announcementLockAt =
    ((cycle as Record<string, unknown>)["data_locked_at"] as string | null) ??
    new Date().toISOString();

  /* ===== MVP-FIX-04 — Nghĩa vụ báo cáo thực tế của từng nhân sự ===== */

  const exemptFromReporting = new Set(
    ((adminCmoRoles.data ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );

  const nonWorkingGlobal = new Set<string>();
  const nonWorkingTeam = new Map<string, string>();
  const nonWorkingUser = new Map<string, string>();
  for (const row of (nonWorkingDays.data ?? []) as Record<string, unknown>[]) {
    const day = String(row["day"]).slice(0, 10);
    const reason = (row["reason"] as string) ?? "Ngày không làm việc";
    if (row["user_id"]) nonWorkingUser.set(`${row["user_id"]}|${day}`, reason);
    else if (row["team_id"]) nonWorkingTeam.set(`${row["team_id"]}|${day}`, reason);
    else nonWorkingGlobal.add(day);
  }

  /** Nghĩa vụ chính thức nếu report_obligations đã có dữ liệu cho kỳ. */
  const officialByUser = new Map<string, MvpReportObligationInput[]>();
  for (const row of (reportObligationRows.data ?? []) as Record<string, unknown>[]) {
    const kind = row["report_type"] === "weekly" ? "weekly" : "daily";
    if (row["report_type"] !== "daily" && row["report_type"] !== "weekly") continue;
    const userId = row["user_id"] as string;
    const list = officialByUser.get(userId) ?? [];
    list.push({
      kind,
      periodKey: row["period_key"] as string,
      dueAt: (row["due_at"] as string | null) ?? null,
      state: row["is_exempt"]
        ? "exempt"
        : row["first_submitted_at"]
          ? "completed"
          : "missing",
      exemptReason: (row["exempt_reason"] as string | null) ?? null,
      source: "obligation",
    });
    officialByUser.set(userId, list);
  }

  const cycleDays = dateRange(ctx.weekStart, ctx.weekEnd);
  const lockTime = new Date(announcementLockAt).getTime();

  /**
   * WORKDAY-01 — ngày làm việc thực tế do nhân sự xác nhận.
   * Bảng mới chưa có trong bộ type sinh tự động nên đọc qua cầu nối có kiểu tường minh.
   */
  type WorkRowResponse = Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>;
  const workRecords = await (
    supabase.from as unknown as (table: string) => {
      select: (columns: string) => {
        gte: (
          column: string,
          value: string,
        ) => { lte: (column: string, value: string) => WorkRowResponse };
      };
    }
  )("daily_work_records")
    .select("user_id,work_date,day_status,shift_type")
    .gte("work_date", ctx.weekStart)
    .lte("work_date", ctx.weekEnd);
  if (workRecords.error) throw new Error(workRecords.error.message);

  const workDayByUser = new Map<string, { status: "working" | "day_off"; shift: string | null }>();
  for (const row of workRecords.data ?? []) {
    const day = String(row["work_date"]).slice(0, 10);
    workDayByUser.set(`${row["user_id"] as string}|${day}`, {
      status: row["day_status"] === "day_off" ? "day_off" : "working",
      shift: (row["shift_type"] as string | null) ?? null,
    });
  }

  /**
   * Suy nghĩa vụ báo cáo ngày khi hệ thống chưa sinh report_obligations:
   * ngày làm việc trong kỳ, trừ ngày nghỉ đã duyệt, trừ thời gian trước khi
   * tài khoản tồn tại hoặc sau khi bị khóa, và chỉ tính ngày đã qua tại mốc chốt.
   */
  function derivedObligations(profile: {
    id: string;
    primary_team_id: string | null;
    created_at?: string | null;
    locked_at?: string | null;
  }): MvpReportObligationInput[] {
    const items: MvpReportObligationInput[] = [];
    if (!exemptFromReporting.has(profile.id)) {
      const activeFrom = profile.created_at ? String(profile.created_at).slice(0, 10) : null;
      const activeTo = profile.locked_at ? String(profile.locked_at).slice(0, 10) : null;
      for (const day of cycleDays) {
        const workDay = workDayByUser.get(`${profile.id}|${day}`) ?? null;
        // Ưu tiên ngày làm việc đã xác nhận (kể cả T7/CN). Ngày nghỉ tự khai
        // KHÔNG tự miễn nghĩa vụ: chỉ nguồn miễn trừ chính thức mới miễn.
        if (!workDay && !isWorkingWeekday(day)) continue;
        if (workDay?.status === "day_off" && !isWorkingWeekday(day)) continue;
        if (activeFrom && day < activeFrom) continue;
        if (activeTo && day > activeTo) continue;
        if (new Date(hanoiDayBoundary(day, true)).getTime() > lockTime) continue;
        const exemptReason =
          nonWorkingUser.get(`${profile.id}|${day}`) ??
          (profile.primary_team_id
            ? nonWorkingTeam.get(`${profile.primary_team_id}|${day}`)
            : undefined) ??
          (nonWorkingGlobal.has(day) ? "Ngày nghỉ chung của công ty" : undefined);
        items.push({
          kind: "daily",
          periodKey: day,
          dueAt: hanoiDayBoundary(day, true),
          state: exemptReason
            ? "exempt"
            : dailyDone.has(`${profile.id}|${day}`)
              ? "completed"
              : "missing",
          exemptReason: exemptReason ?? null,
          source: workDay ? "work_record" : "derived",
          workDay,
        });
      }
    }
    const leaderTeam = teamOfLeader.get(profile.id) ?? null;
    if (leaderIds.has(profile.id) && leaderTeam) {
      items.push({
        kind: "weekly",
        periodKey: ctx.weekStart,
        dueAt: hanoiDayBoundary(ctx.weekEnd, true),
        state: weeklyDone.has(leaderTeam) ? "completed" : "missing",
        exemptReason: null,
        source: "derived",
      });
    }
    return items;
  }

  // Kỳ liền trước để xét danh hiệu Tiến bộ vượt bậc.
  const { data: previousCycle } = await supabase
    .from("mvp_cycles")
    .select("id")
    .lt("week_start", ctx.weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousTotals = new Map<string, number>();
  if (previousCycle?.id) {
    const { data: previousScores } = await supabase
      .from("mvp_scorecards")
      .select("user_id,total_score")
      .eq("cycle_id", previousCycle.id as string);
    for (const row of (previousScores ?? []) as { user_id: string; total_score: number }[]) {
      previousTotals.set(row.user_id, Number(row.total_score));
    }
  }

  const scorecardRows: Record<string, unknown>[] = [];
  const componentRows: Record<string, unknown>[] = [];
  const candidates: MvpAwardCandidate[] = [];

  for (const profile of (profiles.data ?? []) as {
    id: string;
    primary_team_id: string | null;
    created_at?: string | null;
    locked_at?: string | null;
  }[]) {
    const official = officialByUser.get(profile.id) ?? [];
    const reportObligations = official.length > 0 ? official : derivedObligations(profile);
    const result = computeMvpScore({
      tasks: tasksByUser.get(profile.id) ?? [],
      reportObligations,
      votesReceived: voteCount.get(profile.id) ?? 0,
      topVotes,
      review: reviewByUser.get(profile.id) ?? null,
      reviewMeta: reviewMetaByUser.get(profile.id) ?? null,
      bonusScore: bonusByUser.get(profile.id) ?? 0,
      announcements: announcementsByUser.get(profile.id) ?? [],
      announcementLockAt,
    });

    scorecardRows.push({
      cycle_id: cycleId,
      user_id: profile.id,
      team_id: profile.primary_team_id,
      auto_score: result.autoScore,
      review_score: result.reviewScore,
      vote_score: result.voteScore,
      bonus_score: result.bonusScore,
      penalty_score: result.penaltyScore,
      total_score: result.totalScore,
      data_completeness: result.dataCompleteness,
      is_eligible: result.isEligible,
      ineligible_reason: result.ineligibleReason,
      status: result.isEligible ? "computed" : "disqualified",
      computed_at: new Date().toISOString(),
    });

    for (const component of result.components) {
      const computedAt = new Date().toISOString();
      componentRows.push({
        cycle_id: cycleId,
        user_id: profile.id,
        criterion: component.criterion,
        max_points: component.maxPoints,
        earned_points: component.earnedPoints,
        formula: component.formula,
        source_data: {
          ...component.sourceData,
          // MVP-FIX-05 — trạng thái dữ liệu và mốc chốt để UI giải thích, không đổi công thức.
          dataState: component.dataState ?? (component.isApplicable ? "ok" : "missing"),
          computedAt,
          lockedCycle: Boolean((cycle as Record<string, unknown>)["data_locked_at"]),
        },
        is_applicable: component.isApplicable,
        not_applicable_reason: component.notApplicableReason,
      });
    }

    const pointOf = (criterion: MvpCriterion) =>
      result.components.find((c) => c.criterion === criterion)?.earnedPoints ?? 0;

    candidates.push({
      userId: profile.id,
      totalScore: result.totalScore,
      isEligible: result.isEligible,
      completionScore: pointOf("completion"),
      onTimeScore: pointOf("on_time"),
      proactiveScore: pointOf("proactive"),
      teamworkScore: pointOf("teamwork"),
      voteScore: result.voteScore,
      votesReceived: voteCount.get(profile.id) ?? 0,
      previousTotal: previousTotals.get(profile.id) ?? null,
    });
  }

  if (scorecardRows.length > 0) {
    const { error } = await supabase
      .from("mvp_scorecards")
      .upsert(scorecardRows, { onConflict: "cycle_id,user_id" });
    if (error) throw new Error(error.message);
  }
  if (componentRows.length > 0) {
    const { error } = await supabase
      .from("mvp_score_components")
      .upsert(componentRows, { onConflict: "cycle_id,user_id,criterion" });
    if (error) throw new Error(error.message);
  }

  return { candidates, scored: scorecardRows.length, maxPoints: MVP_CRITERION_MAX };
}

/** Sinh đề xuất danh hiệu từ bảng điểm vừa tính. */
export async function refreshAwardProposals(supabase: Db, cycleId: string) {
  const { candidates } = await computeCycleScores(supabase, cycleId);
  const proposals = proposeMvpAwards(candidates);

  const rows = proposals.map((proposal) => ({
    cycle_id: cycleId,
    award_type: proposal.awardType,
    recipient_id: proposal.recipientId,
    award_score: proposal.awardScore,
    reason: proposal.reason,
    status: proposal.recipientId ? "proposed" : "not_awarded",
  }));

  const { error } = await supabase
    .from("mvp_award_results")
    .upsert(rows, { onConflict: "cycle_id,award_type" });
  if (error) throw new Error(error.message);
  return { proposals: rows.length };
}
