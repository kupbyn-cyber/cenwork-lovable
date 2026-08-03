import * as React from "react";

import { cn } from "@/lib/utils";
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