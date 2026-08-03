import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AnnouncementBody } from "@/components/announcement/announcement-body";
import { CommentThread } from "@/components/announcement/comment-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useAcknowledgeAnnouncement } from "@/hooks/use-pending-announcements";
import {
  effectiveRecipientStatus,
  isAnnouncementActive,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type InboxRow,
} from "@/lib/announcement-data";
import { surveyQuery } from "@/lib/announcement-interaction";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * ANN-UI-10 — modal chi tiết thông báo nội bộ.
 * Chỉ tối ưu trình bày: nghiệp vụ xác nhận vẫn dùng useAcknowledgeAnnouncement.
 */
interface Props {
  row: InboxRow | null;
  senderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnnouncementDetailModal({ row, senderName, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { isAdmin, isCmo } = useOrgAccess();
  const [showComments, setShowComments] = React.useState(false);

  React.useEffect(() => {
    if (open) setShowComments(false);
  }, [open, row?.id]);

  const announcement = row?.announcement ?? null;
  const survey = useQuery({
    ...surveyQuery(row?.announcement_id ?? "", announcement?.current_version ?? 1),
    enabled: open && Boolean(row),
  });
  const ack = useAcknowledgeAnnouncement();

  if (!row || !announcement) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const status = effectiveRecipientStatus(row);
  const done = row.status === "completed" || row.status === "exempt";
  const active = isAnnouncementActive(announcement);
  const canAcknowledge = !done && active;
  const hasQuestions = (survey.data?.questions.length ?? 0) > 0;
  const canModerate = Boolean(announcement.created_by === user?.id || isAdmin || isCmo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-[820px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="min-w-0 gap-2 border-b border-border-default p-4 pe-12 sm:p-5 sm:pe-12">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge size="sm" variant="outline">
              Thông báo
            </Badge>
            <StatusBadge
              tone={RECIPIENT_STATUS_TONE[status]}
              label={RECIPIENT_STATUS_LABEL[status]}
            />
            {announcement.revoked_at ? <StatusBadge tone="error" label="Đã thu hồi" /> : null}
          </div>
          <DialogTitle className="min-w-0 break-words text-body-lg">
            {announcement.title || "(Chưa có tiêu đề)"}
          </DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            Người gửi: {senderName} · Hạn xác nhận: {formatHanoiDateTime(row.due_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          <div className="min-w-0 rounded-control border border-border-default p-3">
            <AnnouncementBody body={announcement.body} />
          </div>

          <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-helper text-text-muted">Người gửi</dt>
              <dd className="break-words text-label text-text-primary">{senderName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-helper text-text-muted">Thời gian gửi</dt>
              <dd className="text-label text-text-primary">
                {formatHanoiDateTime(announcement.published_at ?? announcement.created_at)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-helper text-text-muted">Thời gian xử lý</dt>
              <dd className="text-label text-text-primary">
                {row.acknowledged_at
                  ? `${formatHanoiDateTime(row.acknowledged_at)}${row.is_late ? " (trễ hạn)" : ""}`
                  : "Chưa xử lý"}
              </dd>
            </div>
          </dl>

          {!active ? (
            <p className="text-helper text-text-muted">
              Thông báo không còn hiệu lực, bạn không cần xác nhận.
            </p>
          ) : null}

          {hasQuestions && canAcknowledge ? (
            <p className="rounded-control border border-border-default bg-surface-subtle p-3 text-helper text-text-muted">
              Thông báo có khảo sát bắt buộc — mở trang chi tiết để trả lời rồi xác nhận.
            </p>
          ) : null}

          {announcement.comments_enabled ? (
            <div className="min-w-0 border-t border-border-default pt-3">
              {showComments ? (
                <div className="flex min-w-0 max-h-[40vh] flex-col gap-3 overflow-y-auto">
                  <CommentThread
                    announcementId={row.announcement_id}
                    authorId={announcement.created_by}
                    commentsEnabled={announcement.comments_enabled}
                    active={active}
                    canModerate={canModerate}
                    readOnly={Boolean(announcement.archived_at)}
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowComments(true)}
                >
                  Xem trao đổi
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border-default bg-surface-base p-4 sm:p-5">
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/announcements/$announcementId"
              params={{ announcementId: row.announcement_id }}
            >
              <ExternalLink />
              Trang đầy đủ
            </Link>
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            {canAcknowledge && !hasQuestions ? (
              <Button
                type="button"
                loading={ack.isPending}
                disabled={ack.isPending || survey.isLoading}
                onClick={() =>
                  ack.mutate(
                    { row },
                    {
                      onSuccess: () => {
                        toast.success("Đã xác nhận đọc thông báo");
                        onOpenChange(false);
                      },
                      onError: (error: Error) => toast.error(error.message),
                    },
                  )
                }
              >
                Xác nhận đã đọc
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
