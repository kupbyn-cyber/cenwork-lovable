import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { myOverdueQuery } from "@/lib/announcement-data";

/**
 * CEN 1.0 — M6.1 khóa thao tác khi còn thông báo nội bộ quá hạn.
 * Không dùng cờ cố định trên User: trạng thái được tính từ nghĩa vụ quá hạn còn hiệu lực.
 * UI chỉ chặn hiển thị; database vẫn chặn độc lập bằng trigger.
 */
export function useAnnouncementLock() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery(myOverdueQuery(user?.id));
  const overdue = data ?? [];
  return {
    loading: isLoading,
    overdue,
    overdueCount: overdue.length,
    /** true khi mọi thao tác thay đổi dữ liệu nghiệp vụ bị khóa. */
    locked: overdue.length > 0,
  };
}

export const ANNOUNCEMENT_LOCK_MESSAGE =
  "Bạn đang bị giới hạn thao tác vì còn thông báo nội bộ quá hạn chưa xác nhận.";
