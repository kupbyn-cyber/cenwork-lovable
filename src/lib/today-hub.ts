/**
 * CEN TODAY-01 — kiểu dữ liệu và nhãn dùng chung cho Daily Action Hub.
 * File thuần (không truy cập database) để cả server function và UI cùng dùng.
 * Không chứa Business Rule mới: mọi mục việc đều suy ra từ dữ liệu module gốc.
 */

export type ActionModule =
  | "announcement"
  | "approval"
  | "task"
  | "project"
  | "daily_report"
  | "weekly_report";

export type ActionPriority = "critical" | "high" | "medium" | "low";

/** Lý do một mục xuất hiện trong hub. Thứ tự trọng số quyết định mức ưu tiên. */
export type ActionReason =
  | "announcement_overdue"
  | "approval_overdue"
  | "changes_requested"
  | "awaiting_my_approval"
  | "task_overdue"
  | "report_due"
  | "task_due_soon"
  | "announcement_pending"
  | "mention";

export const ACTION_REASON_WEIGHT: Record<ActionReason, number> = {
  announcement_overdue: 100,
  approval_overdue: 95,
  changes_requested: 90,
  awaiting_my_approval: 80,
  task_overdue: 70,
  report_due: 60,
  task_due_soon: 50,
  announcement_pending: 40,
  mention: 30,
};

export const ACTION_REASON_LABEL: Record<ActionReason, string> = {
  announcement_overdue: "Thông báo quá hạn",
  approval_overdue: "Phê duyệt quá hạn",
  changes_requested: "Bị yêu cầu chỉnh sửa",
  awaiting_my_approval: "Chờ bạn duyệt",
  task_overdue: "Quá hạn",
  report_due: "Đến hạn báo cáo",
  task_due_soon: "Sắp đến hạn",
  announcement_pending: "Chưa xác nhận",
  mention: "Nhắc tên / trả lời",
};

export const ACTION_REASON_TONE: Record<
  ActionReason,
  "neutral" | "progress" | "success" | "warning" | "error"
> = {
  announcement_overdue: "error",
  approval_overdue: "error",
  changes_requested: "error",
  awaiting_my_approval: "warning",
  task_overdue: "error",
  report_due: "warning",
  task_due_soon: "warning",
  announcement_pending: "progress",
  mention: "neutral",
};

export const ACTION_MODULE_LABEL: Record<ActionModule, string> = {
  announcement: "Thông báo nội bộ",
  approval: "Phê duyệt",
  task: "Công việc",
  project: "Dự án",
  daily_report: "Báo cáo ngày",
  weekly_report: "Báo cáo tuần",
};

/** Hành động nhanh an toàn — chỉ tái dùng handler sẵn có của module gốc. */
export type QuickActionKind =
  | "open"
  | "acknowledge_announcement"
  | "complete_task"
  | "submit_daily_report"
  | "open_review";

export interface ActionItem {
  /** Khóa gộp: module + object_id (không trùng lặp giữa các nguồn). */
  key: string;
  module: ActionModule;
  object_id: string;
  title: string;
  summary: string | null;
  reasons: ActionReason[];
  priority: ActionPriority;
  weight: number;
  /** Hạn xử lý (ISO) nếu nguồn dữ liệu có hạn. */
  deadline: string | null;
  created_at: string;
  target_route: string;
  quick_action: QuickActionKind;
}

export interface TodayHubResult {
  items: ActionItem[];
  total: number;
  /** Đếm theo mức ưu tiên để hiển thị tổng quan. */
  counts: Record<ActionPriority, number>;
  /** Nguồn dữ liệu lỗi (hiển thị Error State riêng, không chặn phần còn lại). */
  failedSources: string[];
  generated_at: string;
}

export function priorityOfWeight(weight: number): ActionPriority {
  if (weight >= 90) return "critical";
  if (weight >= 70) return "high";
  if (weight >= 40) return "medium";
  return "low";
}

export const PRIORITY_LABEL: Record<ActionPriority, string> = {
  critical: "Khẩn cấp",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

/** Gộp các mục cùng module + object_id, giữ lý do có trọng số cao nhất làm gốc. */
export function mergeActionItems(rows: ActionItem[]): ActionItem[] {
  const map = new Map<string, ActionItem>();
  for (const row of rows) {
    const current = map.get(row.key);
    if (!current) {
      map.set(row.key, { ...row, reasons: [...row.reasons] });
      continue;
    }
    const reasons = Array.from(new Set([...current.reasons, ...row.reasons]));
    const base = row.weight > current.weight ? row : current;
    const deadline =
      current.deadline && row.deadline
        ? new Date(current.deadline) < new Date(row.deadline)
          ? current.deadline
          : row.deadline
        : (current.deadline ?? row.deadline);
    map.set(row.key, {
      ...base,
      reasons: reasons.sort((a, b) => ACTION_REASON_WEIGHT[b] - ACTION_REASON_WEIGHT[a]),
      deadline,
      weight: Math.max(current.weight, row.weight),
      priority: priorityOfWeight(Math.max(current.weight, row.weight)),
    });
  }
  return [...map.values()].sort(compareActionItems);
}

/** Ưu tiên cao trước → hạn gần trước → mới tạo trước. */
export function compareActionItems(a: ActionItem, b: ActionItem): number {
  if (a.weight !== b.weight) return b.weight - a.weight;
  if (a.deadline && b.deadline) {
    const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (diff !== 0) return diff;
  } else if (a.deadline !== b.deadline) {
    return a.deadline ? -1 : 1;
  }
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function emptyHub(): TodayHubResult {
  return {
    items: [],
    total: 0,
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
    failedSources: [],
    generated_at: new Date().toISOString(),
  };
}
