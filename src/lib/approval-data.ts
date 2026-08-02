import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * NAP-04 — Data layer cho module Phê duyệt (chỉ ĐỌC).
 * Mọi thao tác ghi đi qua server function NAP-03; client không bao giờ update
 * approval_requests / approval_decisions trực tiếp (RLS đã chặn).
 */
export type ApprovalMode = Database["public"]["Enums"]["approval_mode"];
export type ApprovalStatus = Database["public"]["Enums"]["approval_request_status"];
export type DecisionStatus = Database["public"]["Enums"]["approval_decision_status"];

export const APPROVAL_MODE_LABEL: Record<ApprovalMode, string> = {
  any_one: "Chỉ cần một người đồng ý",
  all_required: "Tất cả phải đồng ý",
};

export const APPROVAL_MODE_HINT: Record<ApprovalMode, string> = {
  any_one: "Yêu cầu được duyệt ngay khi có một người đồng ý.",
  all_required: "Yêu cầu chỉ được duyệt khi tất cả người phê duyệt đồng ý.",
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Chờ xử lý",
  overdue: "Quá hạn",
  approved: "Đã phê duyệt",
  rejected: "Đã từ chối",
  withdrawn: "Đã thu hồi",
};

export const APPROVAL_STATUS_TONE: Record<
  ApprovalStatus,
  "neutral" | "progress" | "success" | "warning" | "error"
> = {
  pending: "progress",
  overdue: "warning",
  approved: "success",
  rejected: "error",
  withdrawn: "neutral",
};

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  pending: "Chưa xử lý",
  approved: "Đã phê duyệt",
  rejected: "Đã từ chối",
  replaced: "Đã được thay thế",
};

export const DECISION_STATUS_TONE: Record<
  DecisionStatus,
  "neutral" | "progress" | "success" | "warning" | "error"
> = {
  pending: "progress",
  approved: "success",
  rejected: "error",
  replaced: "neutral",
};

export interface ApprovalRequestRow {
  id: string;
  title: string;
  content: string;
  sender_id: string;
  approval_mode: ApprovalMode;
  status: ApprovalStatus;
  due_at: string;
  current_version: number;
  approved_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDecisionRow {
  id: string;
  approval_request_id: string;
  version_no: number;
  approver_id: string;
  decision_status: DecisionStatus;
  decision_at: string | null;
  approval_note: string | null;
  rejection_reason: string | null;
  replaced_by: string | null;
  replaced_at: string | null;
}

export interface ApprovalVersionRow {
  id: string;
  approval_request_id: string;
  version_no: number;
  title: string;
  content: string;
  due_at: string;
  approval_mode: ApprovalMode;
  approver_ids: string[];
  submitted_by: string;
  submitted_at: string;
  outcome_status: ApprovalStatus | null;
  ended_at: string | null;
}

export interface ApprovalParticipant {
  id: string;
  display_name: string;
  email: string;
  is_active: boolean;
}

const REQUEST_COLUMNS =
  "id,title,content,sender_id,approval_mode,status,due_at,current_version,approved_at,rejected_at,withdrawn_at,created_at,updated_at";
const DECISION_COLUMNS =
  "id,approval_request_id,version_no,approver_id,decision_status,decision_at,approval_note,rejection_reason,replaced_by,replaced_at";
const VERSION_COLUMNS =
  "id,approval_request_id,version_no,title,content,due_at,approval_mode,approver_ids,submitted_by,submitted_at,outcome_status,ended_at";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Trạng thái hiển thị: quá hạn tính động khi cron chưa kịp cập nhật. */
export function effectiveStatus(row: {
  status: ApprovalStatus;
  due_at: string;
}): ApprovalStatus {
  if (row.status === "pending" && new Date(row.due_at).getTime() < Date.now()) return "overdue";
  return row.status;
}

export function isOpenStatus(status: ApprovalStatus): boolean {
  return status === "pending" || status === "overdue";
}

export interface ApprovalListItem {
  request: ApprovalRequestRow;
  /** Quyết định của phiên bản hiện tại. */
  decisions: ApprovalDecisionRow[];
  status: ApprovalStatus;
  approvedCount: number;
  totalCount: number;
  /** Quyết định của chính người dùng ở phiên bản hiện tại (nếu có). */
  myDecision: ApprovalDecisionRow | null;
}

async function fetchApprovalList(userId: string): Promise<ApprovalListItem[]> {
  const requests = await supabase
    .from("approval_requests")
    .select(REQUEST_COLUMNS)
    .order("created_at", { ascending: false });
  fail(requests.error);
  const rows = (requests.data ?? []) as ApprovalRequestRow[];
  if (rows.length === 0) return [];

  const decisions = await supabase
    .from("approval_decisions")
    .select(DECISION_COLUMNS)
    .in(
      "approval_request_id",
      rows.map((row) => row.id),
    );
  fail(decisions.error);
  const decisionRows = (decisions.data ?? []) as ApprovalDecisionRow[];

  return rows.map((request) => {
    const current = decisionRows.filter(
      (item) =>
        item.approval_request_id === request.id && item.version_no === request.current_version,
    );
    const active = current.filter((item) => item.decision_status !== "replaced");
    return {
      request,
      decisions: current,
      status: effectiveStatus(request),
      approvedCount: active.filter((item) => item.decision_status === "approved").length,
      totalCount: active.length,
      myDecision: active.find((item) => item.approver_id === userId) ?? null,
    } satisfies ApprovalListItem;
  });
}

export const approvalListQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["approvals", userId],
    queryFn: () => fetchApprovalList(userId!),
    enabled: Boolean(userId),
  });

export interface ApprovalDetail {
  request: ApprovalRequestRow;
  decisions: ApprovalDecisionRow[];
  versions: ApprovalVersionRow[];
  participants: ApprovalParticipant[];
}

async function fetchApprovalDetail(requestId: string): Promise<ApprovalDetail | null> {
  const request = await supabase
    .from("approval_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  fail(request.error);
  if (!request.data) return null;

  const [decisions, versions, participants] = await Promise.all([
    supabase
      .from("approval_decisions")
      .select(DECISION_COLUMNS)
      .eq("approval_request_id", requestId)
      .order("version_no", { ascending: false }),
    supabase
      .from("approval_request_versions")
      .select(VERSION_COLUMNS)
      .eq("approval_request_id", requestId)
      .order("version_no", { ascending: false }),
    supabase.rpc("approval_participants", { _request: requestId }),
  ]);
  fail(decisions.error);
  fail(versions.error);
  fail(participants.error);

  return {
    request: request.data as ApprovalRequestRow,
    decisions: (decisions.data ?? []) as ApprovalDecisionRow[],
    versions: (versions.data ?? []) as ApprovalVersionRow[],
    participants: (participants.data ?? []) as ApprovalParticipant[],
  };
}

export const approvalDetailQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["approval", requestId],
    queryFn: () => fetchApprovalDetail(requestId),
  });

/** Danh bạ tài khoản đang hoạt động (dùng chọn người phê duyệt). */
export interface DirectoryUser {
  id: string;
  display_name: string;
  email: string;
}

export const approvalDirectoryQuery = () =>
  queryOptions({
    queryKey: ["approval-directory"],
    queryFn: async (): Promise<DirectoryUser[]> => {
      const { data, error } = await supabase.rpc("announcement_audience_users");
      fail(error);
      return (data ?? []).map((row) => ({
        id: row.id,
        display_name: row.display_name,
        email: row.email,
      }));
    },
  });

/** Khoá cần làm mới sau mỗi thao tác phê duyệt. */
export const APPROVAL_QUERY_KEYS = ["approvals", "approval"] as const;
