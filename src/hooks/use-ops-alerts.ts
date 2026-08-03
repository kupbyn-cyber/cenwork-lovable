import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/use-auth";
import { getOpsAlerts } from "@/lib/ops-alerts.functions";
import { useTodayRange } from "@/hooks/use-today-range";

/**
 * TODAY-ALERTS-01 — nguồn dữ liệu cho widget "Cảnh báo cần chú ý".
 * Cảnh báo theo sự kiện đổi theo bộ lọc Hôm nay/Tuần/Tháng của Dashboard.
 */
export function useOpsAlerts(enabled: boolean) {
  const { user } = useAuth();
  const { range, bounds } = useTodayRange();
  const fetchAlerts = useServerFn(getOpsAlerts);
  const startISO = new Date(bounds.start).toISOString();
  const endISO = new Date(bounds.end).toISOString();
  return useQuery({
    queryKey: ["ops-alerts", user?.id ?? "anon", range],
    queryFn: () => fetchAlerts({ data: { startISO, endISO } }),
    enabled: enabled && Boolean(user?.id),
    staleTime: 60_000,
  });
}
