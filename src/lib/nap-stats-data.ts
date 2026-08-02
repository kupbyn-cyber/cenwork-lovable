import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * NAP-06 — Thống kê vận hành cho module Thông báo & Phê duyệt.
 * Toàn bộ số liệu do server tính (RPC nap_operation_stats) theo quyền của
 * người đang đăng nhập; client không tải toàn bộ dữ liệu rồi tự lọc.
 */
export interface NapOperationStats {
  is_admin: boolean;
  announcement_unconfirmed: number;
  announcement_overdue: number;
  approval_pending_me: number;
  approval_overdue_me: number;
  approval_sent_pending: number;
  approval_sent_approved: number;
  approval_sent_rejected: number;
  org_announcement_overdue?: number;
  org_approval_pending?: number;
  org_approval_overdue?: number;
  org_approval_approved?: number;
  org_approval_rejected?: number;
}

export async function fetchNapStats(): Promise<NapOperationStats> {
  const { data, error } = await supabase.rpc("nap_operation_stats");
  if (error) throw new Error(error.message);
  const stats = (data ?? {}) as Partial<NapOperationStats> & { error?: string };
  if (stats.error) throw new Error("unauthorized");
  return {
    is_admin: Boolean(stats.is_admin),
    announcement_unconfirmed: stats.announcement_unconfirmed ?? 0,
    announcement_overdue: stats.announcement_overdue ?? 0,
    approval_pending_me: stats.approval_pending_me ?? 0,
    approval_overdue_me: stats.approval_overdue_me ?? 0,
    approval_sent_pending: stats.approval_sent_pending ?? 0,
    approval_sent_approved: stats.approval_sent_approved ?? 0,
    approval_sent_rejected: stats.approval_sent_rejected ?? 0,
    ...(stats.org_announcement_overdue === undefined
      ? {}
      : { org_announcement_overdue: stats.org_announcement_overdue }),
    ...(stats.org_approval_pending === undefined
      ? {}
      : { org_approval_pending: stats.org_approval_pending }),
    ...(stats.org_approval_overdue === undefined
      ? {}
      : { org_approval_overdue: stats.org_approval_overdue }),
    ...(stats.org_approval_approved === undefined
      ? {}
      : { org_approval_approved: stats.org_approval_approved }),
    ...(stats.org_approval_rejected === undefined
      ? {}
      : { org_approval_rejected: stats.org_approval_rejected }),
  };
}

export const napStatsQuery = () =>
  queryOptions({
    queryKey: ["nap-stats"],
    queryFn: fetchNapStats,
    staleTime: 60_000,
  });
