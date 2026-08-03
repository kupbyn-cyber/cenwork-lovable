import { effectiveRecipientStatus, type InboxRow } from "@/lib/announcement-data";
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
  if (kind === "all") {
    if (status === "todo") return isTodo(item);
    if (status === "done") return !isTodo(item);
    if (status === "overdue") return item.source === "internal" && item.status === "overdue";
    return true;
  }
  return item.status === status;
}

export function sortNewestFirst(items: InboxItem[]): InboxItem[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
