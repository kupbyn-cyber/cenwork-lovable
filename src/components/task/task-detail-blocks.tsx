import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, CircleDashed, Clock3, FolderOpen } from "lucide-react";

import { EntityAvatar, AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { DeadlineCountdown } from "@/components/task/task-cell-bits";
import { cn } from "@/lib/utils";
import type { TaskNextAction } from "@/lib/task-next-actions";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  formatDate,
  formatDateTime,
  isTaskOverdue,
  taskStatusView,
  type TaskRow,
} from "@/lib/task-data";

/**
 * CEN 1.0 — TASK-DETAIL-UX-01.
 * Các khối trình bày cho trang Chi tiết công việc. Không chứa Business Rule.
 */

/* ---------- 1. Tôi cần làm gì ---------- */
export function TaskNextActionsCard({ actions }: { actions: TaskNextAction[] }) {
  return (
    <Card className="border-brand-primary/40 bg-brand-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-body font-semibold">Tôi cần làm gì</CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            Không còn việc cần thực hiện. Chờ bước tiếp theo.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actions.map((action) => {
              const waiting = action.kind === "waiting";
              const Icon = waiting ? Clock3 : action.urgent ? CircleDashed : CheckCircle2;
              return (
                <li
                  key={action.key}
                  className={cn(
                    "flex min-w-0 items-start gap-2 rounded-card border p-3",
                    waiting
                      ? "border-border-default bg-surface text-text-secondary"
                      : action.urgent
                        ? "border-state-danger/40 bg-surface text-text-primary"
                        : "border-border-strong bg-surface text-text-primary",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-icon-sm shrink-0",
                      waiting
                        ? "text-text-muted"
                        : action.urgent
                          ? "text-state-danger"
                          : "text-brand-primary",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-body-sm font-medium">
                      {action.label}
                    </span>
                    {action.hint ? (
                      <span className="mt-0.5 block break-words text-caption text-text-muted">
                        {action.hint}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- 2. Tổng quan ---------- */
export function TaskOverviewCard({
  task,
  progress,
  statusSlot,
}: {
  task: TaskRow;
  progress: number | null;
  statusSlot?: React.ReactNode;
}) {
  const view = taskStatusView(task);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-caption uppercase tracking-wide text-text-muted">Trạng thái</span>
          {statusSlot ?? <StatusBadge label={view.label} tone={view.tone} />}
        </div>

        <div className="flex min-w-0 flex-col gap-1 sm:w-48">
          <span className="text-caption uppercase tracking-wide text-text-muted">
            Tiến độ thời gian
          </span>
          {progress === null ? (
            <span className="text-body-sm text-text-muted">—</span>
          ) : (
            <>
              <Progress value={progress} />
              <span className="text-caption tabular-nums text-text-muted">{progress}%</span>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1 sm:items-end">
          <span className="text-caption uppercase tracking-wide text-text-muted">Deadline</span>
          <DeadlineCountdown
            task={task}
            className={cn("text-h4 font-semibold", isTaskOverdue(task) && "text-state-danger")}
          />
          <span className="text-caption text-text-muted">{formatDateTime(task.deadline)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- 3. Thông tin công việc ---------- */
function FactCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-card border p-3",
        emphasis ? "border-border-strong bg-surface" : "border-border-default bg-surface-subtle",
      )}
    >
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words",
          emphasis ? "text-body font-medium text-text-primary" : "text-body-sm text-text-secondary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function TaskFactsCard({ task }: { task: TaskRow }) {
  const participants = task.participantNames.filter(Boolean);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-body font-semibold">Thông tin công việc</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FactCard label="Dự án" value={task.projectName ?? "Công việc độc lập"} emphasis />
        <FactCard
          label="Deadline"
          emphasis
          value={
            <span className="flex flex-col">
              <DeadlineCountdown
                task={task}
                className={cn("text-body font-semibold", isTaskOverdue(task) && "text-state-danger")}
              />
              <span className="text-caption font-normal text-text-muted">
                {formatDateTime(task.deadline)}
              </span>
            </span>
          }
        />
        <FactCard label="Người phụ trách" value={task.assigneeName ?? "—"} emphasis />
        <FactCard
          label="Người duyệt"
          emphasis
          value={
            task.reviewerName
              ? `${task.reviewerName}${
                  task.reviewer_type ? ` (${TASK_REVIEWER_LABEL[task.reviewer_type]})` : ""
                }`
              : "—"
          }
        />
        <FactCard
          label="Mức ưu tiên"
          value={
            <StatusBadge
              label={TASK_PRIORITY_LABEL[task.priority]}
              tone={TASK_PRIORITY_TONE[task.priority]}
            />
          }
        />
        <FactCard label="Ngày bắt đầu" value={formatDate(task.start_date)} />
        <FactCard label="Team phụ trách" value={task.teamName ?? "—"} />
        <FactCard label="Người tạo" value={task.creatorName ?? "—"} />
        <div className="sm:col-span-2">
          <FactCard
            label="Người tham gia"
            value={
              participants.length === 0 ? (
                "—"
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <AvatarGroup size="sm" overflow={Math.max(0, participants.length - 4)}>
                    {participants.slice(0, 4).map((name) => (
                      <EntityAvatar key={name} name={name} size="sm" />
                    ))}
                  </AvatarGroup>
                  <span className="min-w-0 break-words text-caption text-text-muted">
                    {participants.join(", ")}
                  </span>
                </span>
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- 4. Mục tiêu công việc ---------- */
export function TaskObjectiveCard({ description }: { description: string | null }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-body font-semibold">Mục tiêu công việc</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-1 sm:p-6 sm:pt-1">
        {description ? (
          <LinkifiedText
            as="p"
            className="whitespace-pre-wrap break-words text-body leading-relaxed text-text-primary"
            text={description}
          />
        ) : (
          <p className="text-body-sm text-text-muted">Chưa có mô tả mục tiêu cho công việc này.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- 5. Dự án liên quan ---------- */
export function TaskProjectCard({
  projectId,
  projectName,
  statusLabel,
  statusTone,
}: {
  projectId: string | null;
  projectName: string | null;
  statusLabel?: string;
  statusTone?: StatusTone;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-body font-semibold">Dự án liên quan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {projectId && projectName ? (
          <>
            <div className="flex min-w-0 items-start gap-2">
              <FolderOpen className="mt-0.5 size-icon-sm shrink-0 text-brand-primary" aria-hidden="true" />
              <span className="min-w-0 break-words text-body font-medium text-text-primary">
                {projectName}
              </span>
            </div>
            {statusLabel ? <StatusBadge label={statusLabel} tone={statusTone ?? "neutral"} /> : null}
            <Button asChild variant="secondary" size="sm" className="w-fit">
              <Link to="/projects/$projectId" params={{ projectId }}>
                Mở dự án
                <ArrowUpRight />
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-body-sm text-text-muted">Công việc độc lập.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- 6. Lịch sử rút gọn ---------- */
export function CollapsibleList({
  children,
  total,
  initial = 5,
  expanded,
  onToggle,
}: {
  children: React.ReactNode;
  total: number;
  initial?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}
      {total > initial ? (
        <Button variant="ghost" size="sm" className="w-fit" onClick={onToggle}>
          {expanded ? "Thu gọn" : `Xem toàn bộ (${total})`}
        </Button>
      ) : null}
    </div>
  );
}
