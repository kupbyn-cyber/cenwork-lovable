import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import { getTodayHub } from "@/lib/today.functions";

/**
 * CEN TODAY-01 — nguồn dữ liệu duy nhất cho danh sách việc cần xử lý.
 * Dùng chung cache cho Trang chủ, Drawer "Xem tất cả" và trang /today.
 */
export function useTodayHub() {
  const { user } = useAuth();
  const fetchHub = useServerFn(getTodayHub);
  return useQuery({
    queryKey: ["today-hub", user?.id ?? "anon"],
    queryFn: () => fetchHub(),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
}
