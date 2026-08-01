import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { AnnouncementBody } from "@/components/announcement/announcement-body";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — card/accordion thông báo nội bộ dùng chung.
 * Dùng ở tab "Thông báo của tôi" và khối "Thông báo cần xác nhận" tại Trang chủ.
 * Mở card KHÔNG tự xác nhận; xác nhận chỉ xảy ra khi người nhận bấm nút.
 */
interface Props {
  row: InboxRow;
  senderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Thu gọn bớt metadata khi hiển thị trong Dashboard. */
  compact?: boolean;
}

function preview(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export function AnnouncementAckCard({ row, senderName, open, onOpenChange, compact }: Props) {
  const status = effectiveRecipientStatus(row);
  const done = row.status === "completed" || row.status === "exempt";
  const active = isAnnouncementActive(row.announcement);
  const canAcknowledge = !done && active;
  const contentId = `announcement-card-${row.id}`;

  // Khảo sát bắt buộc phải trả lời tại trang chi tiết — không rút gọn luồng.
  const survey = useQuery({
    ...surveyQuery(row.announcement_id, row.announcement.current_version),
    enabled: open && canAcknowledge,
  });
  const hasQuestions = (survey.data?.questions.length ?? 0) > 0;

  const ack = useAcknowledgeAnnouncement();

  function confirm() {
    ack.mutate(
      { row },
      {
        onSuccess: () => toast.success("Đã xác nhận đọc thông báo"),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  return (
    <Card
      className={cn(
        "min-w-0",
        status === "overdue" ? "border-state-danger/50" : null,
        !done && status !== "overdue" ? "border-border-strong" : null,
      )}
    >
      <CardContent className="flex min-w-0 flex-col gap-3 pt-(--card-pad)">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="min-w-0 break-words text-body font-semibold text-text-primary">
              {row.announcement.title || "(Chưa có tiêu đề)"}
            </span>
            <span className="min-w-0 break-words text-helper text-text-muted">
              Người gửi: {senderName}
              {!compact && row.announcement.published_at
                ? ` · Phát hành ${formatHanoiDateTime(row.announcement.published_at)}`
                : ""}
            </span>
            <span
              className={cn(
                "min-w-0 break-words text-helper",
                status === "overdue" ? "text-state-danger" : "text-text-muted",
              )}
            >
              Hạn xác nhận: {formatHanoiDateTime(row.due_at)}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge tone={RECIPIENT_STATUS_TONE[status]} label={RECIPIENT_STATUS_LABEL[status]} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={contentId}
              onClick={() => onOpenChange(!open)}
            >
              <ChevronDown className={cn("cen-transition", open ? "rotate-180" : null)} />
              {open ? "Thu gọn" : "Xem nội dung"}
            </Button>
          </div>
        </div>

        {!open ? (
          <p className="min-w-0 break-words text-helper text-text-muted">
            {preview(row.announcement.body)}
          </p>
        ) : (
          <div id={contentId} className="flex min-w-0 flex-col gap-3">
            <div className="max-h-[45vh] min-w-0 overflow-y-auto rounded-control border border-border-default p-3">
              <AnnouncementBody body={row.announcement.body} />
            </div>

            {done ? (
              <p className="text-helper text-text-muted">
                {row.acknowledged_at
                  ? `Đã xác nhận lúc ${formatHanoiDateTime(row.acknowledged_at)}${row.is_late ? " (trễ hạn)" : ""}`
                  : "Bạn được miễn xác nhận thông báo này."}
              </p>
            ) : null}

            {!active ? (
              <p className="text-helper text-text-muted">
                Thông báo không còn hiệu lực, bạn không cần xác nhận.
              </p>
            ) : null}

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link
                  to="/announcements/$announcementId"
                  params={{ announcementId: row.announcement_id }}
                >
                  <MessageSquare />
                  Xem chi tiết &amp; thảo luận
                </Link>
              </Button>

              {canAcknowledge ? (
                hasQuestions ? (
                  <p className="min-w-0 break-words text-helper text-text-muted">
                    Thông báo có khảo sát bắt buộc — mở trang chi tiết để trả lời rồi xác nhận.
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    loading={ack.isPending}
                    disabled={ack.isPending || survey.isLoading}
                    onClick={confirm}
                  >
                    Xác nhận đã đọc
                  </Button>
                )
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
