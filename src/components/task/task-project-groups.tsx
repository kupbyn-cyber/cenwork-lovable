import * as React from "react";
import { ChevronRight, FolderKanban, ListTodo, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/lib/task-data";

/**
 * CEN — Danh sách Task nhóm theo Dự án (accordion).
 * Component chỉ trình bày: nhóm, bộ đếm và nút thêm nhanh đã được phía gọi lọc
 * theo quyền; server, RLS và trigger vẫn là ràng buộc thật khi tạo/sửa Task.
 */
export interface TaskGroup {
  key: string;
  /** null = nhóm "Công việc độc lập". */
  projectId: string | null;
  name: string;
  teamName: string | null;
  tasks: TaskRow[];
  activeCount: number;
  overdueCount: number;
  doneCount: number;
  /** Người dùng được thêm nhanh Task vào nhóm này. */
  canAdd: boolean;
}

export interface TaskProjectGroupsProps {
  groups: TaskGroup[];
  columns: DataTableColumn<TaskRow>[];
  expandedKeys: string[];
  onToggle: (key: string) => void;
  onAdd: (group: TaskGroup) => void;
  onRowClick: (row: TaskRow) => void;
}

export function TaskProjectGroups({
  groups,
  columns,
  expandedKeys,
  onToggle,
  onAdd,
  onRowClick,
}: TaskProjectGroupsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {groups.map((group) => {
        const expanded = expandedKeys.includes(group.key);
        const panelId = `task-group-${group.key}`;
        const standalone = group.projectId === null;
        const overdue = group.overdueCount > 0;
        const GroupIcon = standalone ? ListTodo : FolderKanban;

        return (
          <section
            key={group.key}
            className={cn(
              "min-w-0 overflow-hidden rounded-card border border-border-default border-l-4",
              overdue
                ? "border-l-state-danger"
                : standalone
                  ? "border-l-state-info"
                  : "border-l-brand-primary",
            )}
          >
            {/* Project Bar — nền sáng hơn danh sách Task một cấp */}
            <div className="flex min-w-0 items-start gap-2 bg-surface-subtle px-3 py-3.5 sm:gap-3 sm:px-4">
              <button
                type="button"
                onClick={() => onToggle(group.key)}
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
                <GroupIcon
                  aria-hidden="true"
                  className={cn(
                    "mt-1 size-icon-md shrink-0",
                    standalone ? "text-state-info" : "text-brand-primary",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-body-lg font-semibold text-text-primary">
                      {group.name}
                    </span>
                    <span className="text-caption text-text-muted">
                      {standalone ? "Không thuộc Dự án" : (group.teamName ?? "Chưa gán Team")}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" variant="neutral">
                      Đang làm {group.activeCount}
                    </Badge>
                    {group.overdueCount > 0 ? (
                      <Badge size="sm" variant="error">
                        Quá hạn {group.overdueCount}
                      </Badge>
                    ) : null}
                    <Badge size="sm" variant={group.doneCount > 0 ? "success" : "outline"}>
                      Hoàn thành {group.doneCount}/{group.tasks.length}
                    </Badge>
                  </span>
                </span>
              </button>

              {group.canAdd ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      variant="secondary"
                      size="icon-sm"
                      label="Thêm công việc"
                      className="mt-0.5 shrink-0"
                      onClick={() => onAdd(group)}
                    >
                      <Plus />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Thêm công việc</TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            {expanded ? (
              <div
                id={panelId}
                className="min-w-0 border-t border-border-default bg-background pl-2 sm:pl-3"
              >
                {group.tasks.length === 0 ? (
                  <p className="py-4 pr-4 text-body-sm text-text-muted">Chưa có công việc</p>
                ) : (
                  <DataTable
                    columns={columns}
                    data={group.tasks}
                    getRowId={(row) => row.id}
                    onRowClick={onRowClick}
                  />
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
