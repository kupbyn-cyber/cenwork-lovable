import type { ActionItem } from "@/lib/today-hub";
import type { ProjectRow } from "@/lib/project-data";
import type { DailyReportRow, WeeklyReportRow } from "@/lib/report-data";
import type { TaskRow } from "@/lib/task-data";
import { isProjectApproved } from "@/lib/project-data";
import { isTaskOverdue } from "@/lib/task-data";
import { inRange, RANGE_PHRASE, type RangeBounds, type TodayRange } from "@/lib/today-range";

/**
 * TODAY-RESET-01 — quy đổi dữ liệu module gốc thành chỉ số hiển thị của Dashboard.
 * Chỉ lọc/đếm trên dữ liệu đã được RLS trả về; không thêm Business Rule mới.
 */
export type TodayViewRole = "admin" | "leader" | "member";

export interface TodayScope {
  role: TodayViewRole;
  userId: string | null;
  leaderTeamId: string | null;
}

const ACTIVE_PROJECT_STATUSES = ["planning", "in_progress", "pending_acceptance"] as const;

function isOpenTask(task: TaskRow) {
  return !task.is_archived && task.status !== "done";
}

/** Lọc công việc theo phạm vi quyền hiển thị của vai trò. */
export function scopeTasks(tasks: TaskRow[], scope: TodayScope): TaskRow[] {
  const rows = tasks.filter((task) => !task.is_archived);
  if (scope.role === "member") return rows.filter((task) => task.assignee_id === scope.userId);
  if (scope.role === "leader" && scope.leaderTeamId) {
    return rows.filter(
      (task) =>
        task.team_id === scope.leaderTeamId || task.assigneeTeamId === scope.leaderTeamId,
    );
  }
  return rows;
}

export function scopeProjects(projects: ProjectRow[], scope: TodayScope): ProjectRow[] {
  if (scope.role === "leader" && scope.leaderTeamId) {
    return projects.filter(
      (project) =>
        project.responsible_team_id === scope.leaderTeamId || project.owner_id === scope.userId,
    );
  }
  if (scope.role === "member") {
    return projects.filter((project) => project.owner_id === scope.userId);
  }
  return projects;
}

/** Mục cần xử lý nằm trong phạm vi: quá hạn, không hạn, hoặc có hạn trước khi phạm vi kết thúc. */
export function scopeActionItems(items: ActionItem[], bounds: RangeBounds): ActionItem[] {
  const now = Date.now();
  return items.filter((item) => {
    if (!item.deadline) return true;
    const time = new Date(item.deadline).getTime();
    if (Number.isNaN(time)) return true;
    return time < now || time < bounds.end;
  });
}

export interface TodayMetrics {
  open_count: number;
  active_projects: number;
  pending_action_count: number;
  due_in_range_count: number;
  overdue_count: number;
  completed_in_range_count: number;
  pending_report_count: number;
}

export function buildTodayMetrics(input: {
  scope: TodayScope;
  bounds: RangeBounds;
  tasks: TaskRow[];
  projects: ProjectRow[];
  dailies: DailyReportRow[];
  weeklies: WeeklyReportRow[];
  actionItems: ActionItem[];
  todayDate: string;
}): TodayMetrics {
  const { scope, bounds, todayDate } = input;
  const tasks = scopeTasks(input.tasks, scope);
  const projects = scopeProjects(input.projects, scope);

  const open = tasks.filter(isOpenTask);
  const overdue = open.filter(isTaskOverdue);
  const dueInRange = open.filter((task) => inRange(task.deadline, bounds));
  const completedInRange = tasks.filter(
    (task) => task.status === "done" && inRange(task.completed_at, bounds),
  );
  const activeProjects = projects.filter(
    (project) =>
      ACTIVE_PROJECT_STATUSES.includes(project.status as (typeof ACTIVE_PROJECT_STATUSES)[number]) &&
      isProjectApproved(project),
  );

  let pendingReports = 0;
  if (scope.role === "member") {
    const mine = input.dailies.find(
      (row) => row.author_id === scope.userId && row.report_date === todayDate,
    );
    pendingReports = !mine || mine.status === "draft" || mine.status === "changes_requested" ? 1 : 0;
  } else {
    pendingReports =
      input.dailies.filter((row) => row.status === "submitted" && inRange(row.report_date, bounds))
        .length +
      input.weeklies.filter(
        (row) => row.status === "submitted" && inRange(row.submitted_at ?? null, bounds),
      ).length;
  }

  return {
    open_count: open.length,
    active_projects: activeProjects.length,
    pending_action_count: input.actionItems.length,
    due_in_range_count: dueInRange.length,
    overdue_count: overdue.length,
    completed_in_range_count: completedInRange.length,
    pending_report_count: pendingReports,
  };
}

/**
 * Câu nhắc cố định theo bộ quy tắc — không dùng AI, không dữ liệu giả.
 * Thứ tự ưu tiên: quá hạn → chờ xử lý → đến hạn → báo cáo → đã hoàn thành → không khẩn cấp.
 */
export function buildTodayPrompt(metrics: TodayMetrics, range: TodayRange): string {
  const phrase = RANGE_PHRASE[range];
  if (metrics.overdue_count > 0) {
    return `Có ${metrics.overdue_count} công việc đang quá hạn. Hãy bắt đầu từ việc ảnh hưởng lớn nhất để nhanh chóng lấy lại nhịp.`;
  }
  if (metrics.pending_action_count > 0) {
    return `Bạn có ${metrics.pending_action_count} nội dung cần xử lý ${phrase}. Hoàn thành từng việc một, mọi thứ sẽ trở nên nhẹ nhàng hơn.`;
  }
  if (metrics.due_in_range_count > 0) {
    return `Có ${metrics.due_in_range_count} công việc đến hạn ${phrase}. Chủ động sắp xếp sớm để luôn kiểm soát tiến độ.`;
  }
  if (metrics.pending_report_count > 0) {
    return `Còn ${metrics.pending_report_count} báo cáo chưa hoàn tất ${phrase}. Gửi sớm để cả nhóm cùng nắm tiến độ.`;
  }
  if (metrics.completed_in_range_count > 0) {
    return `Bạn đã hoàn thành ${metrics.completed_in_range_count} công việc ${phrase}. Một giai đoạn làm việc rất hiệu quả — tiếp tục phát huy nhé!`;
  }
  return `Không có nội dung khẩn cấp trong ${phrase}. Đây là thời điểm tốt để chuẩn bị trước cho những việc tiếp theo.`;
}