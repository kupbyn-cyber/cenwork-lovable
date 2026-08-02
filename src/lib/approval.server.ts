import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * NAP-03 — Nghiệp vụ Phê duyệt (chạy phía server).
 * Mọi thao tác ghi đều đi qua database function SECURITY DEFINER đã kiểm tra quyền,
 * chạy trong một transaction và khóa bản ghi để tránh race condition.
 * RLS chỉ cho phép SELECT; client không thể tự sửa status hay decision.
 */
type Client = SupabaseClient<Database>;

export type ApprovalMode = "any_one" | "all_required";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Người gửi phải đang hoạt động (server kiểm tra lại, không tin client). */
async function assertActive(supabase: Client, userId: string) {
  const { data, error } = await supabase.rpc("is_active_account", { _user: userId });
  fail(error);
  if (!data) throw new Error("Tài khoản không hoạt động");
}

export interface CreateApprovalInput {
  title: string;
  content: string;
  dueAt: string;
  mode: ApprovalMode;
  approverIds: string[];
}

export async function createApprovalRequest(
  supabase: Client,
  userId: string,
  input: CreateApprovalInput,
): Promise<{ requestId: string }> {
  await assertActive(supabase, userId);

  const approvers = [...new Set(input.approverIds)].filter((id) => id !== userId);
  if (approvers.length === 0) {
    throw new Error("Phải chọn ít nhất một người phê duyệt (không gồm chính bạn)");
  }
  if (new Date(input.dueAt).getTime() <= Date.now()) {
    throw new Error("Hạn xử lý phải ở tương lai");
  }

  const { data, error } = await supabase.rpc("approval_create", {
    _title: input.title,
    _content: input.content,
    _due_at: input.dueAt,
    _mode: input.mode,
    _approvers: approvers,
  });
  fail(error);
  return { requestId: data as string };
}

/** Chỉ người phê duyệt pending của phiên bản hiện tại xử lý được (kiểm tra trong function). */
export async function decideApproval(
  supabase: Client,
  requestId: string,
  approve: boolean,
  note: string | null,
): Promise<{ status: string }> {
  if (!approve && !note?.trim()) throw new Error("Từ chối bắt buộc phải có lý do");
  const { data, error } = await supabase.rpc("approval_decide", {
    _request: requestId,
    _approve: approve,
    _note: note?.trim() ? note.trim() : undefined,
  });
  fail(error);
  return { status: data as string };
}

export async function withdrawApproval(supabase: Client, requestId: string, reason: string | null) {
  const { error } = await supabase.rpc("approval_withdraw", {
    _request: requestId,
    _reason: reason?.trim() ? reason.trim() : undefined,
  });
  fail(error);
  return { ok: true as const };
}

export async function resubmitApproval(
  supabase: Client,
  requestId: string,
  input: { title: string; content: string; dueAt: string },
) {
  if (new Date(input.dueAt).getTime() <= Date.now()) {
    throw new Error("Hạn xử lý phải ở tương lai");
  }
  const { data, error } = await supabase.rpc("approval_resubmit", {
    _request: requestId,
    _title: input.title,
    _content: input.content,
    _due_at: input.dueAt,
  });
  fail(error);
  return { versionNo: data as number };
}

/** Ngoại lệ duy nhất được đổi người phê duyệt: người cũ đã ngừng hoạt động. */
export async function replaceApprover(
  supabase: Client,
  requestId: string,
  oldApproverId: string,
  newApproverId: string,
) {
  const { error } = await supabase.rpc("approval_replace_approver", {
    _request: requestId,
    _old: oldApproverId,
    _new: newApproverId,
  });
  fail(error);
  return { ok: true as const };
}
