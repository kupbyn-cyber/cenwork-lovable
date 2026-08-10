import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";

/**
 * NAP-05 — Bình luận và nhắc tên trong Yêu cầu phê duyệt.
 * Quyền xem/ghi do RLS + hàm SECURITY DEFINER quyết định; client không ghi thẳng bảng.
 * Người được nhắc tên chỉ được xem và bình luận, không bao giờ thành người phê duyệt.
 */
export interface ApprovalCommentRow {
  id: string;
  approval_request_id: string;
  author_id: string;
  body: string;
  is_edited: boolean;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

export interface ApprovalMentionRow {
  comment_id: string;
  user_id: string;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export const approvalCommentsQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["approval-comments", requestId],
    queryFn: async (): Promise<ApprovalCommentRow[]> => {
      const { data, error } = await supabase
        .from("approval_comments")
        .select(
          "id,approval_request_id,author_id,body,is_edited,hidden_at,hidden_reason,created_at",
        )
        .eq("approval_request_id", requestId)
        .order("created_at", { ascending: true });
      fail(error);
      return (data ?? []) as ApprovalCommentRow[];
    },
  });

export const approvalMentionsQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["approval-mentions", requestId],
    queryFn: async (): Promise<ApprovalMentionRow[]> => {
      const { data, error } = await supabase
        .from("approval_comment_mentions")
        .select("comment_id,user_id")
        .eq("approval_request_id", requestId);
      fail(error);
      return (data ?? []) as ApprovalMentionRow[];
    },
  });

export async function postApprovalComment(input: {
  requestId: string;
  body: string;
  mentionUserIds: string[];
}) {
  const { error } = await supabase.rpc("approval_comment_post", {
    _request: input.requestId,
    _body: input.body,
    _mentions: input.mentionUserIds,
  });
  fail(error);
}

export async function editApprovalComment(commentId: string, body: string) {
  const { error } = await supabase.rpc("approval_comment_edit", {
    _comment: commentId,
    _body: body,
  });
  fail(error);
}

export async function setApprovalCommentHidden(
  commentId: string,
  hidden: boolean,
  reason: string,
) {
  const { error } = await supabase.rpc("approval_comment_set_hidden", {
    _comment: commentId,
    _hidden: hidden,
    _reason: reason,
  });
  fail(error);
}
