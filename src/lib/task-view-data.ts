import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Json } from "@/integrations/supabase/types";
import { isPastInstant } from "@/lib/datetime";
import {
  canManageTask,
  isTaskArchived,
  isTaskOverdue,
  type TaskAccessContext,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "@/lib/task-data";

/**
 * CEN 1.0 — M3.x Trang Công việc dạng danh sách phẳng.
 * Chỉ phục vụ hiển thị: lọc/sắp xếp/chế độ xem cá nhân.
 * Không đổi Business Rule Task; phạm vi dữ liệu vẫn do RLS quyết định.
 */

export const ALL = "__all__";
export const NO_PROJECT = "__standalone__";

export type TaskSortKey =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "deadline_asc"
  | "deadline_desc"
  | "priority_desc";

export const TASK_SORT_LABEL: Record<TaskSortKey, string> = {
  created_desc: "Mới tạo nhất",
  created_asc: "Cũ nhất",
  updated_desc: "Cập nhật gần nhất",
  deadline_asc: "Deadline gần nhất",
  deadline_desc: "Deadline xa nhất",
  priority_desc: "Ưu tiên cao nhất",
};

export const TASK_SORT_ORDER: TaskSortKey[] = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "deadline_asc",
  "deadline_desc",
  "priority_desc",
];

export type TaskKindFilter =
  "all" | "project" | "standalone" | "with_deadline" | "no_deadline" | "overdue";

export const TASK_KIND_LABEL: Record<TaskKindFilter, string> = {
  all: "Tất cả loại công việc",
  project: "Thuộc Dự án",
  standalone: "Công việc độc lập",
  with_deadline: "Có deadline",
  no_deadline: "Không có deadline",
  overdue: "Đang quá hạn",
};

export interface TaskFilterState {
  search: string;
  /** Đa chọn: rỗng nghĩa là không lọc theo trường này. OR trong cùng trường, AND giữa các trường. */
  status: string[];
  assignee: string[];
  project: string[];
  team: string[];
  priority: string[];
  kind: TaskKindFilter;
  deadlineFrom: string;
  deadlineTo: string;
  createdFrom: string;
  createdTo: string;
  creator: string;
  mine: boolean;
  createdByMe: boolean;
  needsMe: boolean;
  /** Quick filter "Của tôi" — mọi nội dung liên quan trực tiếp tới người dùng. */
  related: boolean;
}

export const EMPTY_FILTERS: TaskFilterState = {
  search: "",
  status: [],
  assignee: [],
  project: [],
  team: [],
  priority: [],
  kind: "all",
  deadlineFrom: "",
  deadlineTo: "",
  createdFrom: "",
  createdTo: "",
  creator: ALL,
  mine: false,
  createdByMe: false,
  needsMe: false,
  related: false,
};

export const OPTIONAL_COLUMNS = [
  "project",
  "assignee",
  "team",
  "deadline",
  "priority",
  "status",
] as const;
export type OptionalColumnId = (typeof OPTIONAL_COLUMNS)[number];

export const COLUMN_LABEL: Record<OptionalColumnId, string> = {
  project: "Dự án",
  assignee: "Người phụ trách",
  team: "Team",
  deadline: "Deadline",
  priority: "Mức ưu tiên",
  status: "Trạng thái",
};

/** Mặc định ẩn cột Ưu tiên (vẫn giữ dữ liệu, bộ lọc và bật lại trong "Cột hiển thị"). */
export const DEFAULT_COLUMNS: OptionalColumnId[] = OPTIONAL_COLUMNS.filter(
  (id) => id !== "priority",
);

export function hasActiveFilters(filters: TaskFilterState) {
  return (
    filters.search.trim() !== "" ||
    filters.status.length > 0 ||
    filters.assignee.length > 0 ||
    filters.project.length > 0 ||
    filters.team.length > 0 ||
    filters.priority.length > 0 ||
    filters.kind !== "all" ||
    filters.deadlineFrom !== "" ||
    filters.deadlineTo !== "" ||
    filters.createdFrom !== "" ||
    filters.createdTo !== "" ||
    filters.creator !== ALL ||
    filters.mine ||
    filters.createdByMe ||
    filters.needsMe ||
    filters.related
  );
}

