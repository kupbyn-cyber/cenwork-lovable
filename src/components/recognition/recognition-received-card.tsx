import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  RECOGNITION_CATEGORY_META,
  markRecognitionsSeen,
  unseenRecognitionsQuery,
} from "@/lib/recognition-data";

/**
 * RECOG-FIX-05 — Banner "Bạn vừa được ghi nhận" trên Trang chủ.
 * Chỉ kiểm tra khi tải lại Trang chủ (không Realtime), hiện đúng một banner,
 * bấm "Cảm ơn" đánh dấu đã xem và không gửi thông báo ngược cho người gửi.
 */
const BANNER_PREVIEW_LENGTH = 160;

function previewLine(message: string): string {
  const text = message.trim();
  if (text.length <= BANNER_PREVIEW_LENGTH) return text;
  return `${text.slice(0, BANNER_PREVIEW_LENGTH).trimEnd()}...`;
}

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
    <section
      role="status"
      aria-live="polite"
      aria-label="Ghi nhận đồng đội mới"
      className="motion-safe:animate-fade-in min-w-0 rounded-card border border-state-warning/40 bg-gradient-to-r from-brand-subtle via-surface-subtle to-surface-default p-4 shadow-md"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-state-warning/40 bg-state-warning-surface">
            <Sparkles className="size-icon-sm text-state-warning" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="min-w-0 text-body font-semibold text-text-primary">
              {single ? "Bạn vừa được ghi nhận" : `Bạn có ${rows.length} ghi nhận mới`}
            </p>
            {single ? (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-body-sm font-medium text-text-primary">
                    {single.sender_name ?? "Đồng đội"}
                  </span>
                  {meta ? (
                    <span className={`rounded-full border px-2 py-0.5 text-caption ${meta.tone}`}>
                      {meta.emoji} {meta.label}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 min-w-0 break-words text-body-sm text-text-secondary">
                  “{previewLine(single.message)}”
                </p>
                <span className="text-helper text-text-muted">
                  {formatHanoiDateTime(single.created_at)}
                </span>
              </>
            ) : (
              <p className="min-w-0 break-words text-body-sm text-text-secondary">
                Đồng đội vừa dành cho bạn những lời ghi nhận.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" asChild onClick={close}>
            <Link to="/recognitions">Xem ghi nhận</Link>
          </Button>
          <Button type="button" size="sm" onClick={close} disabled={markSeen.isPending}>
            Cảm ơn
          </Button>
        </div>
      </div>
    </section>
  );
}
