import type { StatusTone } from "@/components/ui/status-badge";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M6 Bộ quy tắc chấm điểm MVP (thuần hàm, dùng chung UI + server).
 *
 * Cơ cấu 100 điểm:
 * - 75 điểm tự động từ dữ liệu hệ thống (công việc, đúng hạn, báo cáo, vote).
 * - 25 điểm đánh giá thực tế của người quản lý trực tiếp.
 * Không có giá trị nào viết cứng trong component: mọi trọng số nằm ở đây.
 */
export type MvpCycleStatus = Database["public"]["Enums"]["mvp_cycle_status"];
export type MvpAwardType = Database["public"]["Enums"]["mvp_award_type"];
export type MvpAwardStatus = Database["public"]["Enums"]["mvp_award_status"];
export type MvpScorecardStatus = Database["public"]["Enums"]["mvp_scorecard_status"];
export type MvpReviewStatus = Database["public"]["Enums"]["mvp_review_status"];

/* ================= Kỳ MVP ================= */

export const MVP_CYCLE_STATUS_ORDER: MvpCycleStatus[] = [
  "collecting",
  "voting",
  "reviewing",
  "pending_publish",
  "published",
];

export const MVP_CYCLE_STATUS_LABEL: Record<MvpCycleStatus, string> = {
  collecting: "Đang thu thập dữ liệu",
  voting: "Đang mở vote",
  reviewing: "Đang đánh giá",
  pending_publish: "Chờ công bố",
  published: "Đã công bố",
};

export const MVP_CYCLE_STATUS_TONE: Record<MvpCycleStatus, StatusTone> = {
  collecting: "neutral",
  voting: "progress",
  reviewing: "warning",
  pending_publish: "warning",
  published: "success",
};

/** Chuyển trạng thái hợp lệ của kỳ — UI và server dùng chung. */
export const MVP_CYCLE_TRANSITIONS: Record<MvpCycleStatus, MvpCycleStatus[]> = {
  collecting: ["voting"],
  voting: ["reviewing"],
  reviewing: ["pending_publish"],
  pending_publish: ["published", "reviewing"],
  published: [],
};

export function canTransitionCycle(from: MvpCycleStatus, to: MvpCycleStatus): boolean {
  return MVP_CYCLE_TRANSITIONS[from].includes(to);
}

/* ================= Danh hiệu ================= */

export const MVP_AWARD_ORDER: MvpAwardType[] = [
  "mvp",
  "effective",
  "proactive",
  "teamwork",
  "progress",
  "creative",
];

export const MVP_AWARD_LABEL: Record<MvpAwardType, string> = {
  mvp: "MVP của tuần",
  effective: "Chiến binh hiệu quả",
  proactive: "Tinh thần chủ động",
  teamwork: "Đồng đội xuất sắc",
  progress: "Tiến bộ vượt bậc",
  creative: "Sáng tạo nổi bật",
};

export const MVP_AWARD_DESCRIPTION: Record<MvpAwardType, string> = {
  mvp: "Tổng điểm cao nhất kỳ, hợp lệ về dữ liệu.",
  effective: "Khối lượng hoàn thành và đúng hạn cao nhất.",
  proactive: "Điểm chủ động do người quản lý trực tiếp ghi nhận cao nhất.",
  teamwork: "Điểm đồng đội cộng với phiếu bầu của tập thể cao nhất.",
  progress: "Mức tăng điểm so với kỳ liền trước lớn nhất.",
  creative: "Được đồng đội bầu chọn nhiều nhất cho sáng kiến trong tuần.",
};

export const MVP_AWARD_STATUS_LABEL: Record<MvpAwardStatus, string> = {
  proposed: "Đề xuất",
  approved: "Đã phê duyệt",
  not_awarded: "Không trao",
  published: "Đã công bố",
};

export const MVP_AWARD_STATUS_TONE: Record<MvpAwardStatus, StatusTone> = {
  proposed: "neutral",
  approved: "progress",
  not_awarded: "warning",
  published: "success",
};

