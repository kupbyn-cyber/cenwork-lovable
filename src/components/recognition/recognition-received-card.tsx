import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Clock3, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  RECOGNITION_CATEGORY_META,
  markRecognitionsSeen,
  unseenRecognitionsQuery,
} from "@/lib/recognition-data";

/**
 * RECOG-UI-08 — Banner "Bạn vừa được ghi nhận" trên Trang chủ.
 * 3 vùng: trái (thông tin) — giữa (quote lớn, điểm nhấn) — phải (hành động).
 * Chỉ kiểm tra khi tải lại Trang chủ (không Realtime), bấm "Cảm ơn" đánh dấu đã xem.
 */
const BANNER_PREVIEW_LENGTH = 150;

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
  const quote = single
    ? previewLine(single.message)
    : `Đồng đội vừa dành cho bạn ${rows.length} lời ghi nhận.`;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Ghi nhận đồng đội mới"
      className="cen-recog-in cen-recog-surface relative min-w-0 overflow-hidden rounded-card border border-state-warning/35 shadow-md ring-1 ring-inset ring-state-warning/10"
    >
      <div className="relative z-10 grid min-w-0 grid-cols-1 items-center gap-4 px-4 py-4 sm:px-6 lg:min-h-[7rem] lg:grid-cols-[minmax(0,24%)_minmax(0,1fr)_minmax(0,20%)] lg:gap-6">
        {/* A — Vùng trái: thông tin */}
        <div className="order-2 flex min-w-0 items-start gap-3 lg:order-none">
          <span className="cen-recog-pulse mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-full border border-state-warning/40 bg-state-warning-surface sm:flex">
            <Award className="size-icon-sm text-state-warning" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-caption font-medium uppercase tracking-wide text-state-warning/80">
              Ghi nhận đồng đội
            </span>
            <p className="min-w-0 text-body-sm font-semibold text-text-primary">
              {single ? "Bạn vừa được ghi nhận" : `Bạn có ${rows.length} ghi nhận mới`}
            </p>
            {single ? (
              <>
                <p className="min-w-0 truncate text-body-sm text-text-secondary">
                  Từ{" "}
                  <span className="font-medium text-text-primary">
                    {single.sender_name ?? "Đồng đội"}
                  </span>
                </p>
                <span className="flex min-w-0 items-center gap-1 text-helper text-text-muted">
                  <Clock3 className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{formatHanoiDateTime(single.created_at)}</span>
                </span>
                {meta ? (
                  <span
                    className={`mt-1 w-fit rounded-full border px-2 py-0.5 text-caption ${meta.tone}`}
                  >
                    {meta.emoji} {meta.label}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* B — Vùng giữa: quote lớn, điểm nhấn */}
        <blockquote className="order-1 flex min-w-0 flex-col items-center justify-center gap-1 text-center lg:order-none">
          <Sparkles
            className="cen-recog-pulse hidden size-icon-sm text-state-warning/80 sm:block"
            aria-hidden="true"
          />
          <p className="line-clamp-2 min-w-0 break-words text-body font-semibold leading-snug text-state-warning sm:text-[1.25rem] lg:text-[1.4rem]">
            <span aria-hidden="true">“</span>
            {quote}
            <span aria-hidden="true">”</span>
          </p>
        </blockquote>

        {/* C — Vùng phải: hành động */}
        <div className="order-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:order-none lg:flex-col lg:items-stretch lg:justify-center">
          <Button type="button" size="sm" onClick={close} disabled={markSeen.isPending}>
            Cảm ơn
          </Button>
          <Button variant="secondary" size="sm" asChild onClick={close}>
            <Link to="/recognitions">Xem ghi nhận</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
