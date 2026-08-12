/**
 * CEN TODAY-03 — kiểu dữ liệu cho phần cá nhân hóa Trang chủ theo vai trò.
 * File thuần (không truy cập database) để server function và UI dùng chung.
 * Không tạo Business Rule mới: mọi con số đều suy ra từ bảng gốc của module.
 */

/** Ngưỡng "Team cần chú ý" theo yêu cầu CEN TODAY-03. */
export const TEAM_ATTENTION_MIN_OVERDUE = 3;
export const TEAM_ATTENTION_OVERDUE_RATIO = 0.2;
/** Số Team tối đa hiển thị cho CMO. */
export const TEAM_ATTENTION_LIMIT = 5;

export interface PersonBrief {
  id: string;
  name: string;
}

export interface TaskBrief {
  id: string;
  name: string;
  assignee: string;
  deadline: string;
}

/** Góc nhìn cá nhân (mọi vai trò đều có). */
export interface MyFocus {
  open_tasks: number;
  overdue_tasks: number;
  due_today: number;
  done_this_week: number;
  recognitions_received_week: number;
}

/** Góc nhìn Leader: sức khỏe Team mình phụ trách. */
export interface TeamFocus {
  team_id: string;
  team_name: string;
  member_count: number;
  open_tasks: number;
  overdue_tasks: number;
  /** Thành viên chưa gửi báo cáo ngày hôm nay. */
  missing_daily: PersonBrief[];
  pending_reviews: number;
  top_overdue: TaskBrief[];
}

/** Một Team trong danh sách "cần chú ý" của CMO. */
export interface TeamAttention {
  team_id: string;
  team_name: string;
  leader_name: string | null;
  open_tasks: number;
  overdue_tasks: number;
  overdue_ratio: number;
  missing_daily: number;
  reason: string;
}

/** Góc nhìn CMO: sức khỏe marketing toàn hệ thống. */
export interface MarketingFocus {
  teams_attention: TeamAttention[];
  total_teams: number;
  projects_awaiting_decision: number;
  projects_overdue: number;
  overdue_tasks: number;
  daily_report_rate: number;
}

/** Góc nhìn Admin: tình trạng vận hành kỹ thuật. */
export interface SystemFocus {
  locked_accounts: number;
  members_without_team: number;
  telegram_unlinked: number;
  telegram_failed: number;
  outbox_pending: number;
  outbox_failed: number;
  announcements_overdue: number;
}

/**
 * PERF-02 — chỉ số tổng hợp cho KPI/widget Trang chủ.
 * Tính tại server theo đúng công thức cũ của `buildTodayMetrics`
 * để Trang chủ không phải tải full danh sách Task/Dự án/Báo cáo.
 */
export interface TodayScopeMetrics {
  open_count: number;
  active_projects: number;
  due_in_range_count: number;
  overdue_count: number;
  completed_in_range_count: number;
  pending_report_count: number;
}

/** Số báo cáo đang chờ duyệt trong phạm vi thời gian đang chọn. */
export interface ReportPulse {
  pending_daily: number;
  pending_weekly: number;
}

export interface TodayInsights {
  role: "admin" | "cmo" | "leader" | "member" | null;
  display_name: string | null;
  metrics: TodayScopeMetrics;
  reports: ReportPulse;
  me: MyFocus;
  team: TeamFocus | null;
  marketing: MarketingFocus | null;
  system: SystemFocus | null;
  failedSources: string[];
  generated_at: string;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
