import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarClock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import { TaskFormDrawer } from "@/components/task/task-form-drawer";
import { RowActionsCell } from "@/components/common/row-actions-cell";
import { DeadlineRequestModal } from "@/components/common/deadline-request-modal";
import type { RowAction } from "@/components/common/row-actions-menu";
import { useOrgAccess } from "@/hooks/use-org-access";
import { teamsQuery } from "@/lib/org-data";
import { setManualArchive } from "@/lib/deadline-data";
import { canSoftDelete, softDeleteEntity } from "@/lib/soft-delete";
import { activePeopleQuery, projectsQuery } from "@/lib/project-data";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_ORDER,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_STATUS_TONE,
  canChangeTaskStatus,
  canEditTask,
  canManuallyArchiveTask,
  canRequestTaskDeadline,
  canRestoreTask,
  formatDateTime,
  isTaskArchived,
  isTaskOverdue,
  setTaskStatus,
  tasksQuery,
  type TaskAccessContext,
  type TaskRow,
} from "@/lib/task-data";

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({
    meta: [
      { title: "Công việc — CEN WORK" },
      {
        name: "description",
        content:
          "Danh sách công việc CEN WORK: người phụ trách, dự án, Team, deadline, ưu tiên và trạng thái.",
      },
      { property: "og:title", content: "Công việc — CEN WORK" },
      {
        property: "og:description",
        content:
          "Danh sách công việc CEN WORK: người phụ trách, dự án, Team, deadline, ưu tiên và trạng thái.",
      },
    ],
  }),
  component: TasksPage,
});

const ALL = "__all__";
const NO_PROJECT = "__standalone__";

function TasksPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();

  const tasksResult = useQuery(tasksQuery());
  const projectsResult = useQuery(projectsQuery());
  const teamsResult = useQuery(teamsQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [priorityFilter, setPriorityFilter] = React.useState(ALL);
  const [assigneeFilter, setAssigneeFilter] = React.useState(ALL);
  const [projectFilter, setProjectFilter] = React.useState(ALL);
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [view, setView] = React.useState<"active" | "archived">("active");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<TaskRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<TaskRow | null>(null);
  const [deadlineTarget, setDeadlineTarget] = React.useState<TaskRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<TaskRow | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<TaskRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TaskRow | null>(null);

  const projects = projectsResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const people = peopleResult.data ?? [];

  const ctx: TaskAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  const completeMutation = useMutation({
    mutationFn: (task: TaskRow) => setTaskStatus(task.id, "done"),
    onSuccess: () => {
      refresh();
      setCompleteTarget(null);
      cenToast.success("Đã đánh dấu công việc hoàn thành.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) =>
      setManualArchive("task", input.id, input.archived),
    onSuccess: (_data, input) => {
      refresh();
      setArchiveTarget(null);
      setRestoreTarget(null);
      cenToast.success(
        input.archived ? "Đã đưa công việc vào Lưu trữ." : "Đã khôi phục công việc khỏi Lưu trữ.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (task: TaskRow) => softDeleteEntity("task", task.id),
    onSuccess: () => {
      refresh();
      setDeleteTarget(null);
      cenToast.success("Đã xóa công việc khỏi danh sách vận hành.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const rows = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (tasksResult.data ?? []).filter((task) => {
      if (isTaskArchived(task) !== (view === "archived")) return false;
      if (keyword && !task.name.toLowerCase().includes(keyword)) return false;
      if (statusFilter !== ALL && task.status !== statusFilter) return false;
      if (priorityFilter !== ALL && task.priority !== priorityFilter) return false;
      if (assigneeFilter !== ALL && task.assignee_id !== assigneeFilter) return false;
      if (projectFilter === NO_PROJECT && task.project_id !== null) return false;
      if (projectFilter !== ALL && projectFilter !== NO_PROJECT && task.project_id !== projectFilter)
        return false;
      if (teamFilter !== ALL && task.team_id !== teamFilter) return false;
      return true;
    });
  }, [
    tasksResult.data,
    search,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    projectFilter,
    teamFilter,
    view,
  ]);

  const columns = [
    {
      id: "name",
      header: "Công việc",
      className: "min-w-[220px]",
      cell: (row: TaskRow) => (
        <TableCellStack
          primary={row.name}
          secondary={row.projectName ?? "Công việc độc lập"}
        />
      ),
    },
    {
      id: "assignee",
      header: "Người phụ trách",
      className: "min-w-[150px]",
      cell: (row: TaskRow) => (
        <span className="text-text-secondary">{row.assigneeName ?? "—"}</span>
      ),
    },
    {
      id: "team",
      header: "Team",
      className: "min-w-[130px]",
      cell: (row: TaskRow) => <span className="text-text-secondary">{row.teamName ?? "—"}</span>,
    },
    {
      id: "deadline",
      header: "Deadline",
      className: "min-w-[160px]",
      cell: (row: TaskRow) => (
        <span className={isTaskOverdue(row) ? "text-state-danger" : "text-text-secondary"}>
          {formatDateTime(row.deadline)}
        </span>
      ),
    },
    {
      id: "priority",
      header: "Ưu tiên",
      className: "min-w-[120px]",
      cell: (row: TaskRow) => (
        <StatusBadge
          label={TASK_PRIORITY_LABEL[row.priority]}
          tone={TASK_PRIORITY_TONE[row.priority]}
        />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row: TaskRow) => (
        <StatusBadge label={TASK_STATUS_LABEL[row.status]} tone={TASK_STATUS_TONE[row.status]} />
      ),
    },
    {
      id: "actions",
      header: "Hành động",
      align: "right" as const,
      className: "w-[1%] whitespace-nowrap",
      headerClassName: "text-right",
      cell: (row: TaskRow) => {
        const canComplete =
          canChangeTaskStatus(row, ctx) && row.status !== "done" && !isTaskArchived(row);
        const menuActions: RowAction[] = [];
        if (canRequestTaskDeadline(row, ctx)) {
          menuActions.push({
            key: "deadline",
            label: "Yêu cầu đổi deadline",
            icon: CalendarClock,
            onSelect: () => setDeadlineTarget(row),
          });
        }
        if (canManuallyArchiveTask(row, ctx)) {
          menuActions.push({
            key: "archive",
            label: "Đưa vào Lưu trữ",
            icon: Archive,
            onSelect: () => setArchiveTarget(row),
          });
        }
        if (canRestoreTask(row, ctx)) {
          menuActions.push({
            key: "restore",
            label: "Khôi phục khỏi Lưu trữ",
            icon: ArchiveRestore,
            onSelect: () => setRestoreTarget(row),
          });
        }
        if (canSoftDelete(access.role)) {
          menuActions.push({
            key: "delete",
            label: "Xóa",
            icon: Trash2,
            tone: "destructive",
            onSelect: () => setDeleteTarget(row),
          });
        }
        return (
          <RowActionsCell
            onView={() => void navigate({ to: "/tasks/$taskId", params: { taskId: row.id } })}
            onEdit={canEditTask(row, ctx) ? () => setEditTarget(row) : null}
            onComplete={canComplete ? () => setCompleteTarget(row) : null}
            completing={completeMutation.isPending && completeTarget?.id === row.id}
            menuActions={menuActions}
          />
        );
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Công việc"
        description="Công việc thuộc dự án hoặc độc lập, trong phạm vi bạn được xem."
        actions={
          access.can("tasks.create") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Tạo công việc
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Input
          placeholder="Tìm theo tên công việc"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm theo tên công việc"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {TASK_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {TASK_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger aria-label="Lọc theo mức ưu tiên">
            <SelectValue placeholder="Ưu tiên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả mức ưu tiên</SelectItem>
            {TASK_PRIORITY_ORDER.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {TASK_PRIORITY_LABEL[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger aria-label="Lọc theo người phụ trách">
            <SelectValue placeholder="Người phụ trách" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả người phụ trách</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger aria-label="Lọc theo dự án">
            <SelectValue placeholder="Dự án" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả dự án</SelectItem>
            <SelectItem value={NO_PROJECT}>Công việc độc lập</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger aria-label="Lọc theo Team">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Team</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border-subtle p-1" role="tablist">
          <Button
            role="tab"
            aria-selected={view === "active"}
            variant={view === "active" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("active")}
          >
            Đang hoạt động
          </Button>
          <Button
            role="tab"
            aria-selected={view === "archived"}
            variant={view === "archived" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("archived")}
          >
            Lưu trữ
          </Button>
        </div>
        <span className="text-caption text-text-muted">{rows.length} công việc</span>
      </div>


      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={tasksResult.isLoading}
        error={tasksResult.isError}
        onRetry={() => void tasksResult.refetch()}
        errorTitle="Không tải được danh sách công việc"
        emptyTitle={view === "archived" ? "Chưa có công việc lưu trữ" : "Chưa có công việc nào"}
        emptyDescription={
          view === "archived"
            ? "Công việc sẽ xuất hiện ở đây sau khi được xác nhận hoàn thành."
            : "Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ."
        }
        onRowClick={(row) => void navigate({ to: "/tasks/$taskId", params: { taskId: row.id } })}
      />

      {access.userId ? (
        <TaskFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          task={null}
          ctx={ctx}
          projects={projects}
          teams={teams}
          people={people}
          onCreated={(taskId) => void navigate({ to: "/tasks/$taskId", params: { taskId } })}
        />
      ) : null}

      {access.userId && editTarget ? (
        <TaskFormDrawer
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          task={editTarget}
          ctx={ctx}
          projects={projects}
          teams={teams}
          people={people}
        />
      ) : null}

      {deadlineTarget ? (
        <DeadlineRequestModal
          open
          onOpenChange={(open) => {
            if (!open) setDeadlineTarget(null);
          }}
          entityType="task"
          entityId={deadlineTarget.id}
          entityName={deadlineTarget.name}
          currentDeadline={deadlineTarget.deadline}
        />
      ) : null}

      <ConfirmDialog
        open={completeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !completeMutation.isPending) setCompleteTarget(null);
        }}
        title="Xác nhận hoàn thành công việc?"
        description={`Công việc "${completeTarget?.name ?? ""}" sẽ chuyển sang trạng thái Hoàn thành và vào khu vực Lưu trữ.`}
        confirmLabel="Hoàn thành"
        loading={completeMutation.isPending}
        onConfirm={() => {
          if (completeTarget) completeMutation.mutate(completeTarget);
        }}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) setArchiveTarget(null);
        }}
        title="Đưa công việc vào Lưu trữ?"
        description={`Công việc "${archiveTarget?.name ?? ""}" sẽ được ẩn khỏi danh sách đang hoạt động, trạng thái giữ nguyên.`}
        confirmLabel="Lưu trữ"
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate({ id: archiveTarget.id, archived: true });
        }}
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) setRestoreTarget(null);
        }}
        title="Khôi phục công việc?"
        description={`Công việc "${restoreTarget?.name ?? ""}" sẽ quay lại danh sách đang hoạt động.`}
        confirmLabel="Khôi phục"
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (restoreTarget) archiveMutation.mutate({ id: restoreTarget.id, archived: false });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        tone="destructive"
        title="Xóa công việc?"
        description={`Công việc "${deleteTarget?.name ?? ""}" sẽ bị ẩn khỏi toàn bộ danh sách vận hành. Hành động này chỉ Admin thực hiện và được ghi Audit Log.`}
        confirmLabel="Xóa"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
      />
    </div>
  );
}
