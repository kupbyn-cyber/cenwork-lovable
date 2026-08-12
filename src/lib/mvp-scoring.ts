import type { StatusTone } from "@/components/ui/status-badge";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M6 Bộ quy tắc chấm điểm MVP (thuần hàm, dùng chung UI + server).
 *
 * Cơ cấu 100 điểm:
 * - 65 điểm CEN Data + 10 điểm đồng đội (vote) = 75 điểm tự động.
 * - 20 điểm đánh giá của Leader/CMO (4 tiêu chí × 5).
 * - Tối đa +5 điểm bonus đóng góp đặc biệt sau khi CMO duyệt.
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
  IMPACT: "impact",
  TEAMWORK: "teamwork",
} as const;

export type MvpCriterion = (typeof MVP_CRITERIA)[keyof typeof MVP_CRITERIA];

export const MVP_CRITERION_MAX: Record<MvpCriterion, number> = {
  completion: 30,
  on_time: 20,
  reporting: 13,
  announcement: 2,
  vote: 10,
  quality: 5,
  proactive: 5,
  impact: 5,
  teamwork: 5,
};

export const MVP_CRITERION_LABEL: Record<MvpCriterion, string> = {
  completion: "Khối lượng hoàn thành",
  on_time: "Hoàn thành đúng hạn",
  reporting: "Kỷ luật báo cáo",
  announcement: "Xác nhận thông báo đúng hạn",
  vote: "Phiếu bầu đồng đội",
  quality: "Chất lượng đầu ra",
  proactive: "Chủ động / Trách nhiệm",
  impact: "Tác động đến kết quả chung",
  teamwork: "Phối hợp / Đồng đội",
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
export const MVP_REVIEW_CRITERIA: MvpCriterion[] = ["quality", "proactive", "impact", "teamwork"];


export const MVP_AUTO_MAX = MVP_AUTO_CRITERIA.reduce((sum, c) => sum + MVP_CRITERION_MAX[c], 0);
export const MVP_REVIEW_MAX = MVP_REVIEW_CRITERIA.reduce((sum, c) => sum + MVP_CRITERION_MAX[c], 0);
/** Bonus đóng góp đặc biệt: tối đa +5, chỉ cộng sau khi CMO duyệt. */
export const MVP_BONUS_MAX = 5;
export const MVP_BONUS_OPTIONS = [1, 2, 3] as const;
export type MvpBonusPoints = (typeof MVP_BONUS_OPTIONS)[number];
export type MvpBonusStatus = "pending" | "approved" | "rejected";

export const MVP_BONUS_STATUS_LABEL: Record<MvpBonusStatus, string> = {
  pending: "Chờ CMO duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export const MVP_BONUS_STATUS_TONE: Record<MvpBonusStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

export const MVP_TOTAL_MAX = MVP_AUTO_MAX + MVP_REVIEW_MAX + MVP_BONUS_MAX;

/** Ngưỡng đủ điều kiện xét Chiến binh MVP (điều kiện cần, không tự động trao). */
export const MVP_ELIGIBLE_THRESHOLD = 80;

/** Thang chấm tay: 6 mức cố định 0–5, không cho nhập số tự do. */
export const MVP_REVIEW_LEVELS = [0, 1, 2, 3, 4, 5] as const;
export type MvpReviewLevel = (typeof MVP_REVIEW_LEVELS)[number];

export const MVP_REVIEW_LEVEL_LABEL: Record<MvpReviewLevel, string> = {
  0: "Không đạt / không có cơ sở đánh giá",
  1: "Rất yếu",
  2: "Dưới kỳ vọng",
  3: "Đạt yêu cầu",
  4: "Tốt, có đóng góp rõ",
  5: "Xuất sắc, vượt kỳ vọng",
};

/** Điểm từ 4 trở lên bắt buộc nhập lý do đánh giá. */
export function requiresReason(value: number): boolean {
  return value >= 4;
}

/** Điểm 5 bắt buộc có ít nhất một bằng chứng/link dữ liệu liên quan. */
export function requiresEvidence(value: number): boolean {
  return value >= 5;
}

/* ================= Phạt và điều kiện hợp lệ ================= */

export const MVP_PENALTY_PER_OVERDUE = 2;
export const MVP_PENALTY_MAX = 10;
export const MVP_MIN_COMPLETENESS = 60;
export const MVP_MIN_COMMITTED_TASKS = 1;
/**
 * MVP-FIX-04 — Chỉ dùng khi hoàn toàn không xác định được nghĩa vụ báo cáo thực tế.
 * Nghĩa vụ chuẩn lấy từ report_obligations hoặc lịch làm việc thực tế của từng người.
 */
export const MVP_EXPECTED_DAILY_REPORTS = 5;
export const MVP_VOTE_MIN_REASON = 20;

/* ========= Nghĩa vụ báo cáo (nhóm Kỷ luật) ========= */

export const MVP_REPORTING_FORMULA_VERSION = "reporting-v2";

export type MvpReportKind = "daily" | "weekly";
export type MvpObligationState = "completed" | "missing" | "exempt";

/** Một nghĩa vụ báo cáo cụ thể của nhân sự trong kỳ. */
export interface MvpReportObligationInput {
  kind: MvpReportKind;
  /** Ngày/kỳ của nghĩa vụ, ví dụ `2026-08-10` hoặc `2026-W33`. */
  periodKey: string;
  dueAt: string | null;
  state: MvpObligationState;
  exemptReason?: string | null;
  /**
   * `obligation` = lấy từ report_obligations; `work_record` = ngày làm việc do
   * nhân sự xác nhận (WORKDAY-01); `derived` = suy từ lịch làm việc mặc định.
   */
  source: "obligation" | "derived" | "work_record";
  /** WORKDAY-01 — truy vết nguồn ngày làm việc cho phần Explainability. */
  workDay?: { status: "working" | "day_off"; shift: string | null } | null;
}

export interface MvpReportingSummary {
  version: string;
  required: number;
  completed: number;
  missing: number;
  exempt: number;
  ratio: number;
  score: number;
  isApplicable: boolean;
  notApplicableReason: string | null;
  byKind: Record<MvpReportKind, { required: number; completed: number; exempt: number }>;
  items: MvpReportObligationInput[];
  sources: string[];
}

/**
 * Chấm kỷ luật báo cáo theo nghĩa vụ thực tế.
 * Mẫu số = số nghĩa vụ hợp lệ (đã trừ miễn trừ), không dùng con số cứng.
 * Khi có cả báo cáo ngày và báo cáo tuần: ngày 70% + tuần 30% (giữ quy tắc cũ).
 */
export function evaluateReporting(
  items: MvpReportObligationInput[],
  maxPoints: number,
): MvpReportingSummary {
  const byKind: Record<MvpReportKind, { required: number; completed: number; exempt: number }> = {
    daily: { required: 0, completed: 0, exempt: 0 },
    weekly: { required: 0, completed: 0, exempt: 0 },
  };
  for (const item of items) {
    const bucket = byKind[item.kind];
    if (item.state === "exempt") {
      bucket.exempt += 1;
      continue;
    }
    bucket.required += 1;
    if (item.state === "completed") bucket.completed += 1;
  }

  const required = byKind.daily.required + byKind.weekly.required;
  const completed = byKind.daily.completed + byKind.weekly.completed;
  const exempt = byKind.daily.exempt + byKind.weekly.exempt;
  const dailyRatio = byKind.daily.required > 0 ? byKind.daily.completed / byKind.daily.required : null;
  const weeklyRatio =
    byKind.weekly.required > 0 ? byKind.weekly.completed / byKind.weekly.required : null;

  let ratio = 0;
  if (dailyRatio !== null && weeklyRatio !== null) ratio = dailyRatio * 0.7 + weeklyRatio * 0.3;
  else if (dailyRatio !== null) ratio = dailyRatio;
  else if (weeklyRatio !== null) ratio = weeklyRatio;

  const sources = Array.from(new Set(items.map((item) => item.source)));
  return {
    version: MVP_REPORTING_FORMULA_VERSION,
    required,
    completed,
    missing: required - completed,
    exempt,
    ratio: Math.round(ratio * 1000) / 1000,
    score: required > 0 ? Math.round(ratio * maxPoints * 10) / 10 : 0,
    isApplicable: required > 0,
    notApplicableReason:
      required > 0
        ? null
        : exempt > 0
          ? "Toàn bộ nghĩa vụ báo cáo trong kỳ đã được miễn trừ hợp lệ"
          : "Không có nghĩa vụ báo cáo trong kỳ",
    byKind,
    items,
    sources,
  };
}

/* ========= Xác nhận thông báo bắt buộc đúng hạn (nhóm Kỷ luật) ========= */

/** Phiên bản công thức — lưu kèm snapshot để truy vết khi kỳ đã khóa. */
export const MVP_ANNOUNCEMENT_FORMULA_VERSION = "announcement-v1";

/** Tối thiểu số giờ làm việc từ lúc nhận đến hạn thì thông báo mới được tính. */
export const MVP_ANNOUNCEMENT_MIN_WORK_HOURS = 4;

/** Giờ làm việc CEN: Thứ Hai–Thứ Sáu, 08:00–17:00 giờ Hà Nội. */
const WORK_DAY_START = 8;
const WORK_DAY_END = 17;
const HANOI_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Số giờ làm việc giữa hai mốc thời gian, theo múi giờ Hà Nội. */
export function workingHoursBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  const step = 15 * 60 * 1000;
  const capped = Math.min(to, from + 90 * 24 * 60 * 60 * 1000);
  let hours = 0;
  for (let t = from; t < capped; t += step) {
    const local = new Date(t + HANOI_OFFSET_MS);
    const day = local.getUTCDay();
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    if (day >= 1 && day <= 5 && hour >= WORK_DAY_START && hour < WORK_DAY_END) {
      hours += step / 3_600_000;
    }
  }
  return Math.round(hours * 100) / 100;
}

export type MvpAnnouncementBucket =
  | "on_time"
  | "late_12"
  | "late_24"
  | "late_48"
  | "missed"
  | "excluded";

export const MVP_ANNOUNCEMENT_BUCKET_LABEL: Record<MvpAnnouncementBucket, string> = {
  on_time: "Đúng hạn",
  late_12: "Trễ ≤ 12 giờ",
  late_24: "Trễ 12–24 giờ",
  late_48: "Trễ 24–48 giờ",
  missed: "Trễ > 48 giờ hoặc chưa xác nhận",
  excluded: "Không tính",
};

/** Hệ số theo số giờ trễ so với hạn xác nhận. */
export function announcementCoefficient(lateHours: number | null): {
  bucket: MvpAnnouncementBucket;
  coefficient: number;
} {
  if (lateHours === null) return { bucket: "missed", coefficient: 0 };
  if (lateHours <= 0) return { bucket: "on_time", coefficient: 1 };
  if (lateHours <= 12) return { bucket: "late_12", coefficient: 0.75 };
  if (lateHours <= 24) return { bucket: "late_24", coefficient: 0.5 };
  if (lateHours <= 48) return { bucket: "late_48", coefficient: 0.25 };
  return { bucket: "missed", coefficient: 0 };
}

/** Một bản ghi người nhận thông báo bắt buộc xác nhận trong kỳ. */
export interface MvpAnnouncementInput {
  announcementId: string;
  title: string;
  /** Hạn xác nhận của chính người nhận này. */
  dueAt: string | null;
  /** Thời điểm người nhận được đưa vào danh sách. */
  receivedAt: string | null;
  acknowledgedAt: string | null;
  isRevoked: boolean;
  /** Miễn trừ hợp lệ: nghỉ phép, lỗi hệ thống được Admin xác nhận… */
  isExempt: boolean;
  exemptReason: string | null;
  /**
   * Hạn bị đổi sau khi người nhận đã quá hạn theo hạn cũ.
   * Không loại khỏi mẫu số: vẫn chấm theo hạn lịch sử để giữ dấu vết trễ.
   */
  dueChangedAfterOverdue?: boolean;
  /** Hạn dùng để chấm (lấy từ lịch sử khi hạn bị đổi sau quá hạn). */
  gradingDueAt?: string | null;
}

export interface MvpAnnouncementEvaluation {
  announcementId: string;
  title: string;
  dueAt: string | null;
  acknowledgedAt: string | null;
  lateHours: number | null;
  coefficient: number | null;
  bucket: MvpAnnouncementBucket;
  excluded: boolean;
  excludeReason: string | null;
  /** Hạn thực tế đã dùng để chấm. */
  gradingDueAt?: string | null;
  dueChangedAfterOverdue?: boolean;
}

export interface MvpAnnouncementSummary {
  version: string;
  counted: number;
  excluded: number;
  onTime: number;
  late12: number;
  late24: number;
  late48: number;
  missed: number;
  coefficientSum: number;
  score: number;
  isApplicable: boolean;
  notApplicableReason: string | null;
  evaluations: MvpAnnouncementEvaluation[];
}

/**
 * Chấm điểm xác nhận thông báo: 2 × tổng hệ số ÷ số thông báo hợp lệ.
 * `lockAt` là mốc khóa kỳ — chưa xác nhận tính tới mốc này là hệ số 0.
 */
export function evaluateAnnouncements(
  items: MvpAnnouncementInput[],
  lockAt: string,
  maxPoints: number = MVP_CRITERION_MAX.announcement,
): MvpAnnouncementSummary {
  const evaluations: MvpAnnouncementEvaluation[] = items.map((item) => {
    // MVP-FIX-04 — Hạn chấm điểm: nếu hạn bị đổi sau khi đã quá hạn thì
    // giữ hạn lịch sử để không xóa dấu vết trễ.
    const gradingDue =
      item.dueChangedAfterOverdue && item.gradingDueAt ? item.gradingDueAt : item.dueAt;
    const base = {
      announcementId: item.announcementId,
      title: item.title,
      dueAt: item.dueAt,
      acknowledgedAt: item.acknowledgedAt,
      gradingDueAt: gradingDue,
      dueChangedAfterOverdue: Boolean(item.dueChangedAfterOverdue),
    };
    const exclude = (reason: string): MvpAnnouncementEvaluation => ({
      ...base,
      lateHours: null,
      coefficient: null,
      bucket: "excluded",
      excluded: true,
      excludeReason: reason,
    });

    if (item.isRevoked) return exclude("Thông báo đã bị thu hồi");
    if (item.isExempt) return exclude(item.exemptReason ?? "Được miễn trừ hợp lệ");
    if (!gradingDue || Number.isNaN(new Date(gradingDue).getTime())) {
      return exclude("Thiếu hoặc sai dữ liệu hạn xác nhận");
    }
    if (!item.receivedAt || Number.isNaN(new Date(item.receivedAt).getTime())) {
      return exclude("Thiếu hoặc sai dữ liệu thời điểm nhận");
    }
    if (new Date(item.receivedAt).getTime() > new Date(gradingDue).getTime()) {
      return exclude("Được thêm làm người nhận sau hạn xác nhận");
    }
    const workHours = workingHoursBetween(item.receivedAt, gradingDue);
    if (workHours < MVP_ANNOUNCEMENT_MIN_WORK_HOURS) {
      return exclude(`Chỉ có ${workHours} giờ làm việc để xử lý (tối thiểu ${MVP_ANNOUNCEMENT_MIN_WORK_HOURS})`);
    }

    const due = new Date(gradingDue).getTime();
    const ack =
      item.acknowledgedAt && !Number.isNaN(new Date(item.acknowledgedAt).getTime())
        ? new Date(item.acknowledgedAt).getTime()
        : null;
    if (ack === null) {
      const lockTime = new Date(lockAt).getTime();
      const lateHours = Math.max(0, (lockTime - due) / 3_600_000);
      const graded = announcementCoefficient(lateHours <= 0 ? null : lateHours);
      // Chưa xác nhận khi khóa kỳ: nếu vẫn còn hạn thì chưa tính là trễ.
      if (lateHours <= 0) {
        return exclude("Chưa tới hạn xác nhận tại thời điểm khóa kỳ");
      }
      return {
        ...base,
        lateHours: Math.round(lateHours * 10) / 10,
        coefficient: graded.coefficient,
        bucket: graded.bucket,
        excluded: false,
        excludeReason: null,
      };
    }

    const lateHours = (ack - due) / 3_600_000;
    const graded = announcementCoefficient(lateHours);
    return {
      ...base,
      lateHours: Math.round(lateHours * 10) / 10,
      coefficient: graded.coefficient,
      bucket: graded.bucket,
      excluded: false,
      excludeReason: null,
    };
  });

  const counted = evaluations.filter((row) => !row.excluded);
  const coefficientSum = counted.reduce((sum, row) => sum + (row.coefficient ?? 0), 0);
  const countBucket = (bucket: MvpAnnouncementBucket) =>
    counted.filter((row) => row.bucket === bucket).length;

  return {
    version: MVP_ANNOUNCEMENT_FORMULA_VERSION,
    counted: counted.length,
    excluded: evaluations.length - counted.length,
    onTime: countBucket("on_time"),
    late12: countBucket("late_12"),
    late24: countBucket("late_24"),
    late48: countBucket("late_48"),
    missed: countBucket("missed"),
    coefficientSum: Math.round(coefficientSum * 100) / 100,
    score:
      counted.length > 0
        ? Math.round((maxPoints * coefficientSum) / counted.length * 10) / 10
        : 0,
    isApplicable: counted.length > 0,
    notApplicableReason:
      counted.length > 0 ? null : "Không có thông báo bắt buộc xác nhận hợp lệ trong kỳ",
    evaluations,
  };
}

/* ================= Đầu vào và kết quả tính điểm ================= */

export interface MvpTaskInput {
  /** MVP-FIX-05 — truy vết: id/tên công việc dùng để tạo ra điểm. */
  taskId?: string;
  title?: string;
  weight: number;
  status: string;
  deadline: string;
  completedAt: string | null;
  isCommitted: boolean;
}

export interface MvpScoreInput {
  tasks: MvpTaskInput[];
  /** Nghĩa vụ báo cáo thực tế của nhân sự trong kỳ (đã trừ miễn trừ). */
  reportObligations?: MvpReportObligationInput[];
  votesReceived: number;
  /** Số phiếu của người được bầu nhiều nhất trong kỳ (chuẩn hóa tương đối). */
  topVotes: number;
  review: { quality: number; proactive: number; impact: number; teamwork: number } | null;
  /** Thông tin người đánh giá để giải thích 20 điểm Review. */
  reviewMeta?: {
    reviewerId: string | null;
    reviewerName: string | null;
    reason: string | null;
    evidence: string | null;
    submittedAt: string | null;
  } | null;
  /** Tổng bonus đóng góp đặc biệt ĐÃ được CMO duyệt (tối đa +5). */
  bonusScore?: number;
  /** Thông báo bắt buộc xác nhận gửi tới nhân sự trong kỳ. */
  announcements?: MvpAnnouncementInput[];
  /** Mốc khóa kỳ dùng để chấm thông báo chưa xác nhận. */
  announcementLockAt?: string;
}

export interface MvpComponentResult {
  criterion: MvpCriterion;
  maxPoints: number;
  earnedPoints: number;
  formula: string;
  sourceData: Record<string, unknown>;
  isApplicable: boolean;
  notApplicableReason: string | null;
  /**
   * `ok` = có nghĩa vụ và có dữ liệu; `missing` = có nghĩa vụ nhưng chưa có dữ liệu;
   * `not_applicable` = không có nghĩa vụ hợp lệ (không làm giảm độ đầy đủ dữ liệu).
   */
  dataState?: "ok" | "missing" | "not_applicable";
}


export interface MvpScoreResult {
  components: MvpComponentResult[];
  autoScore: number;
  reviewScore: number;
  voteScore: number;
  bonusScore: number;
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
  const nowIso = new Date().toISOString();
  const overdueOpenTasks = committed.filter(
    (task) => !isDone(task.status) && task.deadline < nowIso,
  );
  const overdueOpen = overdueOpenTasks.length;

  /** MVP-FIX-05 — mô tả một công việc trong source_data để đối soát bằng tay. */
  const describeTask = (task: MvpTaskInput) => {
    const done = isDone(task.status);
    const onTime = done && task.completedAt !== null && task.completedAt <= task.deadline;
    const lateHours =
      done && task.completedAt !== null && task.completedAt > task.deadline
        ? Math.round(
            ((new Date(task.completedAt).getTime() - new Date(task.deadline).getTime()) /
              3_600_000) *
              10,
          ) / 10
        : null;
    return {
      task_id: task.taskId ?? null,
      title: task.title ?? null,
      weight: task.weight,
      status: task.status,
      completed_at: task.completedAt,
      deadline_snapshot: task.deadline,
      is_completed: done,
      on_time: done ? onTime : null,
      late_hours: lateHours,
      included: true,
      warning:
        done && task.completedAt === null
          ? "Công việc đã hoàn thành nhưng thiếu mốc hoàn thành"
          : !task.deadline
            ? "Ảnh chụp thiếu hạn hoàn thành"
            : null,
    };
  };

  const components: MvpComponentResult[] = [];

  // 1. Khối lượng hoàn thành theo trọng số.
  const hasTasks = committed.length >= MVP_MIN_COMMITTED_TASKS && totalWeight > 0;
  const completionRatio = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 1000) / 1000 : 0;
  components.push({
    criterion: "completion",
    maxPoints: MVP_CRITERION_MAX.completion,
    earnedPoints: hasTasks ? round1((doneWeight / totalWeight) * MVP_CRITERION_MAX.completion) : 0,
    formula: "Tổng trọng số việc hoàn thành ÷ tổng trọng số việc nhận × 30",
    sourceData: {
      taskCount: committed.length,
      totalWeight,
      completedTaskCount: doneTasks.length,
      completedWeight: doneWeight,
      doneWeight,
      ratio: completionRatio,
      earnedPoints: hasTasks
        ? round1((doneWeight / totalWeight) * MVP_CRITERION_MAX.completion)
        : 0,
      maxPoints: MVP_CRITERION_MAX.completion,
      items: committed.map(describeTask),
    },
    isApplicable: hasTasks,
    notApplicableReason: hasTasks ? null : "Không có công việc được ghi nhận trong kỳ",
    dataState: hasTasks ? "ok" : "not_applicable",
  });

  // 2. Đúng hạn.
  const onTimeWeight = onTimeTasks.reduce((sum, task) => sum + task.weight, 0);
  const lateWeight = doneWeight - onTimeWeight;
  components.push({
    criterion: "on_time",
    maxPoints: MVP_CRITERION_MAX.on_time,
    earnedPoints:
      doneTasks.length > 0
        ? round1((onTimeTasks.length / doneTasks.length) * MVP_CRITERION_MAX.on_time)
        : 0,
    formula: "Số việc hoàn thành đúng hạn ÷ số việc hoàn thành × 20",
    sourceData: {
      onTime: onTimeTasks.length,
      done: doneTasks.length,
      ratio:
        doneTasks.length > 0 ? Math.round((onTimeTasks.length / doneTasks.length) * 1000) / 1000 : 0,
      completedWeight: doneWeight,
      onTimeWeight,
      lateWeight,
      earnedPoints:
        doneTasks.length > 0
          ? round1((onTimeTasks.length / doneTasks.length) * MVP_CRITERION_MAX.on_time)
          : 0,
      maxPoints: MVP_CRITERION_MAX.on_time,
      items: doneTasks.map(describeTask),
      overdueOpen,
      penaltyPerOverdue: MVP_PENALTY_PER_OVERDUE,
      penaltyPoints: Math.min(overdueOpen * MVP_PENALTY_PER_OVERDUE, MVP_PENALTY_MAX),
      penaltyItems: overdueOpenTasks.map((task) => ({
        task_id: task.taskId ?? null,
        title: task.title ?? null,
        weight: task.weight,
        deadline_snapshot: task.deadline,
        status: task.status,
        reason: "Chưa hoàn thành sau hạn",
        penalty: MVP_PENALTY_PER_OVERDUE,
      })),
    },
    isApplicable: doneTasks.length > 0,
    notApplicableReason: doneTasks.length > 0 ? null : "Chưa hoàn thành công việc nào trong kỳ",
    dataState: doneTasks.length > 0 ? "ok" : committed.length > 0 ? "missing" : "not_applicable",
  });

  // 3. Nhóm Kỷ luật (15 điểm): báo cáo + xác nhận thông báo bắt buộc.
  // Chấm cả hai trước để biết phần nào không áp dụng và phân bổ lại trong nhóm.
  const announcementLockAt = input.announcementLockAt ?? new Date().toISOString();
  const announcementSummary = evaluateAnnouncements(
    input.announcements ?? [],
    announcementLockAt,
    MVP_CRITERION_MAX.announcement,
  );
  const obligations = input.reportObligations ?? [];
  const reportingProbe = evaluateReporting(obligations, MVP_CRITERION_MAX.reporting);

  // Phân bổ lại trong nhóm Kỷ luật (tổng 15) khi một thành phần không áp dụng.
  const reportingMax = reportingProbe.isApplicable
    ? announcementSummary.isApplicable
      ? MVP_CRITERION_MAX.reporting
      : MVP_DISCIPLINE_MAX
    : 0;
  const announcementMax = announcementSummary.isApplicable
    ? reportingProbe.isApplicable
      ? MVP_CRITERION_MAX.announcement
      : MVP_DISCIPLINE_MAX
    : 0;

  const reportingSummary = evaluateReporting(obligations, reportingMax);
  const announcementScore = announcementSummary.isApplicable
    ? round1((announcementMax * announcementSummary.coefficientSum) / announcementSummary.counted)
    : 0;

  components.push({
    criterion: "reporting",
    maxPoints: reportingMax,
    earnedPoints: reportingSummary.isApplicable ? reportingSummary.score : 0,
    formula: reportingSummary.isApplicable
      ? `Số nghĩa vụ báo cáo hoàn thành ÷ tổng nghĩa vụ hợp lệ × ${reportingMax}` +
        (reportingSummary.byKind.weekly.required > 0 && reportingSummary.byKind.daily.required > 0
          ? " (ngày 70% + tuần 30%)"
          : "")
      : "Không có nghĩa vụ báo cáo hợp lệ trong kỳ",
    sourceData: {
      version: reportingSummary.version,
      obligationCount: reportingSummary.required,
      completed: reportingSummary.completed,
      missing: reportingSummary.missing,
      exempt: reportingSummary.exempt,
      ratio: reportingSummary.ratio,
      byKind: reportingSummary.byKind,
      sources: reportingSummary.sources,
      items: reportingSummary.items,
      redistributedFromAnnouncement: reportingMax > MVP_CRITERION_MAX.reporting,
    },
    isApplicable: reportingSummary.isApplicable,
    notApplicableReason: reportingSummary.notApplicableReason,
    dataState: reportingSummary.isApplicable ? "ok" : "not_applicable",
  });

  // 3b. Xác nhận thông báo bắt buộc đúng hạn.
  components.push({
    criterion: "announcement",
    maxPoints: announcementMax,
    earnedPoints: announcementScore,
    formula: `${announcementMax} × tổng hệ số ÷ số thông báo hợp lệ (đúng hạn 1 · trễ ≤12h 0.75 · ≤24h 0.5 · ≤48h 0.25 · >48h hoặc chưa xác nhận 0)`,
    sourceData: {
      version: announcementSummary.version,
      counted: announcementSummary.counted,
      excluded: announcementSummary.excluded,
      onTime: announcementSummary.onTime,
      late12: announcementSummary.late12,
      late24: announcementSummary.late24,
      late48: announcementSummary.late48,
      missed: announcementSummary.missed,
      coefficientSum: announcementSummary.coefficientSum,
      lockedAt: announcementLockAt,
      countedIds: announcementSummary.evaluations
        .filter((row) => !row.excluded)
        .map((row) => row.announcementId),
      excludedIds: announcementSummary.evaluations
        .filter((row) => row.excluded)
        .map((row) => ({ id: row.announcementId, reason: row.excludeReason })),
      items: announcementSummary.evaluations,
    },
    isApplicable: announcementSummary.isApplicable,
    notApplicableReason: announcementSummary.notApplicableReason,
    dataState: announcementSummary.isApplicable ? "ok" : "not_applicable",
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
    sourceData: {
      votesReceived: input.votesReceived,
      topVotes: input.topVotes,
      ratio: voteApplicable ? Math.round((input.votesReceived / input.topVotes) * 1000) / 1000 : 0,
      earnedPoints: votePoints,
      maxPoints: MVP_CRITERION_MAX.vote,
      anonymous: true,
    },
    isApplicable: voteApplicable,
    notApplicableReason: voteApplicable ? null : "Kỳ này chưa có phiếu bầu hợp lệ",
    dataState: voteApplicable ? "ok" : "missing",
  });

  // 5–7. Đánh giá thực tế.
  const review = input.review;
  const reviewValues: Record<string, number> = {
    quality: review?.quality ?? 0,
    proactive: review?.proactive ?? 0,
    impact: review?.impact ?? 0,
    teamwork: review?.teamwork ?? 0,
  };
  for (const criterion of MVP_REVIEW_CRITERIA) {
    components.push({
      criterion,
      maxPoints: MVP_CRITERION_MAX[criterion],
      earnedPoints: round1(reviewValues[criterion] ?? 0),
      formula: "Đánh giá của người quản lý trực tiếp theo thang 0–5",
      sourceData: {
        hasReview: review !== null,
        score: round1(reviewValues[criterion] ?? 0),
        maxPoints: MVP_CRITERION_MAX[criterion],
        reviewerId: input.reviewMeta?.reviewerId ?? null,
        reviewerName: input.reviewMeta?.reviewerName ?? null,
        reason: input.reviewMeta?.reason ?? null,
        evidence: input.reviewMeta?.evidence ?? null,
        submittedAt: input.reviewMeta?.submittedAt ?? null,
      },
      isApplicable: review !== null,
      notApplicableReason: review !== null ? null : "Chưa có đánh giá của người quản lý trực tiếp",
      dataState: review !== null ? "ok" : "missing",
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
  // Bonus chỉ nhận phần đã được CMO duyệt và bị chặn trần +5.
  const bonusScore = Math.min(Math.max(input.bonusScore ?? 0, 0), MVP_BONUS_MAX);
  const totalScore = Math.max(
    0,
    Math.min(MVP_TOTAL_MAX, round1(autoScore + voteScore + reviewScore + bonusScore - penaltyScore)),
  );

  /**
   * MVP-FIX-04 — Độ đầy đủ dữ liệu chỉ xét các tiêu chí thực sự áp dụng.
   * `not_applicable` (không có nghĩa vụ hợp lệ) bị loại khỏi cả tử số và mẫu số,
   * khác với `missing` (có nghĩa vụ nhưng chưa có dữ liệu) vẫn làm giảm độ đầy đủ.
   */
  const stateOf = (c: MvpComponentResult) =>
    c.dataState ?? (c.isApplicable ? "ok" : "missing");
  const counting = components.filter((c) => stateOf(c) !== "not_applicable");
  const completenessBase = counting.reduce((sum, c) => sum + c.maxPoints, 0);
  const dataCompleteness =
    completenessBase > 0
      ? Math.round(
          (counting
            .filter((c) => stateOf(c) === "ok")
            .reduce((sum, c) => sum + c.maxPoints, 0) /
            completenessBase) *
            10000,
        ) / 100
      : 0;

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
    bonusScore,
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
      reason: (v) => `Điểm chủ động cao nhất: ${round1(v)}/${MVP_CRITERION_MAX.proactive}`,
    },
    {
      awardType: "teamwork",
      metric: (c) => c.teamworkScore + c.voteScore,
      reason: (v) =>
        `Điểm đồng đội cộng phiếu bầu cao nhất: ${round1(v)}/${MVP_CRITERION_MAX.teamwork + MVP_CRITERION_MAX.vote}`,
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
    // Danh hiệu MVP (Chiến binh MVP) chỉ đề xuất khi đạt ngưỡng tối thiểu.
    const pool =
      rule.awardType === "mvp"
        ? eligible.filter((candidate) => candidate.totalScore >= MVP_ELIGIBLE_THRESHOLD)
        : eligible;
    const best = pickBest(pool, rule.metric);
    if (!best) {
      return {
        awardType: rule.awardType,
        recipientId: null,
        awardScore: null,
        reason:
          rule.awardType === "mvp"
            ? `Chưa có nhân sự đạt tối thiểu ${MVP_ELIGIBLE_THRESHOLD} điểm để trao Chiến binh MVP`
            : "Không đủ dữ liệu hợp lệ để trao danh hiệu kỳ này",
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
