/**
 * PERFORMANCE — kiểu dữ liệu và quy tắc thời gian dùng chung cho Dashboard hiệu suất.
 *
 * Nguyên tắc:
 * - Không tạo điểm hiệu suất tổng, không xếp hạng nhân sự.
 * - Mọi con số tính từ dữ liệu nguồn (Task, Report, Recognition, MVP), không lưu bảng tổng hợp.
 * - Ngày giờ nghiệp vụ theo Asia/Ho_Chi_Minh.
 */

export const PERF_TZ = "Asia/Ho_Chi_Minh";
const DAY_MS = 86_400_000;

export type PerfPreset = "today" | "week" | "month" | "custom";

export interface PerfRange {
  /** yyyy-MM-dd (giờ Hà Nội), bao gồm cả hai đầu. */
  from: string;
  to: string;
}

export interface PerfPeriod extends PerfRange {
  /** ISO UTC của 00:00 ngày `from` (giờ Hà Nội). */
  startISO: string;
  /** ISO UTC của 00:00 ngày kế tiếp `to` (giờ Hà Nội) — mốc kết thúc mở. */
  endISO: string;
  days: number;
}

/** yyyy-MM-dd hôm nay theo giờ Hà Nội. */
export function hanoiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PERF_TZ }).format(now);
}

function dayToUtcMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+07:00`).getTime();
}

export function addDays(dateStr: string, days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PERF_TZ }).format(
    new Date(dayToUtcMs(dateStr) + days * DAY_MS),
  );
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayToUtcMs(to) - dayToUtcMs(from)) / DAY_MS) + 1;
}

/** Thứ Hai của tuần chứa `dateStr` (giờ Hà Nội). */
export function weekStart(dateStr: string): string {
  const d = new Date(dayToUtcMs(dateStr));
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(dateStr, -dow);
}

export function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function presetRange(preset: PerfPreset, today = hanoiToday()): PerfRange {
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: monthStart(today), to: today };
  if (preset === "week") return { from: weekStart(today), to: today };
  return { from: weekStart(today), to: today };
}

export function toPeriod(range: PerfRange): PerfPeriod {
  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;
  return {
    from,
    to,
    startISO: new Date(dayToUtcMs(from)).toISOString(),
    endISO: new Date(dayToUtcMs(to) + DAY_MS).toISOString(),
    days: daysBetween(from, to),
  };
}

/** Kỳ liền trước có cùng độ dài. */
export function previousPeriod(period: PerfPeriod): PerfPeriod {
  const to = addDays(period.from, -1);
  const from = addDays(to, -(period.days - 1));
  return toPeriod({ from, to });
}

export function ratio(part: number, total: number): number | null {
  if (total <= 0) return null;
  return part / total;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 24) return `${value.toFixed(1)} giờ`;
  return `${(value / 24).toFixed(1)} ngày`;
}

/* ------------------------------ Kiểu dữ liệu ------------------------------ */

export interface WorkloadMetrics {
  /** Task người dùng là người phụ trách chính (assignee). */
  primary: number;
  /** Task tham gia phối hợp (task_participants), không trùng với phụ trách chính. */
  collaborating: number;
  not_started: number;
  in_progress: number;
  review: number;
  done: number;
  /** Chưa hoàn thành và đã qua deadline. */
  overdue: number;
  /** Hoàn thành sau deadline. */
  late_done: number;
  /** Deadline trước kỳ và tới nay vẫn chưa hoàn thành. */
  carried_over: number;
  /** Số Project khác nhau mà nhân sự có Task trong kỳ. */
  projects: number;
}

export interface EfficiencyMetrics {
  completion_rate: number | null;
  on_time_rate: number | null;
  overdue_rate: number | null;
  /** Giờ trung bình từ lúc tạo Task đến lúc hoàn thành (chỉ khi đủ timestamps). */
  avg_completion_hours: number | null;
}

export interface QualityMetrics {
  /** Task đi thẳng từ "Chờ kiểm tra" sang "Hoàn thành", không bị trả lại. */
  approved_direct: number;
  /** Task từng bị chuyển ngược khỏi "Chờ kiểm tra". */
  reworked_tasks: number;
  /** Tổng số lần bị yêu cầu sửa. */
  rework_events: number;
  rework_rate: number | null;
}

export interface ReportMetrics {
  required: number;
  submitted: number;
  on_time: number;
  late_or_missing: number;
  revision_required: number;
  /** Báo cáo tuần của Team (chỉ tính cho phạm vi Team). */
  weekly_team: number;
}

export interface RecognitionMetrics {
  received: number;
  categories: Array<{ key: string; label: string; count: number }>;
  votes_received: number;
  awards: string[];
}

export interface PersonPerformance {
  user_id: string;
  display_name: string;
  job_title: string | null;
  team_id: string | null;
  team_name: string | null;
  is_self: boolean;
  workload: WorkloadMetrics;
  efficiency: EfficiencyMetrics;
  /** null khi người xem không được phép xem chỉ số chất lượng chi tiết. */
  quality: QualityMetrics | null;
  /** null khi người xem không được phép xem dữ liệu báo cáo muộn/thiếu. */
  reports: ReportMetrics | null;
  recognition: RecognitionMetrics;
}

export interface TeamPerformance {
  team_id: string;
  team_name: string;
  leader_name: string | null;
  members: number;
  workload: WorkloadMetrics;
  efficiency: EfficiencyMetrics;
  reports: ReportMetrics | null;
}

export interface TrendPoint {
  /** yyyy-MM-dd (giờ Hà Nội). */
  date: string;
  done: number;
  late_done: number;
  created: number;
  due: number;
}

export interface PerfTotals {
  workload: WorkloadMetrics;
  efficiency: EfficiencyMetrics;
  reports: ReportMetrics | null;
}

export interface PerfAlert {
  id: string;
  kind: "overdue" | "workload" | "reports";
  title: string;
  detail: string;
}

export type PerfScope = "org" | "team" | "self_team";

export interface PerformanceDashboard {
  scope: PerfScope;
  role: string | null;
  viewer_id: string;
  period: PerfPeriod;
  previous: PerfPeriod;
  /** Team người xem được phép chọn. */
  teams: Array<{ id: string; name: string }>;
  people: PersonPerformance[];
  team_details: TeamPerformance[];
  totals: PerfTotals;
  previous_totals: PerfTotals;
  trend: TrendPoint[];
  alerts: PerfAlert[];
  /** Nguồn dữ liệu không đọc được (thiếu quyền hoặc lỗi) — UI báo giới hạn dữ liệu. */
  unavailable: string[];
}

export const RECOGNITION_CATEGORY_LABEL: Record<string, string> = {
  support: "Hỗ trợ",
  quality: "Chất lượng",
  speed: "Tốc độ",
  initiative: "Chủ động",
  teamwork: "Phối hợp",
};

export const METRIC_TOOLTIP = {
  primary: "Số Task nhân sự là người phụ trách chính, có phát sinh trong kỳ (tạo, tới hạn hoặc hoàn thành trong kỳ). Không tính Task đã hủy hoặc lưu trữ.",
  collaborating:
    "Số Task nhân sự tham gia phối hợp (không phải người phụ trách chính). Thống kê riêng, không cộng vào Task phụ trách chính.",
  not_started: "Task hợp lệ trong kỳ đang ở trạng thái Chưa bắt đầu.",
  in_progress: "Task hợp lệ trong kỳ đang ở trạng thái Đang thực hiện.",
  review: "Task hợp lệ trong kỳ đang ở trạng thái Chờ kiểm tra.",
  done: "Task hợp lệ trong kỳ đã ở trạng thái Hoàn thành.",
  overdue: "Task chưa hoàn thành và thời điểm hiện tại đã qua deadline.",
  late_done: "Task hoàn thành sau deadline. Đã hoàn thành nên không còn tính là đang quá hạn.",
  carried_over: "Task có deadline trước ngày bắt đầu kỳ và tới nay vẫn chưa hoàn thành.",
  projects: "Số Project khác nhau có Task của nhân sự trong kỳ.",
  completion_rate: "Task hoàn thành chia tổng Task hợp lệ trong kỳ (phụ trách chính).",
  on_time_rate: "Task hoàn thành không sau deadline chia tổng Task hoàn thành trong kỳ.",
  overdue_rate: "Task chưa hoàn thành và đã qua deadline chia tổng Task hợp lệ trong kỳ.",
  avg_completion_hours:
    "Trung bình khoảng thời gian từ lúc tạo Task đến lúc hoàn thành, chỉ tính Task có đủ hai mốc thời gian.",
  approved_direct: "Task chuyển từ Chờ kiểm tra sang Hoàn thành mà không bị trả lại lần nào.",
  reworked_tasks: "Task từng bị chuyển ngược khỏi trạng thái Chờ kiểm tra (yêu cầu sửa).",
  rework_events: "Tổng số lần Task bị chuyển ngược khỏi Chờ kiểm tra trong kỳ.",
  rework_rate: "Task bị yêu cầu sửa chia tổng Task từng vào Chờ kiểm tra trong kỳ.",
  reports_required: "Số nghĩa vụ báo cáo có hạn nộp rơi trong kỳ, không tính trường hợp được miễn.",
  reports_submitted: "Nghĩa vụ báo cáo đã được gửi ít nhất một lần.",
  reports_on_time: "Nghĩa vụ báo cáo được gửi và không bị đánh dấu trễ.",
  reports_late: "Nghĩa vụ báo cáo gửi trễ hoặc chưa gửi khi đã qua hạn.",
  reports_revision: "Báo cáo đang ở trạng thái cần chỉnh sửa theo yêu cầu người kiểm tra.",
  reports_weekly: "Báo cáo tuần của Team có hạn nộp trong kỳ.",
  recognition_received: "Số lời ghi nhận nhận được trong kỳ (đã loại các ghi nhận bị thu hồi).",
  votes_received: "Số lượt bình chọn đồng đội hợp lệ nhận được trong kỳ MVP.",
  awards: "Danh hiệu MVP đã công bố.",
} as const;
