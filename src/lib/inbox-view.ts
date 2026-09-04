import {
  effectiveRecipientStatus,
  isPendingAck,
  type InboxRow,
} from "@/lib/announcement-data";
import type { NotificationRow } from "@/lib/notification-data";

/**
 * NOTIFY-UX-01 — view model hợp nhất cho hộp thư chung.
 * KHÔNG gộp bảng database: chỉ chuẩn hóa ở lớp hiển thị.
 */
export type InboxSource = "internal" | "system";

export type InboxKindFilter = "all" | InboxSource;

export interface InboxItem {
  /** Khóa hiển thị dạng `internal:{id}` / `system:{id}` để tránh trùng key. */
  key: string;
  source: InboxSource;
  id: string;
  title: string;
  body: string;
  created_at: string;
  /** internal: unread|reading|completed|overdue|exempt — system: unread|read */
  status: string;
  link: string | null;
  /** Hạn xử lý (chỉ thông báo nội bộ). */
  due_at: string | null;
  /**
   * CEN-ANN-FIX-02 — mục còn cần người dùng xử lý.
   * Nội bộ dùng đúng predicate `isPendingAck` (loại thu hồi/lưu trữ) mà counter dùng.
   */
  actionable: boolean;
  original: InboxRow | NotificationRow;
}

export function internalItem(row: InboxRow): InboxItem {
  return {
    key: `internal:${row.id}`,
    source: "internal",
    id: row.id,
    title: row.announcement.title || "(Chưa có tiêu đề)",
    body: row.announcement.body ?? "",
    created_at: row.announcement.published_at ?? row.announcement.created_at,
    status: effectiveRecipientStatus(row),
    link: null,
    due_at: row.due_at,
    original: row,
  };
}

export function systemItem(row: NotificationRow): InboxItem {
  return {
    key: `system:${row.id}`,
    source: "system",
    id: row.id,
    title: row.title,
    body: row.body ?? "",
    created_at: row.created_at,
    status: row.read_at ? "read" : "unread",
    link: row.link,
    due_at: null,
    original: row,
  };
}

/** Nội bộ chưa hoàn thành / hệ thống chưa đọc. */
export function isTodo(item: InboxItem): boolean {
  if (item.source === "system") return item.status === "unread";
  return item.status !== "completed" && item.status !== "exempt";
}

export function matchesStatusFilter(
  item: InboxItem,
  kind: InboxKindFilter,
  status: string,
): boolean {
  if (status === "all") return true;
  if (status === "todo") return isTodo(item);
  if (status === "done") return !isTodo(item);
  if (status === "overdue") return item.source === "internal" && item.status === "overdue";
  // CEN-ANN-FIX-01 — "chưa xác nhận" của thông báo nội bộ gồm cả mục quá hạn,
  // đúng bằng nguồn logic của counter "Tôi chưa xác nhận".
  if (status === "unread" && item.source === "internal") return isTodo(item);
  if (kind === "all") return true;
  return item.status === status;
}


export function sortNewestFirst(items: InboxItem[]): InboxItem[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * ANN-UI-10 — thứ tự ưu tiên hiển thị:
 * quá hạn → sắp đến hạn/cần xử lý → mới nhận → đã xử lý.
 */
export function sortByPriority(items: InboxItem[]): InboxItem[] {
  const rank = (item: InboxItem) => {
    if (item.source === "internal" && item.status === "overdue") return 0;
    if (isTodo(item)) return 1;
    return 2;
  };
  return [...items].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    if (rank(a) < 2 && a.due_at && b.due_at) {
      const due = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (due !== 0) return due;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
