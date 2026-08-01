import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * CEN 1.0 — Yêu cầu thay đổi deadline (Task và Dự án).
 * Toàn bộ ghi dữ liệu đi qua RPC SECURITY DEFINER: quyền, trạng thái pending và
 * việc áp dụng deadline đều được chốt lại trong cùng một luồng ở database.
 * Helper quyền phía dưới chỉ để UI ẩn/disable đúng.
 */
export type DeadlineEntityType = "task" | "project";
export type DeadlineRequestStatus = "pending" | "approved" | "rejected";

export interface DeadlineRequestRow {
  id: string;
  entity_type: DeadlineEntityType;
  entity_id: string;
  current_deadline: string | null;
  proposed_deadline: string;
  reason: string;
  requested_by: string;
  requesterName: string | null;
  status: DeadlineRequestStatus;
  decided_by: string | null;
  deciderName: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

const SELECT = `
  id,entity_type,entity_id,current_deadline,proposed_deadline,reason,requested_by,status,
  decided_by,decided_at,decision_note,created_at,
  requester:profiles!deadline_change_requests_requested_by_fkey(display_name),
  decider:profiles!deadline_change_requests_decided_by_fkey(display_name)
`;

type Raw = Record<string, unknown>;

function mapRow(raw: Raw): DeadlineRequestRow {
  const requester = raw["requester"] as { display_name: string } | null;
  const decider = raw["decider"] as { display_name: string } | null;
  return {
    id: raw["id"] as string,
    entity_type: raw["entity_type"] as DeadlineEntityType,
    entity_id: raw["entity_id"] as string,
    current_deadline: (raw["current_deadline"] as string | null) ?? null,
    proposed_deadline: raw["proposed_deadline"] as string,
    reason: raw["reason"] as string,
    requested_by: raw["requested_by"] as string,
    requesterName: requester?.display_name ?? null,
    status: raw["status"] as DeadlineRequestStatus,
    decided_by: (raw["decided_by"] as string | null) ?? null,
    deciderName: decider?.display_name ?? null,
    decided_at: (raw["decided_at"] as string | null) ?? null,
    decision_note: (raw["decision_note"] as string | null) ?? null,
    created_at: raw["created_at"] as string,
  };
}

/** Lịch sử yêu cầu của một đối tượng (RLS quyết định người xem được). */
export async function fetchDeadlineRequests(
  entityType: DeadlineEntityType,
  entityId: string,
): Promise<DeadlineRequestRow[]> {
  const { data, error } = await supabase
    .from("deadline_change_requests")
    .select(SELECT)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Raw));
}

export const deadlineRequestsQuery = (entityType: DeadlineEntityType, entityId: string) =>
  queryOptions({
    queryKey: ["deadline-requests", entityType, entityId],
    queryFn: () => fetchDeadlineRequests(entityType, entityId),
  });

/** Toàn bộ yêu cầu đang chờ mà người dùng hiện tại nhìn thấy (dùng cho danh sách). */
export async function fetchPendingDeadlineRequests(): Promise<DeadlineRequestRow[]> {
  const { data, error } = await supabase
    .from("deadline_change_requests")
    .select(SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Raw));
}

export const pendingDeadlineRequestsQuery = () =>
  queryOptions({
    queryKey: ["deadline-requests", "pending"],
    queryFn: fetchPendingDeadlineRequests,
  });

export function findPending(
  rows: DeadlineRequestRow[] | undefined,
  entityType: DeadlineEntityType,
  entityId: string,
) {
  return (
    (rows ?? []).find(
      (row) =>
        row.status === "pending" && row.entity_type === entityType && row.entity_id === entityId,
    ) ?? null
  );
}

/* ================= Ghi dữ liệu (RPC) ================= */

export async function requestDeadlineChange(input: {
  entityType: DeadlineEntityType;
  entityId: string;
  proposed: string;
  reason: string;
}) {
  const { error } = await supabase.rpc("deadline_change_request", {
    _entity_type: input.entityType,
    _entity_id: input.entityId,
    _proposed: input.proposed,
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
}

export async function decideDeadlineChange(input: {
  requestId: string;
  approve: boolean;
  note?: string | null;
}) {
  const { error } = await supabase.rpc("deadline_change_decide", {
    _request: input.requestId,
    _approve: input.approve,
    _note: input.note ?? undefined,
  });
  if (error) throw new Error(error.message);
}

export async function setManualArchive(
  entityType: DeadlineEntityType,
  entityId: string,
  archived: boolean,
) {
  const { error } = await supabase.rpc("set_manual_archive", {
    _entity_type: entityType,
    _entity_id: entityId,
    _archived: archived,
  });
  if (error) throw new Error(error.message);
}
