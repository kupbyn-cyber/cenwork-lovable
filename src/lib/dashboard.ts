/**
 * DASH-CORE-01 — kiểu dữ liệu và quy ước dùng chung cho Dashboard hiệu suất.
 *
 * Một khung dữ liệu duy nhất cho Admin/CMO, Leader và Member.
 * Khác biệt giữa vai trò chỉ nằm ở phạm vi dữ liệu, bộ KPI và khối phân tích.
 * Không tạo điểm hiệu suất tổng hợp, không xếp hạng Team hay nhân sự.
 */
import { toPeriod, type PerfPeriod, type PerfPreset } from "@/lib/performance";

export type DashScope = "org" | "team" | "member";
export type DashPreset = PerfPreset;
export type DashTone = "default" | "success" | "warning" | "danger";

/** Điều hướng sang trang chức năng đã lọc sẵn (Dashboard không thao tác dữ liệu). */
export interface DrillTarget {
  to: string;
  search?: Record<string, string>;
  params?: Record<string, string>;
}

export interface DashKpi {
  key: string;
  label: string;
  hint: string;
  value: string;
  sub?: string | null;
  /** Chỉ KPI quan trọng mới có so sánh kỳ trước. */
  compare?: string | null;
  tone?: DashTone;
  drill?: DrillTarget | null;
}

export interface DashTrendPoint {
  key: string;
  label: string;
  completion_rate: number | null;
  on_time_rate: number | null;
  done: number;
  violated: number;
}

export interface DashAttentionItem {
  id: string;
  title: string;
  meta: string;
  kind: "overdue" | "due" | "review" | "changes_requested";
  tone: DashTone;
  drill: DrillTarget;
}

export interface DashTeamRow {
  team_id: string;
  team_name: string;
  members: number;
  tasks: number;
  open_tasks: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  overdue_rate: number | null;
  changes_requested: number;
  needs_attention: boolean;
  attention_reasons: string[];
}

export interface DashMemberRow {
  user_id: string;
  display_name: string;
  open_tasks: number;
  overdue: number;
  on_time_rate: number | null;
  changes_requested: number;
  late_reports: number;
  load: "under" | "balanced" | "over";
}

export interface DashProjectRow {
  id: string;
  name: string;
  team_name: string | null;
  done: number;
  total: number;
  progress: number | null;
  overdue_tasks: number;
  stale_days: number | null;
}

export interface DashReportStatus {
  required: number;
  submitted: number;
  on_time: number;
  late_or_missing: number;
  /** Chưa nộp và đã qua hạn (không gồm báo cáo nộp muộn). */
  missing: number;
  pending_review: number;
}

export interface DashQuality {
  status: "ok" | "historical_data_incomplete";
  changes_requested: number;
  first_pass_tasks: number;
  evaluated_tasks: number;
  first_pass_rate: number | null;
}

export interface DashTeamAverage {
  status: "ok" | "insufficient_team_size" | "no_team";
  team_size: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  completed_tasks: number | null;
  open_tasks: number | null;
}

export interface DashPersonal {
  completion_rate: number | null;
  on_time_rate: number | null;
  completed_tasks: number;
  open_tasks: number;
  overdue: number;
  review: number;
}

export interface DashWorkloadSlice {
  team_id: string;
  team_name: string;
  open_tasks: number;
  share: number | null;
}

export interface DashOpsAlert {
  id: string;
  subject: string;
  detail: string;
  drill: DrillTarget;
}

export interface DashboardData {
  scope: DashScope;
  role: string | null;
  viewer_id: string;
  period: PerfPeriod;
  previous: PerfPeriod;
  granularity: "day" | "week" | "month";
  teams: Array<{ id: string; name: string }>;
  selected_team_id: string | null;
  kpis: DashKpi[];
  trend: DashTrendPoint[];
  attention: DashAttentionItem[];
  team_rows: DashTeamRow[] | null;
  member_rows: DashMemberRow[] | null;
  projects: DashProjectRow[] | null;
  workload: DashWorkloadSlice[] | null;
  reports: DashReportStatus | null;
  quality: DashQuality | null;
  personal: DashPersonal | null;
  team_average: DashTeamAverage | null;
  ops_alerts: DashOpsAlert[] | null;
  unavailable: string[];
  generated_at: string;
}

export const DASH_HINT = {
  completion_rate:
    "Task có deadline trong kỳ và đã hoàn thành trước khi kỳ kết thúc, chia tổng Task hợp lệ có deadline trong kỳ. Task không có deadline không được tính.",
  on_time_rate:
    "Task hoàn thành không sau deadline, chia tổng Task hoàn thành có deadline và hoàn thành trong kỳ.",
  overdue_now: "Task đã qua deadline và chưa hoàn thành tại thời điểm xem.",
  violated:
    "Task có deadline trong kỳ và hoàn thành sau deadline, hoặc đã qua deadline mà chưa hoàn thành.",
  teams_attention:
    "Số Team khác nhau đang có ít nhất một cảnh báo điều hành hợp lệ (quá hạn, quá tải, phân bổ mất cân đối, dự án đình trệ).",
  due_in_range: "Task hợp lệ có deadline nằm trong khoảng thời gian đang chọn.",
  awaiting_review: "Task đang ở trạng thái Chờ kiểm tra trong phạm vi Team.",
  overload:
    "Nhân sự có từ 8 Task đang mở và cao hơn ít nhất 50% mức trung bình Team. Team dưới 3 người hoạt động chỉ dùng ngưỡng 8 Task.",
  reports_missing: "Nghĩa vụ báo cáo có hạn nộp trong kỳ nhưng chưa được gửi.",
  member_on_time: "Task cá nhân hoàn thành không sau deadline trong kỳ.",
  member_review: "Task cá nhân đang chờ kiểm tra.",
  changes_requested:
    "Số lần Task bị yêu cầu sửa, đếm từ sự kiện phê duyệt chính thức (changes_requested), không tính bình luận.",
  first_pass:
    "Task có quyết định kiểm tra đầu tiên là duyệt và trước đó không có yêu cầu sửa. Dữ liệu cũ thiếu lịch sử được loại khỏi mẫu số.",
  open_tasks: "Task đang mở: Chưa bắt đầu, Đang thực hiện hoặc Chờ kiểm tra.",
  project_progress: "Task hoàn thành chia tổng Task hợp lệ của Dự án.",
} as const;

export const DASH_PRESET_LABEL: Record<DashPreset, string> = {
  today: "Hôm nay",
  week: "Tuần",
  month: "Tháng",
  custom: "Khoảng ngày",
};

export function periodOf(from: string, to: string): PerfPeriod {
  return toPeriod({ from, to });
}

export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

export function deltaLabel(
  current: number | null,
  previous: number | null,
  kind: "rate" | "count",
): string {
  if (current === null || previous === null) return "Kỳ trước: —";
  const diff = current - previous;
  if (kind === "rate") {
    const pts = Math.round(diff * 100);
    return `Kỳ trước ${formatRate(previous)} · ${pts > 0 ? "+" : ""}${pts} điểm`;
  }
  return `Kỳ trước ${previous} · ${diff > 0 ? "+" : ""}${diff}`;
}
