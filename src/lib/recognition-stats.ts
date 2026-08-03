import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { RecognitionCategory } from "@/lib/recognition-data";

/**
 * CEN TODAY-03 — thống kê ghi nhận (chỉ số lượng).
 * Phạm vi xem do hàm database quyết định: Member chỉ thấy mình,
 * Leader thấy Team mình quản lý, Admin/CMO thấy toàn bộ.
 * Không trả nội dung lời ghi nhận hay tên người gửi.
 */
export type RecognitionRange = "week" | "month" | "quarter";

export const RECOGNITION_RANGE_LABEL: Record<RecognitionRange, string> = {
  week: "Tuần này",
  month: "Tháng này",
  quarter: "Quý này",
};

export interface RecognitionStatRow {
  receiver_id: string;
  display_name: string;
  team_id: string | null;
  team_name: string | null;
  support_count: number;
  quality_count: number;
  speed_count: number;
  initiative_count: number;
  teamwork_count: number;
  creativity_count: number;
  effectiveness_count: number;
  progress_count: number;
  dedication_count: number;
  /** Số lời tự ghi nhận — tách riêng để không lẫn với ghi nhận đồng đội. */
  self_count: number;
  total_count: number;
}

const HANOI_OFFSET_MS = 7 * 60 * 60 * 1000;

function hanoiToday(): string {
  return new Date(Date.now() + HANOI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Khoảng ngày (theo lịch Hà Nội) tương ứng với bộ lọc nhanh. */
export function rangeDates(range: RecognitionRange, anchor = hanoiToday()): {
  from: string;
  to: string;
} {
  const date = new Date(`${anchor}T00:00:00+07:00`);
  if (range === "week") {
    const day = (date.getUTCDay() + 6) % 7;
    const from = new Date(date.getTime() - day * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(date.getTime() + (6 - day) * 86_400_000).toISOString().slice(0, 10);
    return { from, to };
  }
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (range === "month") {
    const from = `${anchor.slice(0, 7)}-01`;
    const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { from, to };
  }
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export interface RecognitionStatsFilter {
  from: string;
  to: string;
  teamId?: string | null;
  userId?: string | null;
  category?: RecognitionCategory | null;
}

export async function fetchRecognitionStats(
  filter: RecognitionStatsFilter,
): Promise<RecognitionStatRow[]> {
  const { data, error } = await supabase.rpc("recognition_stats", {
    _from: filter.from,
    _to: filter.to,
    ...(filter.teamId ? { _team: filter.teamId } : {}),
    ...(filter.userId ? { _user: filter.userId } : {}),
    ...(filter.category ? { _category: filter.category } : {}),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecognitionStatRow[];
}

export const recognitionStatsQuery = (filter: RecognitionStatsFilter) =>
  queryOptions({
    queryKey: [
      "recognition-stats",
      filter.from,
      filter.to,
      filter.teamId ?? null,
      filter.userId ?? null,
      filter.category ?? null,
    ],
    queryFn: () => fetchRecognitionStats(filter),
    staleTime: 60_000,
  });
