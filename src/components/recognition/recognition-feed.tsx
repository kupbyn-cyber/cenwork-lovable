import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Sparkles, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  RECOGNITION_CATEGORY_META,
  canRevoke,
  isSelfRecognition,
  recognitionReactionsQuery,
  recognitionsQuery,
  reportRecognition,
  revokeRecognition,
  type RecognitionReactionRow,
  type RecognitionRow,
} from "@/lib/recognition-data";
import { cn } from "@/lib/utils";
import { RecognitionReactionBar } from "@/components/recognition/recognition-reaction-bar";

/**
 * CEN TODAY-02 — Feed ghi nhận đồng đội.
 * Chỉ hiển thị dữ liệu người dùng được phép đọc (RLS); phân trang tải thêm theo trang.
 */
export interface RecognitionFeedProps {
  /** Lọc theo một người (gửi hoặc nhận). Bỏ trống để xem toàn bộ phạm vi. */
  personId?: string | null;
  pageSize?: number;
  /** Ẩn tiêu đề khi nhúng vào khối khác. */
  compact?: boolean;
}

function RecognitionCard({
  row,
  userId,
  reactions,
  onRevoke,
  onReport,
  revoking,
}: {
  row: RecognitionRow;
  userId: string | null;
  reactions: RecognitionReactionRow[];
  onRevoke: (id: string) => void;
  onReport: (row: RecognitionRow) => void;
  revoking: boolean;
}) {
  const self = isSelfRecognition(row);
  const meta = RECOGNITION_CATEGORY_META[row.category];
  return (
    <Card density="compact">
      <CardContent className="flex min-w-0 flex-col gap-2 pt-(--card-pad)">
        <div className="flex min-w-0 items-start gap-3">
          <EntityAvatar name={row.sender?.display_name ?? "?"} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="min-w-0 break-words text-body text-text-primary">
              <strong>{row.sender?.display_name ?? "Ẩn danh"}</strong>
              {self ? (
                <span className="text-text-muted"> đã tự ghi nhận</span>
              ) : (
                <>
                  <span className="text-text-muted"> đã ghi nhận </span>
                  <strong>{row.receiver?.display_name ?? "đồng đội"}</strong>
                </>
              )}
            </p>
            <p className="text-helper text-text-muted">{formatHanoiDateTime(row.created_at)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {self ? <Badge variant="outline">Tự ghi nhận</Badge> : null}
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-badge border px-2 py-0.5 text-helper font-medium",
                meta.tone,
              )}
            >
              <span aria-hidden>{meta.emoji}</span>
              <span className="min-w-0 truncate">{meta.label}</span>
            </span>
          </div>
        </div>
        <p className="min-w-0 break-words text-body text-text-secondary">{row.message}</p>
        <RecognitionReactionBar
          recognitionId={row.id}
          reactions={reactions}
          userId={userId}
        />
        <div className="flex flex-wrap gap-2">
          {canRevoke(row, userId) ? (
            <Button
              variant="ghost"
              size="sm"
              loading={revoking}
              onClick={() => onRevoke(row.id)}
            >
              <Undo2 />
              Thu hồi
            </Button>
          ) : null}
          {userId && row.sender_id !== userId ? (
            <Button variant="ghost" size="sm" onClick={() => onReport(row)}>
              <Flag />
              Báo cáo nội dung
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecognitionFeed({ personId = null, pageSize = 20 }: RecognitionFeedProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(0);
  const [reporting, setReporting] = React.useState<RecognitionRow | null>(null);
  const [reason, setReason] = React.useState("");

  const filter = { personId, limit: pageSize * (page + 1), offset: 0 };
  const { data, isLoading, isError, refetch } = useQuery(recognitionsQuery(filter));

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeRecognition(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recognitions"] });
      cenToast.success("Đã thu hồi lời ghi nhận.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      reportRecognition({
        recognitionId: reporting!.id,
        reporterId: user!.id,
        reason,
      }),
    onSuccess: () => {
      cenToast.success("Đã gửi báo cáo tới quản trị hệ thống.");
      setReporting(null);
      setReason("");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const rows = data ?? [];
  const reactionsResult = useQuery(recognitionReactionsQuery(rows.map((row) => row.id)));
  const reactions = reactionsResult.data ?? [];

  if (isLoading) return <SkeletonCard lines={4} />;
  if (isError) {
    return (
      <Card>
        <CardContent className="pt-(--card-pad)">
          <ErrorState onRetry={() => void refetch()} />
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-(--card-pad)">
          <EmptyState
            icon={Sparkles}
            title="Chưa có lời ghi nhận nào"
            description="Hãy là người đầu tiên ghi nhận đóng góp của đồng đội."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {rows.map((row) => (
        <RecognitionCard
          key={row.id}
          row={row}
          userId={user?.id ?? null}
          reactions={reactions}
          onRevoke={(id) => revokeMutation.mutate(id)}
          onReport={(target) => {
            setReporting(target);
            setReason("");
          }}
          revoking={revokeMutation.isPending && revokeMutation.variables === row.id}
        />
      ))}

      {rows.length >= pageSize * (page + 1) ? (
        <Button variant="secondary" className="self-center" onClick={() => setPage(page + 1)}>
          Tải thêm
        </Button>
      ) : null}

      <Modal
        open={Boolean(reporting)}
        onOpenChange={(open) => {
          if (!open) setReporting(null);
        }}
        size="sm"
        title="Báo cáo nội dung"
        description="Quản trị hệ thống sẽ xem xét lời ghi nhận này."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReporting(null)}>
              Hủy
            </Button>
            <Button
              loading={reportMutation.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => reportMutation.mutate()}
            >
              Gửi báo cáo
            </Button>
          </div>
        }
      >
        <Textarea
          rows={4}
          maxLength={500}
          placeholder="Mô tả ngắn gọn lý do báo cáo (tối thiểu 5 ký tự)."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Modal>
    </div>
  );
}
