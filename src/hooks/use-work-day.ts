import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { workDayTodayQuery } from "@/lib/workday-data";

/** WORKDAY-01 — trạng thái ngày làm việc hôm nay, dùng chung popup và CEN Today. */
export function useWorkDayToday() {
  const { user } = useAuth();
  return useQuery(workDayTodayQuery(user?.id ?? null));
}
