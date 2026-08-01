import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AnnouncementBody } from "@/components/announcement/announcement-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  commentsQuery,
  editComment,
  mentionsQuery,
  postComment,
  setCommentHidden,
  type CommentRow,
} from "@/lib/announcement-interaction";
import { announcementRecipientsQuery } from "@/lib/announcement-data";
import { membersQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.2 bình luận, trả lời một cấp và nhắc tên.
 * Phạm vi nhắc tên và quyền ghi do RLS quyết định; UI chỉ hiển thị đúng lựa chọn hợp lệ.
 */
interface Props {
  announcementId: string;
  authorId: string;
  commentsEnabled: boolean;
  active: boolean;
  canModerate: boolean;
  readOnly?: boolean;
}

export function CommentThread({
  announcementId,
  authorId,
  commentsEnabled,
  active,
  canModerate,
  readOnly,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const comments = useQuery(commentsQuery(announcementId));
  const mentions = useQuery(mentionsQuery(announcementId));
  const recipients = useQuery(announcementRecipientsQuery(announcementId));
  const members = useQuery(membersQuery());

  const [body, setBody] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [mentionIds, setMentionIds] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);
  const [hiding, setHiding] = React.useState<CommentRow | null>(null);
  const [hideReason, setHideReason] = React.useState("");

  const nameById = React.useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.display_name])),
    [members.data],
  );

  /** Chỉ người nhận, người phát hành và người đã bình luận mới được nhắc tên. */
  const mentionCandidates = React.useMemo(() => {
    const ids = new Set<string>([authorId]);
    for (const row of recipients.data ?? []) ids.add(row.user_id);
    for (const row of comments.data ?? []) ids.add(row.author_id);
    ids.delete(user?.id ?? "");
    return [...ids].map((id) => ({ id, name: nameById.get(id) ?? id }));
  }, [authorId, recipients.data, comments.data, nameById, user?.id]);

  const mentionsByComment = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of mentions.data ?? []) {
      map.set(row.comment_id, [...(map.get(row.comment_id) ?? []), row.user_id]);
    }
    return map;
  }, [mentions.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["announcement-comments", announcementId] });
    void queryClient.invalidateQueries({ queryKey: ["announcement-mentions", announcementId] });
  }

  const create = useMutation({
    mutationFn: () =>
      postComment({
        announcementId,
        parentId: replyTo,
        authorId: user!.id,
        body,
        mentionUserIds: mentionIds,
      }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      setMentionIds([]);
      refresh();
      toast.success("Đã gửi bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: () => editComment(editing!.id, editing!.body),
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast.success("Đã cập nhật bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const hide = useMutation({
    mutationFn: () => setCommentHidden(hiding!.id, true, hideReason),
    onSuccess: () => {
      setHiding(null);
      setHideReason("");
      refresh();
      toast.success("Đã ẩn bình luận");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = comments.data ?? [];
  const roots = rows.filter((row) => !row.parent_id);
  const repliesByParent = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    repliesByParent.set(row.parent_id, [...(repliesByParent.get(row.parent_id) ?? []), row]);
  }

  const canWrite = commentsEnabled && active && !readOnly;

  function renderComment(row: CommentRow, isReply: boolean) {
    const mine = row.author_id === user?.id;
    const mentioned = mentionsByComment.get(row.id) ?? [];
    return (
      <div
        key={row.id}
        className={`flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3 ${
          isReply ? "ml-4 sm:ml-8" : ""
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-body-sm font-medium text-text-primary">
            {nameById.get(row.author_id) ?? row.author_id}
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
            <AnnouncementBody body={row.body} />
            {mentioned.length > 0 ? (
              <p className="text-body-xs text-text-muted">
                Nhắc tên: {mentioned.map((id) => nameById.get(id) ?? id).join(", ")}
              </p>
            ) : null}
          </>
        )}

        {!row.hidden_at && editing?.id !== row.id ? (
          <div className="flex flex-wrap gap-2">
            {canWrite && !isReply ? (
              <Button size="sm" variant="ghost" onClick={() => setReplyTo(row.id)}>
                Trả lời
              </Button>
            ) : null}
            {mine && canWrite ? (
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
  }

  if (!commentsEnabled) {
    return (
      <p className="text-body-sm text-text-muted">
        Thông báo này không bật bình luận.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {rows.length === 0 ? (
        <EmptyState title="Chưa có bình luận" description="Hãy là người bình luận đầu tiên." />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {roots.map((root) => (
            <div key={root.id} className="flex min-w-0 flex-col gap-2">
              {renderComment(root, false)}
              {(repliesByParent.get(root.id) ?? []).map((reply) => renderComment(reply, true))}
            </div>
          ))}
        </div>
      )}

      {canWrite ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3">
          {replyTo ? (
            <p className="text-body-xs text-text-muted">
              Đang trả lời một bình luận.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setReplyTo(null)}
              >
                Hủy trả lời
              </button>
            </p>
          ) : null}
          <Textarea
            rows={3}
            value={body}
            maxLength={4000}
            aria-label="Nội dung bình luận"
            placeholder="Nhập bình luận…"
            onChange={(event) => setBody(event.target.value)}
          />
          {mentionCandidates.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="mention-picker" className="text-body-xs text-text-muted">
                Nhắc tên (chỉ trong phạm vi thông báo)
              </label>
              <select
                id="mention-picker"
                multiple
                value={mentionIds}
                onChange={(event) =>
                  setMentionIds(
                    [...event.target.selectedOptions].map((option) => option.value),
                  )
                }
                className="min-h-24 w-full rounded-control border border-border-default bg-surface-raised px-3 py-2 text-body-sm text-text-primary"
              >
                {mentionCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
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
      ) : (
        <p className="text-body-sm text-text-muted">
          {readOnly
            ? "Bạn đã hoàn thành thông báo được lưu trữ nên chỉ xem lại nội dung."
            : "Thông báo không còn nhận bình luận mới."}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(hiding)}
        onOpenChange={(open) => {
          if (!open) setHiding(null);
        }}
        title="Ẩn bình luận vi phạm"
        description="Nội dung gốc vẫn được giữ trong lịch sử và ghi nhật ký hoạt động."
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
