import * as React from "react";
import { taskWeightBadgeLabel } from "@/lib/task-weight";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { DeadlineCountdown } from "@/components/task/task-cell-bits";
import { TaskCommentComposer } from "@/components/task/task-comment-composer";
import { taskCommentsQuery } from "@/lib/task-comment-data";
import { formatHanoiDateTime } from "@/lib/datetime";
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
 * TASK-WORKFLOW-UX-01 / TASK-QUICKVIEW-01 — Nhìn nhanh công việc.
 * Ưu tiên Deadline → Mô tả → Bình luận; metadata là cột phụ.
 * Chỉ tải bình luận khi modal mở; mọi quyền do RLS/RPC quyết định.
 */
const PREVIEW_COUNT = 3;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-body-sm text-text-primary">{value}</span>
    </div>
  );
}

function ageLabel(createdAt: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 3600 * 1000)),
  );
  return days === 0 ? "Tạo hôm nay" : `Tuổi việc ${days} ngày`;
}

function QuickComments({ taskId }: { taskId: string }) {
  const comments = useQuery(taskCommentsQuery(taskId));
  const rows = comments.data ?? [];
  const preview = rows.slice(-PREVIEW_COUNT);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption uppercase tracking-wide text-text-muted">
          Bình luận / Cập nhật {rows.length > 0 ? `(${rows.length})` : ""}
        </span>
        {rows.length > preview.length ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tasks/$taskId" params={{ taskId }} hash="task-comments">
              Xem tất cả
            </Link>
          </Button>
        ) : null}
      </div>

      {comments.isLoading ? (
        <p className="text-caption text-text-muted">Đang tải bình luận…</p>
      ) : preview.length === 0 ? (
        <p className="text-body-sm text-text-muted">Chưa có bình luận nào.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {preview.map((row) => (
            <li key={row.id} className="rounded-card border border-border-subtle p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-body-sm font-medium text-text-primary">{row.authorName}</span>
                <span className="text-caption text-text-muted">
                  {formatHanoiDateTime(row.created_at)}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-body-sm text-text-secondary">
                <LinkifiedText text={row.body} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <TaskCommentComposer taskId={taskId} rows={2} />
    </section>
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
  const overdue = task ? isTaskOverdue(task) : false;

  return (
    <Modal
      size="xl"
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
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={view.label} tone={view.tone} />
            <StatusBadge
              label={TASK_PRIORITY_LABEL[task.priority]}
              tone={TASK_PRIORITY_TONE[task.priority]}
            />
            <StatusBadge label={taskWeightBadgeLabel(task.work_weight)} tone="neutral" />
            <span className="text-caption text-text-muted">{ageLabel(task.created_at)}</span>
          </div>

          {/* Deadline là thông tin nổi bật nhất sau tên Task. */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-card border p-3",
              overdue
                ? "border-state-danger/40 bg-state-danger/10"
                : "border-border-default bg-surface-subtle",
            )}
          >
            <div className="flex items-center gap-2">
              <CalendarClock
                className={cn("size-5", overdue ? "text-state-danger" : "text-text-muted")}
              />
              <div className="flex flex-col">
                <span className="text-caption uppercase tracking-wide text-text-muted">
                  Hạn hoàn thành
                </span>
                <span className="text-body font-semibold text-text-primary">
                  {formatDateTime(task.deadline)}
                </span>
              </div>
            </div>
            <DeadlineCountdown
              task={task}
              className={cn(
                "text-heading-sm font-semibold",
                overdue ? "text-state-danger" : "text-text-primary",
              )}
            />
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <section className="flex flex-col gap-1">
                <span className="text-caption uppercase tracking-wide text-text-muted">Mô tả</span>
                {task.description ? (
                  <LinkifiedText
                    as="p"
                    className="whitespace-pre-wrap text-body text-text-secondary"
                    text={task.description}
                  />
                ) : (
                  <p className="text-body-sm text-text-muted">Chưa có mô tả.</p>
                )}
              </section>

              {task.result_text ? (
                <section className="flex flex-col gap-1">
                  <span className="text-caption uppercase tracking-wide text-text-muted">
                    Kết quả công việc
                  </span>
                  <LinkifiedText
                    as="p"
                    className="whitespace-pre-wrap text-body-sm text-text-secondary"
                    text={task.result_text}
                  />
                </section>
              ) : null}

              <QuickComments taskId={task.id} />
            </div>

            <aside className="flex min-w-0 flex-col gap-3 rounded-card border border-border-subtle bg-surface-subtle p-3 lg:order-none">
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
            </aside>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
