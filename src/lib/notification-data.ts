import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";

/**
 * CEN 1.0 — M5 data layer thông báo trong CEN.
 * Người dùng chỉ đọc và đánh dấu đã đọc thông báo của chính mình (RLS chốt phạm vi).
 * Thông báo do trigger phía database tạo; client không tạo/xóa được.
 */
export interface NotificationRow {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export { NOTIFICATION_EVENT_LABEL, notificationEventLabel } from "@/lib/notification-labels";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const SELECT_COLUMNS = "id,event_type,title,body,entity_type,entity_id,link,read_at,created_at";

export async function fetchNotifications(limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(error);
  return (data ?? []) as NotificationRow[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  fail(error);
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  fail(error);
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  fail(error);
}

export function notificationsQuery(userId: string | null | undefined, limit = 50) {
  return queryOptions({
    queryKey: ["notifications", userId ?? "anon", limit],
    queryFn: () => fetchNotifications(limit),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function unreadCountQuery(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["notifications-unread", userId ?? "anon"],
    queryFn: fetchUnreadCount,
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
