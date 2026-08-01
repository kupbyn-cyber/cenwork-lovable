import {
  computeMvpScore,
  proposeMvpAwards,
  MVP_CRITERION_MAX,
  type MvpAwardCandidate,
  type MvpCriterion,
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

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** `yyyy-MM-dd` giờ Hà Nội → mốc ISO UTC đầu/cuối ngày. */
function hanoiDayBoundary(dateStr: string, end: boolean): string {
  return new Date(`${dateStr}T${end ? "23:59:59.999" : "00:00:00.000"}+07:00`).toISOString();
}

/** Ảnh chụp công việc thuộc kỳ: deadline rơi trong tuần và chưa lưu trữ. */
export async function snapshotCycleTasks(supabase: Db, cycleId: string) {
  const { data: cycle, error: cycleError } = await supabase
    .from("mvp_cycles")
    .select("id,week_start,week_end,status")
    .eq("id", cycleId)
    .single();
  if (cycleError || !cycle) throw new Error(cycleError?.message ?? "Không tìm thấy kỳ MVP.");
  if (cycle.status === "published") throw new Error("Kỳ đã công bố, không thể thu thập lại.");

  const from = hanoiDayBoundary(cycle.week_start as string, false);
  const to = hanoiDayBoundary(cycle.week_end as string, true);

  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select("id,assignee_id,priority,deadline,status")
    .eq("is_archived", false)
    .gte("deadline", from)
    .lte("deadline", to);
  if (taskError) throw new Error(taskError.message);

  const { data: existing } = await supabase
    .from("mvp_cycle_tasks")
    .select("task_id")
    .eq("cycle_id", cycleId);
  const known = new Set(((existing ?? []) as { task_id: string }[]).map((row) => row.task_id));

  const rows = ((tasks ?? []) as Record<string, unknown>[])
    .filter((task) => !known.has(task["id"] as string))
    .map((task) => ({
      cycle_id: cycleId,
      task_id: task["id"] as string,
      user_id: task["assignee_id"] as string,
      weight: PRIORITY_WEIGHT[task["priority"] as string] ?? 1,
      original_deadline: task["deadline"] as string,
      final_status: task["status"] as string,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("mvp_cycle_tasks").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { added: rows.length, total: known.size + rows.length };
}

interface ComputeContext {
  weekStart: string;
  weekEnd: string;
}

/** Tính lại toàn bộ bảng điểm của kỳ từ dữ liệu hệ thống + đánh giá đã gửi. */
export async function computeCycleScores(supabase: Db, cycleId: string) {
  const { data: cycle, error: cycleError } = await supabase
    .from("mvp_cycles")
    .select("id,week_start,week_end,status")
    .eq("id", cycleId)
    .single();
  if (cycleError || !cycle) throw new Error(cycleError?.message ?? "Không tìm thấy kỳ MVP.");
  if (cycle.status === "published") throw new Error("Kỳ đã công bố, không thể tính lại điểm.");

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
    announcementRecipients,
  ] = await Promise.all([

      supabase
        .from("mvp_cycle_tasks")
        .select("task_id,user_id,weight,is_committed,tasks(status,deadline,updated_at)")
        .eq("cycle_id", cycleId),
      supabase.from("profiles").select("id,primary_team_id").eq("status", "active"),
      supabase.from("user_roles").select("user_id,role").eq("role", "leader"),
      supabase.from("teams").select("id,leader_id"),
      supabase
        .from("daily_reports")
        .select("author_id,status")
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
        .select("subject_id,quality_score,proactive_score,teamwork_score")
        .eq("cycle_id", cycleId)
        .eq("status", "submitted"),
      // Thông báo bắt buộc xác nhận có hạn rơi trong kỳ — tái dùng dữ liệu M6.1/M6.2.
      supabase
        .from("announcement_recipients")
        .select(
          "announcement_id,user_id,status,due_at,acknowledged_at,exempt_reason,created_at," +
            "announcement:announcements(id,title,status,due_at,revoked_at)",
        )
        .gte("due_at", weekFrom)
        .lte("due_at", weekTo),

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
    announcementRecipients,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }


  const tasksByUser = new Map<string, MvpTaskInput[]>();
  for (const raw of (cycleTasks.data ?? []) as Record<string, unknown>[]) {
    const task = raw["tasks"] as { status: string; deadline: string; updated_at: string } | null;
    if (!task) continue;
    const userId = raw["user_id"] as string;
    const list = tasksByUser.get(userId) ?? [];
    list.push({
      weight: Number(raw["weight"] ?? 1),
      status: task.status,
      deadline: task.deadline,
      completedAt: task.status === "done" ? task.updated_at : null,
      isCommitted: Boolean(raw["is_committed"]),
    });
    tasksByUser.set(userId, list);
  }

  const leaderIds = new Set(
    ((leaderRoles.data ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  const teamOfLeader = new Map<string, string>();
  for (const team of (teams.data ?? []) as { id: string; leader_id: string | null }[]) {
    if (team.leader_id) teamOfLeader.set(team.leader_id, team.id);
  }

  const dailyCount = new Map<string, number>();
  for (const row of (dailyReports.data ?? []) as { author_id: string }[]) {
    dailyCount.set(row.author_id, (dailyCount.get(row.author_id) ?? 0) + 1);
  }

  const weeklyDone = new Set(
    ((weeklyReports.data ?? []) as { team_id: string }[]).map((row) => row.team_id),
  );

  const voteCount = new Map<string, number>();
  for (const row of (votes.data ?? []) as { votee_id: string }[]) {
    voteCount.set(row.votee_id, (voteCount.get(row.votee_id) ?? 0) + 1);
  }
  const topVotes = Math.max(0, ...Array.from(voteCount.values()));

  const reviewByUser = new Map<string, { quality: number; proactive: number; teamwork: number }>();
  for (const row of (reviews.data ?? []) as Record<string, unknown>[]) {
    reviewByUser.set(row["subject_id"] as string, {
      quality: Number(row["quality_score"] ?? 0),
      proactive: Number(row["proactive_score"] ?? 0),
      teamwork: Number(row["teamwork_score"] ?? 0),
    });
  }

  /**
   * Thông báo bắt buộc xác nhận theo từng nhân sự.
   * Bắt buộc xác nhận = thông báo đã phát hành và có hạn xác nhận (due_at).
   * Chỉ đọc dữ liệu M6 đang có, không sinh bảng hay trường mới.
   */
  const announcementsByUser = new Map<string, MvpAnnouncementInput[]>();
  for (const raw of (announcementRecipients.data ?? []) as Record<string, unknown>[]) {
    const announcement = raw["announcement"] as Record<string, unknown> | null;
    if (!announcement) continue;
    if (announcement["status"] !== "published") continue;
    if (!announcement["due_at"]) continue;
    const userId = raw["user_id"] as string;
    const list = announcementsByUser.get(userId) ?? [];
    list.push({
      announcementId: announcement["id"] as string,
      title: (announcement["title"] as string) ?? "",
      dueAt: (raw["due_at"] as string | null) ?? null,
      receivedAt: (raw["created_at"] as string | null) ?? null,
      acknowledgedAt: (raw["acknowledged_at"] as string | null) ?? null,
      isRevoked: Boolean(announcement["revoked_at"]),
      isExempt: raw["status"] === "exempt",
      exemptReason: (raw["exempt_reason"] as string | null) ?? null,
    });
    announcementsByUser.set(userId, list);
  }
  // Mốc khóa kỳ: thời điểm chốt dữ liệu của kỳ, nếu chưa có thì lấy hiện tại.
  const announcementLockAt =
    ((cycle as Record<string, unknown>)["data_locked_at"] as string | null) ??
    new Date().toISOString();


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
  }[]) {
    const isLeader = leaderIds.has(profile.id);
    const leaderTeam = teamOfLeader.get(profile.id) ?? null;
    const result = computeMvpScore({
      tasks: tasksByUser.get(profile.id) ?? [],
      dailyReportsSubmitted: dailyCount.get(profile.id) ?? 0,
      weeklyReportSubmitted: isLeader && leaderTeam ? weeklyDone.has(leaderTeam) : null,
      votesReceived: voteCount.get(profile.id) ?? 0,
      topVotes,
      review: reviewByUser.get(profile.id) ?? null,
    });

    scorecardRows.push({
      cycle_id: cycleId,
      user_id: profile.id,
      team_id: profile.primary_team_id,
      auto_score: result.autoScore,
      review_score: result.reviewScore,
      vote_score: result.voteScore,
      penalty_score: result.penaltyScore,
      total_score: result.totalScore,
      data_completeness: result.dataCompleteness,
      is_eligible: result.isEligible,
      ineligible_reason: result.ineligibleReason,
      status: result.isEligible ? "computed" : "disqualified",
      computed_at: new Date().toISOString(),
    });

    for (const component of result.components) {
      componentRows.push({
        cycle_id: cycleId,
        user_id: profile.id,
        criterion: component.criterion,
        max_points: component.maxPoints,
        earned_points: component.earnedPoints,
        formula: component.formula,
        source_data: component.sourceData,
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
