import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { fetchNotifications, type NotificationRow } from "@/lib/notification-data";

/**
 * NOTIFY-POPUP-01 — popup realtime dùng đúng dữ liệu Notification Center.
 * Không tạo bảng/notification mới: chỉ theo dõi bảng `notifications` của chính
 * người đăng nhập (RLS đã chốt phạm vi) và bật popup cho bản ghi mới xuất hiện
 * sau thời điểm phiên bắt đầu.
 */
const POLL_MS = 20_000;
const FETCH_LIMIT = 10;

export interface PopupItem {
  row: NotificationRow;
  shownAt: number;
}

export function useNotificationPopups() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const [items, setItems] = React.useState<PopupItem[]>([]);

  // Bộ nhớ theo phiên: đã popup rồi thì không popup lại (remount, đổi trang,
  // refetch, reconnect đều dùng chung ref này).
  const seen = React.useRef<Set<string>>(new Set());
  const baseline = React.useRef<number | null>(null);

  React.useEffect(() => {
    // Đổi người dùng (đăng xuất/đăng nhập) → làm sạch trạng thái popup.
    seen.current = new Set();
    baseline.current = null;
    setItems([]);
  }, [userId]);

  const query = useQuery({
    queryKey: ["notifications-popup", userId ?? "anon"],
    queryFn: () => fetchNotifications(FETCH_LIMIT),
    enabled: Boolean(userId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const rows = query.data;

  React.useEffect(() => {
    if (!rows || !userId) return;

    // Lần nạp đầu tiên chỉ dựng mốc: dữ liệu lịch sử không bao giờ bật popup.
    if (baseline.current === null) {
      baseline.current = Date.now();
      for (const row of rows) seen.current.add(row.id);
      return;
    }

    const fresh = rows
      .filter((row) => !seen.current.has(row.id))
      .filter((row) => !row.read_at)
      .filter((row) => new Date(row.created_at).getTime() >= (baseline.current ?? 0) - 60_000)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (fresh.length === 0) return;
    for (const row of fresh) seen.current.add(row.id);

    setItems((prev) => [...prev, ...fresh.map((row) => ({ row, shownAt: Date.now() }))]);
    // Badge chưa đọc cập nhật ngay mà không cần nạp lại toàn bộ Notification Center.
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }, [rows, userId, queryClient]);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.row.id !== id));
  }, []);

  const dismissAll = React.useCallback(() => setItems([]), []);

  return { items, dismiss, dismissAll };
}
