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

export const NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  "task.assigned": "Giao công việc",
  "task.assignee_changed": "Đổi người phụ trách",
  "task.deadline_changed": "Đổi deadline",
  "task.review_requested": "Công việc chờ kiểm tra",
  "report.daily_submitted": "Báo cáo ngày chờ duyệt",
  "report.daily_changes_requested": "Báo cáo ngày cần chỉnh sửa",
  "report.weekly_submitted": "Báo cáo tuần chờ duyệt",
  "report.weekly_changes_requested": "Báo cáo tuần cần chỉnh sửa",
  "project.approved": "Dự án được duyệt",
  "project.rejected": "Dự án bị từ chối",
  "project.member_added": "Thêm vào dự án",
  "project.member_removed": "Rời khỏi dự án",
  "recognition.received": "Ghi nhận từ đồng đội",
  "approval.requested": "Yêu cầu phê duyệt mới",
  "approval.resubmitted": "Yêu cầu phê duyệt gửi lại",
  "approval.decision_recorded": "Có quyết định phê duyệt",
  "approval.approved": "Yêu cầu được phê duyệt",
  "approval.rejected": "Yêu cầu bị từ chối",
  "approval.withdrawn": "Yêu cầu đã thu hồi",
  "approval.approver_replaced": "Được chỉ định phê duyệt thay",
  "approval.mentioned": "Được nhắc tên trong phê duyệt",
  "approval.comment_created": "Bình luận mới trong phê duyệt",
  "approval.due_24h": "Sắp đến hạn phê duyệt",
  "approval.overdue_reminder": "Phê duyệt đã quá hạn",
  "approval.sender_overdue": "Yêu cầu của bạn đã quá hạn",
  "announcement.due_24h": "Sắp đến hạn xác nhận thông báo",
  "announcement.due_2h": "Còn 2 giờ đến hạn xác nhận",
  "announcement.overdue_reminder": "Thông báo đã quá hạn xác nhận",
  "announcement.sender_overdue": "Thông báo của bạn đã quá hạn",
};

export function notificationEventLabel(eventType: string): string {
  return NOTIFICATION_EVENT_LABEL[eventType] ?? eventType;
}

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
