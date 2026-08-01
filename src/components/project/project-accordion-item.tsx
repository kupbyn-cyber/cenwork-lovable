import * as React from "react";
import { ChevronRight, FolderKanban, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  formatDate,
  isOverdue,
  type ProjectRow,
  type ProjectTaskStats,
} from "@/lib/project-data";

/**
 * CEN — Khối accordion Dự án cho trang Dự án.
 * Component chỉ trình bày: quyền thêm Task và các hành động đã được phía gọi
 * lọc theo vai trò; server, RLS và trigger vẫn là ràng buộc thật.
 */
export interface ProjectAccordionItemProps {
  project: ProjectRow;
  stats: ProjectTaskStats;
  teamName: string;
  expanded: boolean;
  onToggle: () => void;
  /** Hiển thị KPI Task ở header (tab Chờ duyệt / Bị từ chối thì tắt). */
  showTaskStats?: boolean;
  canAddTask?: boolean;
  onAddTask?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-secondary">{value}</span>
    </span>
  );
}

export function ProjectAccordionItem({
  project,
  stats,
  teamName,
  expanded,
  onToggle,
  showTaskStats = true,
  canAddTask = false,
  onAddTask,
  actions,
  children,
}: ProjectAccordionItemProps) {
  const panelId = `project-panel-${project.id}`;
  const overdue = showTaskStats && stats.overdue > 0;

  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-card border border-border-default border-l-4",
        overdue ? "border-l-state-danger" : "border-l-brand-primary",
      )}
    >
      {/* Header dự án — nền nổi hơn danh sách Task một cấp */}
      <div className="flex min-w-0 items-start gap-2 bg-surface-subtle px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-control p-1 text-left cen-transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:gap-3"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-control text-text-secondary">
            <ChevronRight
              aria-hidden="true"
              className={cn("size-icon-md cen-transition", expanded && "rotate-90")}
            />
          </span>
          <FolderKanban
            aria-hidden="true"
            className="mt-1 size-icon-md shrink-0 text-brand-primary"
          />
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-body-lg font-semibold text-text-primary">
                {project.name}
              </span>
              <StatusBadge
                label={PROJECT_STATUS_LABEL[project.status]}
                tone={PROJECT_STATUS_TONE[project.status]}
              />
            </span>
            <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-caption">
              <Meta label="Team" value={teamName} />
              <Meta label="Owner" value={project.ownerName ?? "Chưa chỉ định"} />
              <Meta
                label="Deadline"
                value={
                  <span className={isOverdue(project) ? "text-state-danger" : undefined}>
                    {formatDate(project.deadline)}
                  </span>
                }
              />
            </span>
            {showTaskStats ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge size="sm" variant="outline">
                  Task {stats.total}
                </Badge>
                <Badge size="sm" variant="neutral">
                  Đang xử lý {stats.active}
                </Badge>
                {stats.overdue > 0 ? (
                  <Badge size="sm" variant="error">
                    Quá hạn {stats.overdue}
                  </Badge>
                ) : null}
                <Badge size="sm" variant={stats.done > 0 ? "success" : "outline"}>
                  Hoàn thành {stats.done}/{stats.total}
                </Badge>
                <span className="flex w-24 items-center gap-1.5">
                  <Progress value={stats.progress} className="h-1.5 min-w-0 flex-1" />
                  <span className="shrink-0 text-caption tabular-nums text-text-muted">
                    {stats.progress}%
                  </span>
                </span>
              </span>
            ) : null}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canAddTask && onAddTask ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="secondary"
                  size="icon-sm"
                  label="Thêm công việc"
                  onClick={onAddTask}
                >
                  <Plus />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Thêm công việc</TooltipContent>
            </Tooltip>
          ) : null}
          {actions}
        </div>
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="min-w-0 border-t border-border-default bg-background px-3 py-3 pl-3 sm:pl-4"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
