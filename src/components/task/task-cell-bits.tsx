import * as React from "react";
import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatUnreadBadge } from "@/lib/task-comment-data";
import {
  TASK_PRIORITY_LABEL,
  taskDeadlineCountdown,
  type DeadlineTone,
  type TaskPriority,
  type TaskRow,
} from "@/lib/task-data";

/**
 * CEN 1.0 — TASK-LIST-UI-02.
 * Các mảnh trình bày dùng chung cho bảng và card Công việc.
 * Chỉ hiển thị: không chạm Business Rule, dữ liệu hay quyền.
 */

const deadlineToneClass: Record<DeadlineTone, string> = {
  muted: "text-text-muted",
  safe: "text-text-secondary",
  warning: "text-state-warning",
  danger: "text-state-danger",
};

/** Bộ đếm tương đối; tự làm mới mỗi phút để không "đứng hình". */
export function DeadlineCountdown({ task, className }: { task: TaskRow; className?: string }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { label, tone } = taskDeadlineCountdown(task, now);
  return (
    <span
      className={cn(
        "block truncate text-caption font-medium tabular-nums",
        deadlineToneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

const priorityTextClass: Record<TaskPriority, string> = {
  high: "text-text-primary",
  medium: "text-text-secondary",
  low: "text-text-muted",
};

/** Mức ưu tiên dạng nhẹ: chấm đỏ nhỏ cho mức Cao, còn lại chỉ là chữ. */
export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-caption whitespace-nowrap",
        priorityTextClass[priority],
      )}
    >
      {priority === "high" ? (
        <span className="size-1.5 shrink-0 rounded-full bg-state-danger" aria-hidden />
      ) : null}
      {TASK_PRIORITY_LABEL[priority]}
    </span>
  );
}

/**
 * Icon bình luận + badge chưa đọc (tính riêng theo người dùng).
 * Bấm vào sẽ mở chi tiết Task tại khu vực Bình luận.
 */
export function CommentIndicator({
  unread,
  onOpen,
  className,
}: {
  unread: number;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={unread > 0 ? `${unread} bình luận chưa đọc` : "Mở bình luận"}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <MessageSquare className="size-4" />
      {unread > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-state-danger px-1 text-[10px] leading-4 font-semibold text-brand-foreground">
          {formatUnreadBadge(unread)}
        </span>
      ) : null}
    </button>
  );
}