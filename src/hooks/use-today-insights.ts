import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import { getTodayInsights } from "@/lib/today-insights.functions";
import { rangeBounds, type RangeBounds, type TodayRange } from "@/lib/today-range";

/**
 * CEN TODAY-03 — nguồn dữ liệu cho các khối cá nhân hóa theo vai trò.
 * Tách khỏi useTodayHub để một khối lỗi không chặn danh sách việc cần xử lý.
 */
export function useTodayInsights(range: TodayRange = "today", bounds?: RangeBounds) {
  const { user } = useAuth();
  const fetchInsights = useServerFn(getTodayInsights);
  const scope = bounds ?? rangeBounds(range);
  const startISO = new Date(scope.start).toISOString();
  const endISO = new Date(scope.end).toISOString();
  return useQuery({
    queryKey: ["today-insights", user?.id ?? "anon", range],
    queryFn: () => fetchInsights({ data: { startISO, endISO } }),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
}
