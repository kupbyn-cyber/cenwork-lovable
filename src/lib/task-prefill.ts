import type { PersonOption, ProjectRow } from "@/lib/project-data";
import { isProjectApproved } from "@/lib/project-data";
import type { TaskPriority } from "@/lib/task-data";
import { NO_PROJECT, type TaskFilterState } from "@/lib/task-view-data";

/**
 * CEN 1.0 — TASK-SUBMIT-CONTEXT-FILTER-01
 * Chuyển bộ lọc danh sách Công việc thành giá trị tự điền cho form tạo Task.
 * Chỉ lấy các giá trị đơn trị và hợp lệ; không tự điền trạng thái/kết quả/người duyệt.
 */
export interface TaskPrefill {
  projectId: string | null;
  assigneeId: string | null;
  teamId: string | null;
  deadlineDate: string | null;
  startDate: string | null;
  priority: TaskPriority | null;
  /** Nhãn hiển thị cho dòng "Đã áp dụng từ bộ lọc hiện tại". */
  labels: string[];
}

export const EMPTY_PREFILL: TaskPrefill = {
  projectId: null,
  assigneeId: null,
  teamId: null,
  deadlineDate: null,
  startDate: null,
  priority: null,
  labels: [],
};

const single = (list: string[]) => (list.length === 1 ? list[0]! : null);

export function buildTaskPrefill(
  filters: TaskFilterState,
  projects: ProjectRow[],
  people: PersonOption[],
  teams: { id: string; name: string }[],
): TaskPrefill {
  const labels: string[] = [];

  // Dự án: chỉ khi chọn đúng 1 dự án thật, còn hợp lệ (đã duyệt, chưa lưu trữ).
  const projectId = single(filters.project);
  const project =
    projectId && projectId !== NO_PROJECT
      ? (projects.find(
          (item) => item.id === projectId && isProjectApproved(item) && item.status !== "archived",
        ) ?? null)
      : null;
  if (project) labels.push(project.name);

  // Người phụ trách: chỉ khi chọn đúng 1 người còn hoạt động trong phạm vi nhìn thấy.
  const assigneeId = single(filters.assignee);
  const person = assigneeId ? (people.find((item) => item.id === assigneeId) ?? null) : null;
  if (person) labels.push(person.display_name);

  const teamId = single(filters.team);
  const team = teamId ? (teams.find((item) => item.id === teamId) ?? null) : null;
  if (team) labels.push(`Team ${team.name}`);

  // Deadline: chỉ dùng khi khoảng lọc xác định một mốc duy nhất.
  const from = filters.deadlineFrom || null;
  const to = filters.deadlineTo || null;
  const deadlineDate = to ?? from;
  const usableDeadline = !from || !to || from === to ? deadlineDate : null;
  if (usableDeadline) labels.push(`Deadline ${usableDeadline}`);

  const startDate =
    filters.createdFrom && (!filters.createdTo || filters.createdTo === filters.createdFrom)
      ? filters.createdFrom
      : null;

  const priorityValue = single(filters.priority);
  const priority =
    priorityValue === "high" || priorityValue === "medium" || priorityValue === "low"
      ? priorityValue
      : null;

  return {
    projectId: project?.id ?? null,
    assigneeId: person?.id ?? null,
    teamId: team?.id ?? null,
    deadlineDate: usableDeadline,
    startDate,
    priority,
    labels,
  };
}

export function hasPrefill(prefill: TaskPrefill | null | undefined): boolean {
  if (!prefill) return false;
  return Boolean(
    prefill.projectId ||
    prefill.assigneeId ||
    prefill.teamId ||
    prefill.deadlineDate ||
    prefill.startDate ||
    prefill.priority,
  );
}