export const MVP_SCORECARD_STATUS_LABEL: Record<MvpScorecardStatus, string> = {
  draft: "Chưa tính",
  computed: "Đã tính điểm",
  reviewed: "Đã đánh giá",
  final: "Chốt điểm",
  disqualified: "Không hợp lệ",
};

export const MVP_SCORECARD_STATUS_TONE: Record<MvpScorecardStatus, StatusTone> = {
  draft: "neutral",
  computed: "progress",
  reviewed: "warning",
  final: "success",
  disqualified: "error",
};

/* ================= Trọng số công việc ================= */

export const MVP_TASK_WEIGHTS = [1, 2, 3, 5] as const;
export type MvpTaskWeight = (typeof MVP_TASK_WEIGHTS)[number];

export const MVP_TASK_WEIGHT_LABEL: Record<MvpTaskWeight, string> = {
  1: "Nhỏ (1)",
  2: "Vừa (2)",
  3: "Lớn (3)",
  5: "Trọng yếu (5)",
};

/* ================= Thang điểm ================= */

export const MVP_CRITERIA = {
  COMPLETION: "completion",
  ON_TIME: "on_time",
  REPORTING: "reporting",
  ANNOUNCEMENT: "announcement",
  VOTE: "vote",
  QUALITY: "quality",
  PROACTIVE: "proactive",
  TEAMWORK: "teamwork",
} as const;

export type MvpCriterion = (typeof MVP_CRITERIA)[keyof typeof MVP_CRITERIA];

export const MVP_CRITERION_MAX: Record<MvpCriterion, number> = {
  completion: 30,
  on_time: 20,
  reporting: 13,
  announcement: 2,
  vote: 10,
  quality: 10,
  proactive: 10,
  teamwork: 5,
};

export const MVP_CRITERION_LABEL: Record<MvpCriterion, string> = {
  completion: "Khối lượng hoàn thành",
  on_time: "Hoàn thành đúng hạn",
  reporting: "Kỷ luật báo cáo",
  announcement: "Xác nhận thông báo đúng hạn",
  vote: "Phiếu bầu đồng đội",
  quality: "Chất lượng công việc",
  proactive: "Tinh thần chủ động",
  teamwork: "Phối hợp đồng đội",
};

/**
 * Nhóm Kỷ luật: báo cáo + xác nhận thông báo, tổng 15 điểm.
 * Khi một chỉ số trong nhóm không áp dụng, điểm tối đa của nó được phân bổ lại
 * theo tỷ lệ cho các chỉ số còn lại — không chấm 0 cho người không có dữ liệu.
 */
export const MVP_DISCIPLINE_CRITERIA: MvpCriterion[] = ["reporting", "announcement"];
export const MVP_DISCIPLINE_MAX = MVP_DISCIPLINE_CRITERIA.reduce(
  (sum, c) => sum + MVP_CRITERION_MAX[c],
  0,
);

export const MVP_AUTO_CRITERIA: MvpCriterion[] = [
  "completion",
  "on_time",
  "reporting",
  "announcement",
  "vote",
];
export const MVP_REVIEW_CRITERIA: MvpCriterion[] = ["quality", "proactive", "teamwork"];


export const MVP_AUTO_MAX = MVP_AUTO_CRITERIA.reduce((sum, c) => sum + MVP_CRITERION_MAX[c], 0);
export const MVP_REVIEW_MAX = MVP_REVIEW_CRITERIA.reduce((sum, c) => sum + MVP_CRITERION_MAX[c], 0);
export const MVP_TOTAL_MAX = MVP_AUTO_MAX + MVP_REVIEW_MAX;

/** Thang chấm tay: 5 mức cố định, tránh chấm cảm tính tùy tiện. */
export const MVP_REVIEW_SCALE_LABEL = [
  "Chưa đạt",
  "Cần cải thiện",
  "Đạt",
  "Tốt",
  "Xuất sắc",
] as const;

