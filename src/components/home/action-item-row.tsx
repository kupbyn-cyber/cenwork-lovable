import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatHanoiDateTime } from "@/lib/datetime";
import { setTaskStatus } from "@/lib/task-data";
import {
  ACTION_MODULE_LABEL,
  ACTION_REASON_LABEL,
  ACTION_REASON_TONE,
  type ActionItem,
} from "@/lib/today-hub";

/**
 * CEN TODAY-01 — một mục việc cần xử lý.
 * Chỉ điều hướng tới màn hình gốc hoặc gọi lại đúng handler sẵn có của module.
 */
export function ActionItemRow({ item, onDone }: { item: ActionItem; onDone?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const complete = useMutation({
    mutationFn: () => setTaskStatus(item.object_id, "done"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      toast.success("Đã cập nhật công việc.");
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = React.useCallback(() => {
    onDone?.();
    void navigate({ to: item.target_route as never });
  }, [item.target_route, navigate, onDone]);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-border-default bg-surface p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-caption tracking-[0.1em] text-text-muted uppercase">
            {ACTION_MODULE_LABEL[item.module]}
          </span>
          {item.reasons.map((reason) => (
            <StatusBadge
              key={reason}
              label={ACTION_REASON_LABEL[reason]}
              tone={ACTION_REASON_TONE[reason]}
            />
          ))}
        </div>
        <span className="min-w-0 break-words text-body font-medium text-text-primary">
          {item.title}
        </span>
        <span className="text-helper text-text-muted">
          {item.summary}
          {item.deadline ? ` · Hạn ${formatHanoiDateTime(item.deadline)}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        {item.quick_action === "complete_task" ? (
          <Button
            variant="secondary"
            size="sm"
            loading={complete.isPending}
            onClick={() => complete.mutate()}
          >
            <CheckCircle2 />
            Hoàn thành
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={open}>
          Mở
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