export function countAdvancedFilters(filters: TaskFilterState) {
  let n = 0;
  if (filters.priority.length > 0) n += 1;
  if (filters.kind !== "all") n += 1;
  if (filters.deadlineFrom || filters.deadlineTo) n += 1;
  if (filters.createdFrom || filters.createdTo) n += 1;
  if (filters.creator !== ALL) n += 1;
  if (filters.mine) n += 1;
  if (filters.createdByMe) n += 1;
  if (filters.needsMe) n += 1;
  return n;
}

/**
 * "Task cần tôi xử lý" chỉ dựa trên workflow hiện hành:
 * việc tôi phụ trách chưa hoàn thành, hoặc việc đang Chờ kiểm tra mà tôi có quyền quản lý.
 */
function needsAttention(task: TaskRow, ctx: TaskAccessContext) {
  if (task.status === "done") return false;
  if (ctx.userId && task.assignee_id === ctx.userId) return true;
  return task.status === "review" && canManageTask(task, ctx);
}

function inDateRange(value: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

export function filterTasks(
  tasks: TaskRow[],
  filters: TaskFilterState,
  view: "active" | "archived",
  ctx: TaskAccessContext,
  isRelated?: (task: TaskRow) => boolean,
): TaskRow[] {
  const keyword = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (isTaskArchived(task) !== (view === "archived")) return false;
    if (keyword && !task.name.toLowerCase().includes(keyword)) return false;
    // OR trong cùng một trường, AND giữa các trường.
    if (filters.status.length > 0 && !filters.status.includes(task.status)) return false;
    if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) return false;
    if (
      filters.assignee.length > 0 &&
      !(task.assignee_id && filters.assignee.includes(task.assignee_id))
    )
      return false;
    if (filters.creator !== ALL && task.created_by !== filters.creator) return false;
    if (filters.project.length > 0) {
      const matched = task.project_id
        ? filters.project.includes(task.project_id)
        : filters.project.includes(NO_PROJECT);
      if (!matched) return false;
    }
    if (filters.team.length > 0 && !(task.team_id && filters.team.includes(task.team_id)))
      return false;

    switch (filters.kind) {
      case "project":
        if (!task.project_id) return false;
        break;
      case "standalone":
        if (task.project_id) return false;
        break;
      case "with_deadline":
        if (!task.deadline) return false;
        break;
      case "no_deadline":
        if (task.deadline) return false;
        break;
      case "overdue":
        // Dùng đúng định nghĩa quá hạn hiện hành: deadline đã qua và chưa hoàn thành cuối cùng.
        if (!isTaskOverdue(task)) return false;
        break;
      default:
        break;
    }

    if (!inDateRange(task.deadline, filters.deadlineFrom, filters.deadlineTo)) return false;
    if (!inDateRange(task.created_at, filters.createdFrom, filters.createdTo)) return false;
    if (filters.mine && !(ctx.userId && task.assignee_id === ctx.userId)) return false;
    if (filters.createdByMe && !(ctx.userId && task.created_by === ctx.userId)) return false;
    if (filters.needsMe && !needsAttention(task, ctx)) return false;
    if (filters.related) {
      const related = isRelated
        ? isRelated(task)
        : Boolean(ctx.userId && task.assignee_id === ctx.userId);
      if (!related) return false;
    }
    return true;
  });
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 };

