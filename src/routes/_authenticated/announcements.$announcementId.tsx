import * as React from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AnnouncementBody } from "@/components/announcement/announcement-body";
import { AnnouncementProgress } from "@/components/announcement/announcement-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/use-auth";
import {
  acknowledge,
  ANNOUNCEMENT_STATUS_LABEL,
  announcementQuery,
  announcementRecipientsQuery,
  effectiveRecipientStatus,
  markOpened,
  markReadCompleted,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type RecipientRow,
} from "@/lib/announcement-data";
import { formatHanoiDateTime } from "@/lib/datetime";

const TITLE = "Chi tiết thông báo nội bộ — CEN 1.0";
const DESCRIPTION =
  "Đọc toàn bộ nội dung thông báo nội bộ và xác nhận đã đọc trước hạn trong CEN 1.0.";

export const Route = createFileRoute("/_authenticated/announcements/$announcementId")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnnouncementDetailPage,
});

function AnnouncementDetailPage() {
  const { announcementId } = useParams({ from: "/_authenticated/announcements/$announcementId" });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [readToEnd, setReadToEnd] = React.useState(false);

  const announcement = useQuery(announcementQuery(announcementId));
  const recipients = useQuery(announcementRecipientsQuery(announcementId));

  const myRecipient: RecipientRow | null =
    (recipients.data ?? []).find((row) => row.user_id === user?.id) ?? null;

  const isAuthor = announcement.data?.created_by === user?.id;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["announcement-recipients", announcementId] });
    void queryClient.invalidateQueries({ queryKey: ["announcement-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["announcement-overdue"] });
  }

  React.useEffect(() => {
    if (!myRecipient) return;
    void markOpened(myRecipient).then(refresh).catch(() => undefined);
    // chỉ ghi nhận mở lần đầu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRecipient?.id]);

  React.useEffect(() => {
    if (myRecipient?.read_completed_at) setReadToEnd(true);
  }, [myRecipient?.read_completed_at]);

  const onScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node || readToEnd) return;
    const reachedEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 8;
    if (!reachedEnd) return;
    setReadToEnd(true);
    if (myRecipient) void markReadCompleted(myRecipient).then(refresh).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRecipient, readToEnd]);

  // Nội dung ngắn không tạo thanh cuộn → coi như đã đọc hết.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || readToEnd) return;
    if (node.scrollHeight <= node.clientHeight + 8) {
      setReadToEnd(true);
      if (myRecipient) void markReadCompleted(myRecipient).then(refresh).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement.data?.body, myRecipient?.id, readToEnd]);

  const ack = useMutation({
    mutationFn: () => acknowledge(myRecipient!),
    onSuccess: () => {
      refresh();
      toast.success("Đã xác nhận đọc thông báo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (announcement.isError) {
    return (
      <ErrorState
        title="Không tải được thông báo"
        description="Bạn có thể không còn quyền xem hoặc thông báo đã bị xóa."
        onRetry={() => void announcement.refetch()}
      />
    );
  }

  if (announcement.isLoading) {
    return <p className="text-body-sm text-text-muted">Đang tải…</p>;
  }

  const row = announcement.data;
  if (!row) {
    return (
      <ErrorState title="Không tìm thấy thông báo" description="Thông báo không tồn tại." />
    );
  }

  const myStatus = myRecipient ? effectiveRecipientStatus(myRecipient) : null;
  const done = myRecipient?.status === "completed" || myRecipient?.status === "exempt";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={row.title || "(Chưa có tiêu đề)"}
        description={
          row.due_at
            ? `Hạn xác nhận: ${formatHanoiDateTime(row.due_at)}`
            : "Chưa đặt hạn xác nhận."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={row.status === "published" ? "success" : "neutral"}
              label={ANNOUNCEMENT_STATUS_LABEL[row.status]}
            />
            {myStatus ? (
              <StatusBadge
                tone={RECIPIENT_STATUS_TONE[myStatus]}
                label={RECIPIENT_STATUS_LABEL[myStatus]}
              />
            ) : null}
          </div>
        }
      />

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="max-h-[55vh] min-w-0 overflow-y-auto rounded-control border border-border-default p-4"
          >
            <AnnouncementBody body={row.body} />
          </div>

          {myRecipient ? (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 break-words text-body-sm text-text-muted">
                {done
                  ? myRecipient.acknowledged_at
                    ? `Đã xác nhận lúc ${formatHanoiDateTime(myRecipient.acknowledged_at)}${myRecipient.is_late ? " (trễ hạn)" : ""}`
                    : "Bạn được miễn xác nhận thông báo này."
                  : readToEnd
                    ? "Bạn đã đọc hết nội dung, có thể xác nhận."
                    : "Cuộn hết nội dung để bật nút xác nhận."}
              </p>
              {!done ? (
                <Button
                  type="button"
                  disabled={!readToEnd || ack.isPending}
                  loading={ack.isPending}
                  onClick={() => ack.mutate()}
                >
                  Tôi đã đọc và xác nhận
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isAuthor ? (
        <Card>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <SectionHeader
              title="Tiến độ xác nhận"
              description="Theo dõi trạng thái của từng người nhận."
            />
            <AnnouncementProgress announcementId={announcementId} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
