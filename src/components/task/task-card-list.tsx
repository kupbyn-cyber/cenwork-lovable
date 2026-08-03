import * as React from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { DeadlineCountdown, PriorityLabel } from "@/components/task/task-cell-bits";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskRow,
} from "@/lib/task-data";
import type { OptionalColumnId } from "@/lib/task-view-data";

/**
 * CEN 1.0 — Dạng card cho trang Công việc trên mobile/tablet.
 * Chỉ trình bày lại dữ liệu đã lọc; action do phía gọi cung cấp.
 */
export interface TaskCardListProps {
  tasks: TaskRow[];
  columns: OptionalColumnId[];
  onOpen: (task: TaskRow) => void;
  renderActions: (task: TaskRow) => React.ReactNode;
}

export function TaskCardList({ tasks, columns, onOpen, renderActions }: TaskCardListProps) {
  const show = (id: OptionalColumnId) => columns.includes(id);

  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="rounded-lg border border-border-subtle bg-surface-default p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onOpen(task)}
            >
              <p className="truncate text-body font-medium text-text-primary">{task.name}</p>
              {show("project") ? (
                <p className="mt-1 truncate text-caption text-text-muted">
                  {task.projectName ?? (
                    <Badge variant="outline" className="font-normal">
                      Công việc độc lập
                    </Badge>
                  )}
                </p>
              ) : null}
            </button>
            <div onClick={(event) => event.stopPropagation()}>{renderActions(task)}</div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {show("status") ? (
              <StatusBadge
                label={TASK_STATUS_LABEL[task.status]}
                tone={TASK_STATUS_TONE[task.status]}
              />
            ) : null}
            <DeadlineCountdown task={task} className="inline-block w-auto" />
            {show("priority") ? <PriorityLabel priority={task.priority} /> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-secondary">
            <span className="truncate">{task.assigneeName ?? "—"}</span>
            {show("team") && task.teamName ? <span className="truncate">{task.teamName}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