function time(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function sortTasks(tasks: TaskRow[], sort: TaskSortKey): TaskRow[] {
  const list = [...tasks];
  const createdDesc = (a: TaskRow, b: TaskRow) =>
    (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0);
  switch (sort) {
    case "created_asc":
      return list.sort((a, b) => (time(a.created_at) ?? 0) - (time(b.created_at) ?? 0));
    case "updated_desc":
      return list.sort((a, b) => (time(b.updated_at) ?? 0) - (time(a.updated_at) ?? 0));
    case "deadline_asc":
    case "deadline_desc": {
      const dir = sort === "deadline_asc" ? 1 : -1;
      return list.sort((a, b) => {
        const da = time(a.deadline);
        const db = time(b.deadline);
        // Task không có deadline luôn xếp sau.
        if (da === null && db === null) return createdDesc(a, b);
        if (da === null) return 1;
        if (db === null) return -1;
        return (da - db) * dir || createdDesc(a, b);
      });
    }
    case "priority_desc":
      return list.sort(
        (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || createdDesc(a, b),
      );
    case "created_desc":
    default:
      return list.sort(createdDesc);
  }
}

export function isOverdueNow(deadline: string | null) {
  return Boolean(deadline) && isPastInstant(deadline!);
}

/* ================= Chế độ xem cá nhân ================= */

export interface SavedView {
  id: string;
  name: string;
  filters: TaskFilterState;
  sort: TaskSortKey;
  columns: OptionalColumnId[];
  isDefault: boolean;
}

export interface SavedViewConfig {
  filters: TaskFilterState;
  sort: TaskSortKey;
  columns: OptionalColumnId[];
}

function parseFilters(value: unknown): TaskFilterState {
  const raw = (value ?? {}) as Partial<TaskFilterState>;
  // Tương thích ngược: bộ lọc cũ lưu giá trị đơn (hoặc ALL/null) → chuyển thành mảng.
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    ...EMPTY_FILTERS,
    ...raw,
    status: toValueList(record["status"]),
    assignee: toValueList(record["assignee"]),
    project: toValueList(record["project"]),
    team: toValueList(record["team"]),
    priority: toValueList(record["priority"]),
  };
}

function toValueList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item !== "" && item !== ALL,
    );
  }
  if (typeof value === "string" && value !== "" && value !== ALL) return [value];
  return [];
}

function parseColumns(value: unknown): OptionalColumnId[] {
  if (!Array.isArray(value)) return DEFAULT_COLUMNS;
  const list = value.filter((item): item is OptionalColumnId =>
    OPTIONAL_COLUMNS.includes(item as OptionalColumnId),
  );
  return list.length > 0 ? list : DEFAULT_COLUMNS;
}

function parseSort(value: unknown): TaskSortKey {
  const key = (value as { key?: string } | null)?.key;
  return TASK_SORT_ORDER.includes(key as TaskSortKey) ? (key as TaskSortKey) : "created_desc";
}

export async function fetchSavedViews(userId: string | null): Promise<SavedView[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("task_saved_views")
    .select("id,name,filters,sort_config,visible_columns,is_default,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    filters: parseFilters(row.filters),
    sort: parseSort(row.sort_config),
    columns: parseColumns(row.visible_columns),
    isDefault: row.is_default,
  }));
}

export const savedViewsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["task-saved-views", userId],
    queryFn: () => fetchSavedViews(userId),
    enabled: Boolean(userId),
  });

function toPayload(config: SavedViewConfig) {
  return {
    filters: config.filters as unknown as Json,
    sort_config: { key: config.sort } as unknown as Json,
    visible_columns: config.columns as unknown as Json,
  };
}

export async function createSavedView(
  userId: string,
  name: string,
  config: SavedViewConfig,
  isDefault: boolean,
) {
  const { error } = await supabase.from("task_saved_views").insert({
    user_id: userId,
    name: name.trim(),
    is_default: isDefault,
    ...toPayload(config),
  });
  if (error) throw new Error(error.message);
}

export async function updateSavedViewConfig(id: string, config: SavedViewConfig) {
  const { error } = await supabase.from("task_saved_views").update(toPayload(config)).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameSavedView(id: string, name: string) {
  const { error } = await supabase
    .from("task_saved_views")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Trigger phía database đảm bảo mỗi người chỉ có một chế độ mặc định. */
export async function setSavedViewDefault(id: string, isDefault: boolean) {
  const { error } = await supabase
    .from("task_saved_views")
    .update({ is_default: isDefault })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSavedView(id: string) {
  const { error } = await supabase.from("task_saved_views").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type { TaskStatus };
