import { hanoiStartOfDayMs } from "@/lib/datetime";
import { formatHanoiDate } from "@/lib/datetime";
import type { TaskRow } from "@/lib/task-data";

/**
 * CEN 1.0 — Tổng hợp Báo cáo ngày từ dữ liệu Task thật.
 *
 * Quy ước nghiệp vụ:
 * - Chỉ lấy Task mà người gửi đang là người phụ trách (assignee) và chưa lưu trữ.
 * - Ba nhóm loại trừ lẫn nhau, xét theo thứ tự: Hoàn thành → Quá hạn → Còn chờ.
 * - "Hoàn thành" chỉ tính trạng thái hoàn thành cuối cùng (`done`) và được ghi
 *   nhận trong ngày báo cáo (theo giờ Hà Nội). Trạng thái `review` KHÔNG tính.
 * - Không đổi trạng thái Task, không tạo dữ liệu Task mới.
 */
export interface DailySummaryGroups {
  completed: TaskRow[];
  overdue: TaskRow[];
  pending: TaskRow[];
}

export interface DailySummary extends DailySummaryGroups {
  reportDate: string;
  authorName: string;
  teamName: string;
  total: number;
}

export function buildDailySummary(
  tasks: TaskRow[],
  options: {
    userId: string;
    reportDate: string;
    authorName: string;
    teamName: string;
    now?: number;
  },
): DailySummary {
  const { userId, reportDate, authorName, teamName } = options;
  const now = options.now ?? Date.now();
  const dayStart = hanoiStartOfDayMs(reportDate);
  const dayEnd = dayStart === null ? null : dayStart + 24 * 60 * 60 * 1000;

  const completed: TaskRow[] = [];
  const overdue: TaskRow[] = [];
  const pending: TaskRow[] = [];

  for (const task of tasks) {
    if (task.assignee_id !== userId) continue;

    if (task.status === "done") {
      // Hoàn thành cuối cùng và được ghi nhận trong đúng ngày báo cáo.
      const doneAt = new Date(task.updated_at).getTime();
      if (
        dayStart !== null &&
        dayEnd !== null &&
        !Number.isNaN(doneAt) &&
        doneAt >= dayStart &&
        doneAt < dayEnd
      ) {
        completed.push(task);
      }
      continue;
    }

    if (task.is_archived) continue;

    const deadline = new Date(task.deadline).getTime();
    if (!Number.isNaN(deadline) && deadline < now) {
      overdue.push(task);
      continue;
    }
    pending.push(task);
  }

  const byDeadline = (a: TaskRow, b: TaskRow) => a.deadline.localeCompare(b.deadline);
  completed.sort(byDeadline);
  overdue.sort(byDeadline);
  pending.sort(byDeadline);

  return {
    reportDate,
    authorName,
    teamName,
    completed,
    overdue,
    pending,
    total: completed.length + overdue.length + pending.length,
  };
}

/** Một nhóm dạng văn bản: tiêu đề, đánh số lại từ 1, rỗng thì "Không có". */
export function formatGroup(title: string, tasks: TaskRow[]): string {
  const header = `${title} (${tasks.length})`;
  if (tasks.length === 0) return `${header}\nKhông có`;
  return `${header}\n${tasks.map((task, index) => `${index + 1}. ${task.name}`).join("\n")}`;
}

export const GROUP_TITLE = {
  completed: "✅ HOÀN THÀNH",
  overdue: "⚠️ QUÁ HẠN",
  pending: "⏳ CÒN CHỜ",
} as const;

/** Bản xem trước đầy đủ (cũng là nội dung hiển thị cho người gửi kiểm tra). */
export function formatDailySummaryText(summary: DailySummary): string {
  return [
    `📋 BÁO CÁO NGÀY ${formatHanoiDate(summary.reportDate)}`,
    `👤 ${summary.authorName} | ${summary.teamName}`,
    "",
    formatGroup(GROUP_TITLE.completed, summary.completed),
    "",
    formatGroup(GROUP_TITLE.overdue, summary.overdue),
    "",
    formatGroup(GROUP_TITLE.pending, summary.pending),
  ].join("\n");
}

/**
 * Snapshot lưu vào bảng `daily_reports` hiện có:
 * mỗi nhóm giữ nguyên danh sách và số lượng tại thời điểm gửi,
 * nên lịch sử báo cáo không đổi khi Task được sửa về sau.
 */
export function summaryToReportContent(summary: DailySummary) {
  return {
    results: formatGroup(GROUP_TITLE.completed, summary.completed),
    blockers: formatGroup(GROUP_TITLE.overdue, summary.overdue),
    nextPlan: formatGroup(GROUP_TITLE.pending, summary.pending),
  };
}