export function reviewScaleOptions(max: number): { value: number; label: string }[] {
  return MVP_REVIEW_SCALE_LABEL.map((label, index) => ({
    value: Math.round((max / 4) * index * 100) / 100,
    label: `${label} (${Math.round((max / 4) * index * 100) / 100})`,
  }));
}

/** Mức đánh giá từ Tốt trở lên bắt buộc kèm bằng chứng. */
export function requiresEvidence(value: number, max: number): boolean {
  return value >= (max / 4) * 3;
}

/* ================= Phạt và điều kiện hợp lệ ================= */

export const MVP_PENALTY_PER_OVERDUE = 2;
export const MVP_PENALTY_MAX = 10;
export const MVP_MIN_COMPLETENESS = 60;
export const MVP_MIN_COMMITTED_TASKS = 1;
export const MVP_EXPECTED_DAILY_REPORTS = 5;
export const MVP_VOTE_MIN_REASON = 20;

/* ================= Đầu vào và kết quả tính điểm ================= */

export interface MvpTaskInput {
  weight: number;
  status: string;
  deadline: string;
  completedAt: string | null;
  isCommitted: boolean;
}

export interface MvpScoreInput {
  tasks: MvpTaskInput[];
  /** Số báo cáo ngày đã gửi trong tuần (đếm cả đã duyệt). */
  dailyReportsSubmitted: number;
  /** Leader còn phải nộp báo cáo tuần; null nếu không thuộc diện. */
  weeklyReportSubmitted: boolean | null;
  votesReceived: number;
  /** Số phiếu của người được bầu nhiều nhất trong kỳ (chuẩn hóa tương đối). */
  topVotes: number;
  review: { quality: number; proactive: number; teamwork: number } | null;
}

export interface MvpComponentResult {
  criterion: MvpCriterion;
  maxPoints: number;
  earnedPoints: number;
  formula: string;
  sourceData: Record<string, number | string | boolean | null>;
  isApplicable: boolean;
  notApplicableReason: string | null;
}

