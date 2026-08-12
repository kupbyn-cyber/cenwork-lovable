/**
 * CEN WORK — Nhãn loại thông báo dùng chung.
 * Tách khỏi notification-data để phía máy chủ (Web Push) dùng lại được
 * mà không phải nạp lớp truy cập dữ liệu của trình duyệt.
 */
export const NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  "task.assigned": "Công việc mới",
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
  return NOTIFICATION_EVENT_LABEL[eventType] ?? "Thông báo mới";
}
