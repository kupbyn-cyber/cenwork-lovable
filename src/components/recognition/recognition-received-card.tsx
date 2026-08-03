import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  RECOGNITION_CATEGORY_META,
  markRecognitionsSeen,
  previewRecognitionMessage,
  unseenRecognitionsQuery,
} from "@/lib/recognition-data";

/**
 * RECOG-02 — Thiệp "Bạn vừa được ghi nhận".
 * Chỉ kiểm tra khi tải lại Trang chủ (không Realtime), hiện đúng một thiệp,
 * bấm "Cảm ơn" đánh dấu đã xem và không gửi thông báo ngược cho người gửi.
 */
export function RecognitionReceivedCard({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = React.useState(false);
  const { data } = useQuery(unseenRecognitionsQuery(userId));
  const rows = data ?? [];

  const markSeen = useMutation({
    mutationFn: markRecognitionsSeen,
    onSuccess: () => {
      queryClient.setQueryData(["recognitions-unseen", userId ?? "anon"], []);
    },
  });

  if (dismissed || rows.length === 0) return null;

  const close = () => {
    setDismissed(true);
    markSeen.mutate();
  };

  const single = rows.length === 1 ? rows[0] : null;
  const meta = single ? RECOGNITION_CATEGORY_META[single.category] : null;

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      size="sm"
      title={single ? "Bạn vừa được ghi nhận" : `Bạn có ${rows.length} ghi nhận mới`}
      description={single ? undefined : "Đồng đội vừa dành cho bạn những lời ghi nhận."}
      contentClassName="p-0"
      footer={
        <>
          {single ? null : (
            <Button variant="secondary" asChild onClick={close}>
              <Link to="/recognitions">Xem danh sách</Link>
            </Button>
          )}
          <Button type="button" onClick={close} disabled={markSeen.isPending}>
            Cảm ơn
          </Button>
        </>
      }
    >
      <div className="motion-safe:animate-scale-in motion-reduce:animate-fade-in flex min-w-0 flex-col gap-3 p-4">
        {single ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-h3">
                {meta?.emoji ?? "✨"}
              </span>
              <span className="min-w-0 truncate text-body font-medium text-text-primary">
                {single.sender_name ?? "Đồng đội"}
              </span>
              {meta ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-caption ${meta.tone}`}
                >
                  {meta.label}
                </span>
              ) : null}
            </div>
            <p className="min-w-0 break-words text-body text-text-primary">
              “{previewRecognitionMessage(single.message)}”
            </p>
            <span className="text-helper text-text-muted">
              {formatHanoiDateTime(single.created_at)}
            </span>
          </>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {rows.slice(0, 4).map((row) => (
              <li key={row.id} className="flex min-w-0 items-center gap-2">
                <span aria-hidden>{RECOGNITION_CATEGORY_META[row.category]?.emoji ?? "✨"}</span>
                <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                  {row.sender_name ?? "Đồng đội"} — {row.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