export interface MvpScoreResult {
  components: MvpComponentResult[];
  autoScore: number;
  reviewScore: number;
  voteScore: number;
  penaltyScore: number;
  totalScore: number;
  dataCompleteness: number;
  isEligible: boolean;
  ineligibleReason: string | null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function isDone(status: string) {
  return status === "done";
}

/** Tính toàn bộ bảng điểm của một nhân sự trong một kỳ. */
export function computeMvpScore(input: MvpScoreInput): MvpScoreResult {
  const committed = input.tasks.filter((task) => task.isCommitted);
  const totalWeight = committed.reduce((sum, task) => sum + task.weight, 0);
  const doneWeight = committed
    .filter((task) => isDone(task.status))
    .reduce((sum, task) => sum + task.weight, 0);

  const doneTasks = committed.filter((task) => isDone(task.status));
  const onTimeTasks = doneTasks.filter(
    (task) => task.completedAt !== null && task.completedAt <= task.deadline,
  );
  const overdueOpen = committed.filter(
    (task) => !isDone(task.status) && task.deadline < new Date().toISOString(),
  ).length;

  const components: MvpComponentResult[] = [];

  // 1. Khối lượng hoàn thành theo trọng số.
  const hasTasks = committed.length >= MVP_MIN_COMMITTED_TASKS && totalWeight > 0;
  components.push({
    criterion: "completion",
    maxPoints: MVP_CRITERION_MAX.completion,
    earnedPoints: hasTasks ? round1((doneWeight / totalWeight) * MVP_CRITERION_MAX.completion) : 0,
    formula: "Tổng trọng số việc hoàn thành ÷ tổng trọng số việc nhận × 30",
    sourceData: { doneWeight, totalWeight, taskCount: committed.length },
    isApplicable: hasTasks,
    notApplicableReason: hasTasks ? null : "Không có công việc được ghi nhận trong kỳ",
  });

  // 2. Đúng hạn.
  components.push({
    criterion: "on_time",
    maxPoints: MVP_CRITERION_MAX.on_time,
    earnedPoints:
      doneTasks.length > 0
        ? round1((onTimeTasks.length / doneTasks.length) * MVP_CRITERION_MAX.on_time)
        : 0,
    formula: "Số việc hoàn thành đúng hạn ÷ số việc hoàn thành × 20",
    sourceData: { onTime: onTimeTasks.length, done: doneTasks.length, overdueOpen },
    isApplicable: doneTasks.length > 0,
    notApplicableReason: doneTasks.length > 0 ? null : "Chưa hoàn thành công việc nào trong kỳ",
  });

  // 3. Kỷ luật báo cáo.
  const dailyRatio = Math.min(input.dailyReportsSubmitted / MVP_EXPECTED_DAILY_REPORTS, 1);
  const weeklyRatio = input.weeklyReportSubmitted === null ? null : input.weeklyReportSubmitted ? 1 : 0;
  const reportingRatio = weeklyRatio === null ? dailyRatio : dailyRatio * 0.7 + weeklyRatio * 0.3;
  components.push({
    criterion: "reporting",
    maxPoints: MVP_CRITERION_MAX.reporting,
    earnedPoints: round1(reportingRatio * MVP_CRITERION_MAX.reporting),
    formula:
      weeklyRatio === null
        ? "Số báo cáo ngày đã gửi ÷ 5 × 15"
        : "(Báo cáo ngày 70% + báo cáo tuần 30%) × 15",
    sourceData: {
      dailyReportsSubmitted: input.dailyReportsSubmitted,
      expectedDaily: MVP_EXPECTED_DAILY_REPORTS,
      weeklyReportSubmitted: input.weeklyReportSubmitted,
    },
    isApplicable: true,
    notApplicableReason: null,
  });

  // 4. Phiếu bầu đồng đội (chuẩn hóa theo người nhiều phiếu nhất).
  const voteApplicable = input.topVotes > 0;
  const votePoints = voteApplicable
    ? round1((input.votesReceived / input.topVotes) * MVP_CRITERION_MAX.vote)
    : 0;
  components.push({
    criterion: "vote",
    maxPoints: MVP_CRITERION_MAX.vote,
    earnedPoints: votePoints,
    formula: "Số phiếu nhận được ÷ số phiếu cao nhất kỳ × 10",
    sourceData: { votesReceived: input.votesReceived, topVotes: input.topVotes },
    isApplicable: voteApplicable,
    notApplicableReason: voteApplicable ? null : "Kỳ này chưa có phiếu bầu hợp lệ",
  });

  // 5–7. Đánh giá thực tế.
  const review = input.review;
  const reviewValues: Record<string, number> = {
    quality: review?.quality ?? 0,
    proactive: review?.proactive ?? 0,
    teamwork: review?.teamwork ?? 0,
  };
  for (const criterion of MVP_REVIEW_CRITERIA) {
    components.push({
      criterion,
      maxPoints: MVP_CRITERION_MAX[criterion],
      earnedPoints: round1(reviewValues[criterion] ?? 0),
      formula: "Đánh giá của người quản lý trực tiếp theo thang 5 mức",
      sourceData: { hasReview: review !== null },
      isApplicable: review !== null,
      notApplicableReason: review !== null ? null : "Chưa có đánh giá của người quản lý trực tiếp",
    });
  }

  const autoScore = round1(
    components
      .filter((c) => MVP_AUTO_CRITERIA.includes(c.criterion) && c.criterion !== "vote")
      .reduce((sum, c) => sum + c.earnedPoints, 0),
  );
  const voteScore = votePoints;
  const reviewScore = round1(
    components
      .filter((c) => MVP_REVIEW_CRITERIA.includes(c.criterion))
      .reduce((sum, c) => sum + c.earnedPoints, 0),
  );
  const penaltyScore = Math.min(overdueOpen * MVP_PENALTY_PER_OVERDUE, MVP_PENALTY_MAX);
  const totalScore = Math.max(0, round1(autoScore + voteScore + reviewScore - penaltyScore));

  const applicable = components.filter((c) => c.isApplicable);
  const dataCompleteness =
    Math.round(
      (applicable.reduce((sum, c) => sum + c.maxPoints, 0) / MVP_TOTAL_MAX) * 10000,
    ) / 100;

  let ineligibleReason: string | null = null;
  if (committed.length < MVP_MIN_COMMITTED_TASKS) {
    ineligibleReason = "Không có công việc được ghi nhận trong kỳ";
  } else if (dataCompleteness < MVP_MIN_COMPLETENESS) {
    ineligibleReason = `Dữ liệu mới đạt ${dataCompleteness}% (yêu cầu tối thiểu ${MVP_MIN_COMPLETENESS}%)`;
  }

  return {
    components,
    autoScore,
    reviewScore,
    voteScore,
    penaltyScore,
    totalScore,
    dataCompleteness,
    isEligible: ineligibleReason === null,
    ineligibleReason,
  };
}

/* ================= Chọn người nhận danh hiệu ================= */

export interface MvpAwardCandidate {
  userId: string;
  totalScore: number;
  isEligible: boolean;
  completionScore: number;
  onTimeScore: number;
  proactiveScore: number;
  teamworkScore: number;
  voteScore: number;
  votesReceived: number;
  previousTotal: number | null;
}

export interface MvpAwardProposal {
  awardType: MvpAwardType;
  recipientId: string | null;
  awardScore: number | null;
  reason: string;
}

function pickBest(
  candidates: MvpAwardCandidate[],
  metric: (candidate: MvpAwardCandidate) => number | null,
): { candidate: MvpAwardCandidate; value: number } | null {
  let best: { candidate: MvpAwardCandidate; value: number } | null = null;
  for (const candidate of candidates) {
    const value = metric(candidate);
    if (value === null || value <= 0) continue;
    if (!best || value > best.value) best = { candidate, value };
  }
  return best;
}

/**
 * Đề xuất người nhận từng danh hiệu.
 * Không đủ điều kiện thì để trống — hệ thống không trao danh hiệu lấy lệ.
 */
export function proposeMvpAwards(candidates: MvpAwardCandidate[]): MvpAwardProposal[] {
  const eligible = candidates.filter((candidate) => candidate.isEligible);

  const rules: {
    awardType: MvpAwardType;
    metric: (candidate: MvpAwardCandidate) => number | null;
    reason: (value: number) => string;
  }[] = [
    {
      awardType: "mvp",
      metric: (c) => c.totalScore,
      reason: (v) => `Tổng điểm cao nhất kỳ: ${round1(v)}/${MVP_TOTAL_MAX}`,
    },
    {
      awardType: "effective",
      metric: (c) => c.completionScore + c.onTimeScore,
      reason: (v) => `Điểm hoàn thành và đúng hạn cao nhất: ${round1(v)}/50`,
    },
    {
      awardType: "proactive",
      metric: (c) => c.proactiveScore,
      reason: (v) => `Điểm chủ động cao nhất: ${round1(v)}/10`,
    },
    {
      awardType: "teamwork",
      metric: (c) => c.teamworkScore + c.voteScore,
      reason: (v) => `Điểm đồng đội cộng phiếu bầu cao nhất: ${round1(v)}/15`,
    },
    {
      awardType: "progress",
      metric: (c) => (c.previousTotal === null ? null : c.totalScore - c.previousTotal),
      reason: (v) => `Tăng ${round1(v)} điểm so với kỳ trước`,
    },
    {
      awardType: "creative",
      metric: (c) => c.votesReceived,
      reason: (v) => `Nhận ${v} phiếu bầu của đồng đội`,
    },
  ];

  return rules.map((rule) => {
    const best = pickBest(eligible, rule.metric);
    if (!best) {
      return {
        awardType: rule.awardType,
        recipientId: null,
        awardScore: null,
        reason: "Không đủ dữ liệu hợp lệ để trao danh hiệu kỳ này",
      };
    }
    return {
      awardType: rule.awardType,
      recipientId: best.candidate.userId,
      awardScore: round1(best.value),
      reason: rule.reason(best.value),
    };
  });
}
