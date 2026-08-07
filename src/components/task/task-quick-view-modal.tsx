import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { DeadlineCountdown } from "@/components/task/task-cell-bits";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_REVIEWER_LABEL,
  formatDate,
  formatDateTime,
  isTaskOverdue,
  taskStatusView,
  taskTimeProgress,
  type TaskRow,
} from "@/lib/task-data";

/**
 * TASK-WORKFLOW-UX-01 — Nhìn nhanh công việc.
 * Chỉ trình bày dữ liệu đã tải sẵn; mọi thao tác nghiệp vụ nằm ở trang chi tiết.
 */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border-default bg-surface-subtle p-3">
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-body-sm text-text-primary">{value}</span>
    </div>
  );
}

export interface TaskQuickViewModalProps {
  /** null = đóng modal. */
  task: TaskRow | null;
  onOpenChange: (open: boolean) => void;
}

export function TaskQuickViewModal({ task, onOpenChange }: TaskQuickViewModalProps) {
  const view = task ? taskStatusView(task) : null;
  const progress = task ? taskTimeProgress(task) : null;

  return (
    <Modal
      size="lg"
      open={task !== null}
      onOpenChange={onOpenChange}
      title={task?.name ?? "Công việc"}
      description={task?.projectName ? `Dự án: ${task.projectName}` : "Công việc độc lập"}
      footer={
        task ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button asChild>
              <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
                Mở chi tiết
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        ) : null
      }
    >
      {task && view ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge label={view.label} tone={view.tone} />
            <StatusBadge
              label={TASK_PRIORITY_LABEL[task.priority]}
              tone={TASK_PRIORITY_TONE[task.priority]}
            />
            <DeadlineCountdown
              task={task}
              className={cn("text-body font-semibold", isTaskOverdue(task) && "text-state-danger")}
            />
            <span className="text-caption text-text-muted">{formatDateTime(task.deadline)}</span>
          </div>

          {progress !== null ? (
            <div className="flex flex-col gap-1">
              <span className="text-caption uppercase tracking-wide text-text-muted">
                Tiến độ thời gian
              </span>
              <Progress value={progress} />
              <span className="text-caption tabular-nums text-text-muted">{progress}%</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fact label="Người phụ trách" value={task.assigneeName ?? "—"} />
            <Fact
              label="Người duyệt"
              value={
                task.reviewerName
                  ? `${task.reviewerName}${
                      task.reviewer_type ? ` (${TASK_REVIEWER_LABEL[task.reviewer_type]})` : ""
                    }`
                  : "—"
              }
            />
            <Fact label="Team phụ trách" value={task.teamName ?? "—"} />
            <Fact label="Ngày bắt đầu" value={formatDate(task.start_date)} />
            <Fact label="Người tạo" value={task.creatorName ?? "—"} />
            <Fact
              label="Người tham gia"
              value={task.participantNames.length === 0 ? "—" : task.participantNames.join(", ")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-caption uppercase tracking-wide text-text-muted">Mô tả</span>
            {task.description ? (
              <LinkifiedText
                as="p"
                className="text-body-sm text-text-secondary"
                text={task.description}
              />
            ) : (
              <p className="text-body-sm text-text-muted">Chưa có mô tả.</p>
            )}
          </div>

          {task.result_text ? (
            <div className="flex flex-col gap-1">
              <span className="text-caption uppercase tracking-wide text-text-muted">
                Kết quả công việc
              </span>
              <LinkifiedText
                as="p"
                className="text-body-sm text-text-secondary"
                text={task.result_text}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
