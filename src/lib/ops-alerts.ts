/**
 * TODAY-ALERTS-01 — kiểu dữ liệu cho widget "Cảnh báo cần chú ý" (điều hành).
 * File thuần: chỉ định nghĩa ngưỡng và kiểu; không truy cập database.
 * Không tạo Business Rule mới cho Task/Project — chỉ đọc dữ liệu sẵn có.
 */
export type OpsAlertKind =
  | "person_overdue"
  | "person_overload"
  | "team_imbalance"
  | "task_rework"
  | "project_stale"
  | "person_idle";

/** Thứ tự ưu tiên đã chốt (số nhỏ = ưu tiên cao). */
export const OPS_ALERT_SEVERITY: Record<OpsAlertKind, number> = {
  person_overdue: 1,
  person_overload: 2,
  team_imbalance: 3,
  task_rework: 4,
  project_stale: 5,
  person_idle: 6,
};

/** Ngưỡng cố định theo yêu cầu. */
export const OVERDUE_MIN = 3;
export const OVERLOAD_MIN_OPEN = 8;
export const OVERLOAD_RATIO = 1.5;
export const TEAM_MIN_SIZE_FOR_AVG = 3;
export const IMBALANCE_HIGH = 8;
export const IMBALANCE_LOW = 2;
export const IMBALANCE_GAP = 5;
export const REWORK_MIN = 3;
export const PROJECT_STALE_DAYS = 7;
export const OPS_ALERT_VISIBLE = 4;

export interface OpsAlert {
  id: string;
  kind: OpsAlertKind;
  severity: number;
  /** Tên nhân sự / Team / Task / Project. */
  subject: string;
  /** Mô tả ngắn nguyên nhân. */
  detail: string;
  /** Team liên quan (nếu xác định được) — dùng cho KPI "Team cần chú ý". */
  team_id?: string | null;
  /** Số lượng hoặc mức chênh lệch liên quan. */
  magnitude: number;
  /** true = cảnh báo trạng thái hiện tại (không đổi theo bộ lọc). */
  current: boolean;
  /** Mốc tồn tại (ISO) để so sánh khi cùng loại và cùng mức. */
  since: string | null;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}

export interface OpsAlertsResult {
  alerts: OpsAlert[];
  failedSources: string[];
  generated_at: string;
}

export function sortOpsAlerts(alerts: OpsAlert[]): OpsAlert[] {
  return [...alerts].sort(
    (a, b) =>
      a.severity - b.severity ||
      b.magnitude - a.magnitude ||
      (a.since ?? "9999").localeCompare(b.since ?? "9999"),
  );
}
