import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import { getTodayInsights } from "@/lib/today-insights.functions";

/**
 * CEN TODAY-03 — nguồn dữ liệu cho các khối cá nhân hóa theo vai trò.
 * Tách khỏi useTodayHub để một khối lỗi không chặn danh sách việc cần xử lý.
 */
export function useTodayInsights() {
  const { user } = useAuth();
  const fetchInsights = useServerFn(getTodayInsights);
  return useQuery({
    queryKey: ["today-insights", user?.id ?? "anon"],
    queryFn: () => fetchInsights(),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
}
