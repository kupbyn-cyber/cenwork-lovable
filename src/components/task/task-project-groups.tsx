import * as React from "react";
import { ChevronRight, Plus } from "lucide-react";

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

function GroupStat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <span className="text-caption text-text-muted">
      {label}{" "}
      <span className={cn("font-medium", tone === "danger" ? "text-state-danger" : "text-text-secondary")}>
        {value}
      </span>
    </span>
  );
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
    <div className="flex min-w-0 flex-col gap-3">
      {groups.map((group) => {
        const expanded = expandedKeys.includes(group.key);
        const panelId = `task-group-${group.key}`;
        return (
          <section
            key={group.key}
            className="min-w-0 overflow-hidden rounded-card border border-border-default bg-surface"
          >
            <div className="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4">
              <button
                type="button"
                onClick={() => onToggle(group.key)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "size-icon-sm shrink-0 text-text-muted cen-transition",
                    expanded && "rotate-90",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body font-medium text-text-primary">
                    {group.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {group.teamName ? (
                      <span className="text-caption text-text-muted">{group.teamName}</span>
                    ) : null}
                    <GroupStat label="Đang làm" value={String(group.activeCount)} />
                    {group.overdueCount > 0 ? (
                      <GroupStat
                        label="Quá hạn"
                        value={String(group.overdueCount)}
                        tone="danger"
                      />
                    ) : null}
                    <GroupStat
                      label="Hoàn thành"
                      value={`${group.doneCount}/${group.tasks.length}`}
                    />
                  </span>
                </span>
              </button>
              {group.canAdd ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      label="Thêm công việc"
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
              <div id={panelId} className="min-w-0 border-t border-border-default">
                {group.tasks.length === 0 ? (
                  <p className="px-4 py-4 text-body-sm text-text-muted">Chưa có công việc</p>
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
