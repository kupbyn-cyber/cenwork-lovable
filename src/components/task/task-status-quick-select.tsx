import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  canChangeTaskStatus,
  setTaskStatus,
  taskStatusView,
  type TaskAccessContext,
  type TaskRow,
  type TaskStatus,
} from "@/lib/task-data";

/**
 * CEN-FINAL-OPS-FIX — cập nhật nhanh trạng thái Task ngay ngoài danh sách.
 * Chỉ là lối tắt của cùng nghiệp vụ: quyền do database quyết định,
 * chuyển sang "Hoàn thành" vẫn bắt buộc nhập Kết quả (mở hộp thoại hoàn thành).
 */
export function TaskStatusQuickSelect({
  task,
  ctx,
  onRequestComplete,
}: {
  task: TaskRow;
  ctx: TaskAccessContext;
  onRequestComplete: (task: TaskRow) => void;
}) {
  const queryClient = useQueryClient();
  const view = taskStatusView(task);
  const editable = canChangeTaskStatus(task, ctx);

  const mutation = useMutation({
    mutationFn: (status: TaskStatus) => setTaskStatus(task.id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      cenToast.success("Đã cập nhật trạng thái công việc.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  if (!editable) return <StatusBadge label={view.label} tone={view.tone} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Cập nhật nhanh trạng thái"
          disabled={mutation.isPending}
          className="inline-flex min-w-0 items-center gap-1 rounded-control px-1 py-0.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-60"
          onClick={(event) => event.stopPropagation()}
        >
          <StatusBadge label={view.label} tone={view.tone} />
          <ChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
        {TASK_STATUS_ORDER.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={status === task.status}
            onSelect={(event) => {
              event.preventDefault();
              if (status === task.status) return;
              if (status === "done") {
                onRequestComplete(task);
                return;
              }
              mutation.mutate(status);
            }}
          >
            {TASK_STATUS_LABEL[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
