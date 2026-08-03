import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { cenToast } from "@/components/ui/toast";
import {
  RECOGNITION_REACTIONS,
  reactToRecognition,
  summarizeReactions,
  type RecognitionReactionEmoji,
  type RecognitionReactionRow,
} from "@/lib/recognition-data";

/**
 * RECOGNITION-01 — thanh reaction cho một lời ghi nhận.
 * Mỗi người tối đa một reaction; bấm lại emoji đang chọn để bỏ.
 * Ràng buộc thật nằm ở database (unique index + hàm recognition_react).
 */
export interface RecognitionReactionBarProps {
  recognitionId: string;
  reactions: RecognitionReactionRow[];
  userId: string | null;
  /** Tài khoản khóa/lưu trữ không được reaction mới. */
  disabled?: boolean;
}

export function RecognitionReactionBar({
  recognitionId,
  reactions,
  userId,
  disabled = false,
}: RecognitionReactionBarProps) {
  const queryClient = useQueryClient();
  const { counts, mine } = React.useMemo(
    () => summarizeReactions(reactions, recognitionId, userId),
    [reactions, recognitionId, userId],
  );

  const mutation = useMutation({
    mutationFn: (emoji: RecognitionReactionEmoji | null) =>
      reactToRecognition(recognitionId, emoji),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recognition-reactions"] });
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bày tỏ cảm xúc">
      {RECOGNITION_REACTIONS.map((emoji) => {
        const active = mine === emoji;
        const count = counts[emoji] ?? 0;
        return (
          <button
            key={emoji}
            type="button"
            disabled={disabled || !userId || mutation.isPending}
            aria-pressed={active}
            aria-label={`Cảm xúc ${emoji}${count > 0 ? ` (${count})` : ""}`}
            onClick={() => mutation.mutate(active ? null : emoji)}
            className={cn(
              "cen-transition inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-badge border px-2 text-helper",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "motion-safe:active:scale-95",
              active
                ? "border-brand-secondary bg-brand-subtle text-text-primary"
                : "border-border-default bg-state-neutral-surface text-text-secondary hover:border-border-strong",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}