import * as React from "react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  approvalCommentsQuery,
  approvalMentionsQuery,
  editApprovalComment,
  postApprovalComment,
  setApprovalCommentHidden,
  type ApprovalCommentRow,
} from "@/lib/approval-interaction";
import type { ApprovalDetail } from "@/lib/approval-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * NAP-05 — Trao đổi trong Yêu cầu phê duyệt.
 * Bình luận riêng tư theo quyền xem yêu cầu; nhắc tên chỉ mở quyền xem và bình luận,
 * không biến người được nhắc thành người phê duyệt.
 */
interface Props {
  detail: ApprovalDetail;
  /** Chỉ người gửi và người phê duyệt được nhắc tên (khớp approval_can_mention). */
  canMention: boolean;
  canModerate: boolean;
}

export function ApprovalCommentThread({ detail, canMention, canModerate }: Props) {
  const requestId = detail.request.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const comments = useQuery(approvalCommentsQuery(requestId));
  const mentions = useQuery(approvalMentionsQuery(requestId));

  const [body, setBody] = React.useState("");
  const [mentionIds, setMentionIds] = React.useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);
  const [hiding, setHiding] = React.useState<ApprovalCommentRow | null>(null);
  const [hideReason, setHideReason] = React.useState("");

  const nameById = React.useMemo(
    () => new Map(detail.participants.map((item) => [item.id, item.display_name])),
    [detail.participants],
  );

  const mentionCandidates = React.useMemo(
    () =>
      detail.participants
        .filter((item) => item.id !== user?.id)
        .map((item) => ({ id: item.id, name: item.display_name })),
    [detail.participants, user?.id],
  );

  const mentionsByComment = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of mentions.data ?? []) {
      map.set(row.comment_id, [...(map.get(row.comment_id) ?? []), row.user_id]);
    }
    return map;
  }, [mentions.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["approval-comments", requestId] });
    void queryClient.invalidateQueries({ queryKey: ["approval-mentions", requestId] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const create = useMutation({
    mutationFn: () => postApprovalComment({ requestId, body, mentionUserIds: mentionIds }),
    onSuccess: () => {
      setBody("");
      setMentionIds([]);
      refresh();
      toast.success("Đã gửi bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: () => editApprovalComment(editing!.id, editing!.body),
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success("Đã cập nhật bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hide = useMutation({
    mutationFn: () => setApprovalCommentHidden(hiding!.id, true, hideReason),
    onSuccess: () => {
      setHiding(null);
      setHideReason("");
      refresh();
      toast.success("Đã ẩn bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const suggestions = React.useMemo(() => {
    if (mentionQuery === null || !canMention) return [];
    const keyword = mentionQuery.trim().toLowerCase();
    return mentionCandidates
      .filter((candidate) => candidate.name.toLowerCase().includes(keyword))
      .slice(0, 6);
  }, [mentionQuery, mentionCandidates, canMention]);

  function handleBodyChange(value: string) {
    setBody(value);
    const match = /@([^@\s]{0,30})$/.exec(value);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  function applyMention(candidate: { id: string; name: string }) {
    setBody((prev) => prev.replace(/@([^@\s]{0,30})$/, `@${candidate.name} `));
    setMentionIds((prev) => (prev.includes(candidate.id) ? prev : [...prev, candidate.id]));
    setMentionQuery(null);
  }

  if (comments.isError) {
    return (
      <p className="text-body-sm text-text-muted">
        Không tải được bình luận.{" "}
        <button type="button" className="underline" onClick={() => void comments.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }

  const rows = comments.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {comments.isLoading ? (
        <p className="text-body-sm text-text-muted">Đang tải bình luận…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Chưa có trao đổi" description="Hãy là người bình luận đầu tiên." />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {rows.map((row) => {
            const mine = row.author_id === user?.id;
            const mentioned = mentionsByComment.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-body-sm font-medium text-text-primary">
                    {nameById.get(row.author_id) ?? "Người dùng"}
                  </span>
                  <span className="text-body-xs text-text-muted">
                    {formatHanoiDateTime(row.created_at)}
                  </span>
                  {row.is_edited ? <Badge variant="neutral">Đã chỉnh sửa</Badge> : null}
                  {row.hidden_at ? <Badge variant="warning">Đã ẩn</Badge> : null}
                </div>

                {row.hidden_at ? (
                  <p className="text-body-sm text-text-muted">
                    Bình luận đã bị ẩn bởi kiểm duyệt. Lý do: {row.hidden_reason}
                  </p>
                ) : editing?.id === row.id ? (
                  <div className="flex min-w-0 flex-col gap-2">
                    <Textarea
                      rows={3}
                      value={editing.body}
                      maxLength={4000}
                      aria-label="Sửa bình luận"
                      onChange={(event) => setEditing({ id: row.id, body: event.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={update.isPending}
                        disabled={!editing.body.trim()}
                        onClick={() => update.mutate()}
                      >
                        Lưu
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Hủy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words text-body-sm text-text-secondary">
                      {row.body}
                    </p>
                    {mentioned.length > 0 ? (
                      <p className="text-body-xs text-text-muted">
                        Nhắc tên:{" "}
                        {mentioned.map((id) => nameById.get(id) ?? "Người dùng").join(", ")}
                      </p>
                    ) : null}
                  </>
                )}

                {!row.hidden_at && editing?.id !== row.id ? (
                  <div className="flex flex-wrap gap-2">
                    {mine ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing({ id: row.id, body: row.body })}
                      >
                        Sửa
                      </Button>
                    ) : null}
                    {canModerate ? (
                      <Button size="sm" variant="ghost" onClick={() => setHiding(row)}>
                        Ẩn
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3">
        <div className="relative min-w-0">
          <Textarea
            rows={3}
            value={body}
            maxLength={4000}
            aria-label="Nội dung bình luận"
            placeholder={
              canMention ? "Nhập bình luận… gõ @ để nhắc tên" : "Nhập bình luận…"
            }
            onChange={(event) => handleBodyChange(event.target.value)}
            onBlur={() => window.setTimeout(() => setMentionQuery(null), 150)}
          />
          {suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-control border border-border-default bg-surface-raised py-1 shadow-lg">
              {suggestions.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-body-sm text-text-primary hover:bg-surface-overlay"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyMention(candidate)}
                  >
                    @{candidate.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {mentionIds.length > 0 ? (
          <p className="text-body-xs text-text-muted">
            Sẽ nhắc tên: {mentionIds.map((id) => nameById.get(id) ?? "Người dùng").join(", ")}{" "}
            <button type="button" className="underline" onClick={() => setMentionIds([])}>
              Xóa nhắc tên
            </button>
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!body.trim() || create.isPending}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Gửi bình luận
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(hiding)}
        onOpenChange={(open) => {
          if (!open) setHiding(null);
        }}
        title="Ẩn bình luận vi phạm"
        description="Nội dung gốc vẫn được giữ và ghi nhật ký hoạt động."
        tone="destructive"
        confirmLabel="Ẩn bình luận"
        loading={hide.isPending}
        confirmDisabled={!hideReason.trim()}
        onConfirm={() => hide.mutate()}
      >
        <Input
          value={hideReason}
          maxLength={300}
          aria-label="Lý do ẩn bình luận"
          placeholder="Lý do ẩn (bắt buộc)"
          onChange={(event) => setHideReason(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
