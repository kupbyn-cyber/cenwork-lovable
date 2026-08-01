import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarClock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import { ProjectFormDrawer } from "@/components/project/project-form-drawer";
import { RowActionsCell } from "@/components/common/row-actions-cell";
import { DeadlineRequestModal } from "@/components/common/deadline-request-modal";
import type { RowAction } from "@/components/common/row-actions-menu";
import { useOrgAccess } from "@/hooks/use-org-access";
import { facilitiesQuery, teamsQuery } from "@/lib/org-data";
import { setManualArchive } from "@/lib/deadline-data";
import { canSoftDelete, softDeleteEntity } from "@/lib/soft-delete";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
  activePeopleQuery,
  canEditProject,
  canManuallyArchiveProject,
  canRequestProjectDeadline,
  canRestoreProject,
  formatDate,
  isProjectApproved,
  isProjectArchived,
  isProjectPendingApproval,
  isProjectRejected,
  isOverdue,
  nextStatuses,
  projectTaskCountsQuery,
  projectsQuery,
  setProjectStatus,
  timeProgress,
  type ProjectAccessContext,
  type ProjectRow,
} from "@/lib/project-data";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Dự án — CEN WORK" },
      {
        name: "description",
        content:
          "Danh sách dự án CEN WORK: trạng thái, Project Owner, Team tham gia và tiến độ thời gian.",
      },
      { property: "og:title", content: "Dự án — CEN WORK" },
      {
        property: "og:description",
        content:
          "Danh sách dự án CEN WORK: trạng thái, Project Owner, Team tham gia và tiến độ thời gian.",
      },
    ],
  }),
  component: ProjectsPage,
});

const ALL = "__all__";

type ProjectView = "active" | "pending" | "rejected" | "archived";

const EMPTY_TITLE: Record<ProjectView, string> = {
  active: "Chưa có dự án nào",
  pending: "Không có dự án chờ duyệt",
  rejected: "Không có dự án bị từ chối",
  archived: "Chưa có dự án lưu trữ",
};

const EMPTY_DESCRIPTION: Record<ProjectView, string> = {
  active: "Tạo dự án đầu tiên để bắt đầu quy trình duyệt.",
  pending: "Dự án đang chờ Leader hoặc CMO duyệt sẽ hiển thị ở đây.",
  rejected: "Dự án bị từ chối có thể chỉnh sửa và gửi duyệt lại.",
  archived: "Dự án sẽ xuất hiện ở đây sau khi hoàn thành chính thức.",
};

function ProjectsPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectsResult = useQuery(projectsQuery());
  const taskCountsResult = useQuery(projectTaskCountsQuery());
  const teamsResult = useQuery(teamsQuery());
  const facilitiesResult = useQuery(facilitiesQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [ownerFilter, setOwnerFilter] = React.useState(ALL);
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [facilityFilter, setFacilityFilter] = React.useState(ALL);
  const [view, setView] = React.useState<"active" | "pending" | "rejected" | "archived">("active");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProjectRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<ProjectRow | null>(null);
  const [deadlineTarget, setDeadlineTarget] = React.useState<ProjectRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ProjectRow | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectRow | null>(null);

  const teams = teamsResult.data ?? [];
  const facilities = facilitiesResult.data ?? [];
  const people = peopleResult.data ?? [];
  const taskCounts = taskCountsResult.data ?? {};
  const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? "—";

  const ctx: ProjectAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  const completeMutation = useMutation({
    mutationFn: (project: ProjectRow) => setProjectStatus(project.id, "completed"),
    onSuccess: () => {
      refresh();
      setCompleteTarget(null);
      cenToast.success("Đã hoàn thành dự án.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) =>
      setManualArchive("project", input.id, input.archived),
    onSuccess: (_data, input) => {
      refresh();
      setArchiveTarget(null);
      setRestoreTarget(null);
      cenToast.success(
        input.archived ? "Đã đưa dự án vào Lưu trữ." : "Đã khôi phục dự án khỏi Lưu trữ.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (project: ProjectRow) => softDeleteEntity("project", project.id),
    onSuccess: () => {
      refresh();
      setDeleteTarget(null);
      cenToast.success("Đã xóa dự án khỏi danh sách vận hành.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const rows = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (projectsResult.data ?? []).filter((project) => {
      const bucket = isProjectArchived(project)
        ? "archived"
        : isProjectRejected(project)
          ? "rejected"
          : isProjectPendingApproval(project) || !isProjectApproved(project)
            ? "pending"
            : "active";
      if (bucket !== view) return false;
      if (keyword && !project.name.toLowerCase().includes(keyword)) return false;
      if (statusFilter !== ALL && project.status !== statusFilter) return false;
      if (ownerFilter !== ALL && project.owner_id !== ownerFilter) return false;
      if (teamFilter !== ALL && !project.teamIds.includes(teamFilter)) return false;
      if (facilityFilter !== ALL && !project.facilityIds.includes(facilityFilter)) return false;
      return true;
    });
  }, [projectsResult.data, search, statusFilter, ownerFilter, teamFilter, facilityFilter, view]);

  const rowActions = (row: ProjectRow) => {
    const canComplete = nextStatuses(row, ctx).includes("completed");
    const menuActions: RowAction[] = [];
    if (canRequestProjectDeadline(row, ctx)) {
      menuActions.push({
        key: "deadline",
        label: "Yêu cầu đổi deadline",
        icon: CalendarClock,
        onSelect: () => setDeadlineTarget(row),
      });
    }
    if (canManuallyArchiveProject(row, ctx)) {
      menuActions.push({
        key: "archive",
        label: "Đưa vào Lưu trữ",
        icon: Archive,
        onSelect: () => setArchiveTarget(row),
      });
    }
    if (canRestoreProject(row, ctx)) {
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
        onView={() => void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })}
        onEdit={canEditProject(row, ctx) ? () => setEditTarget(row) : null}
        onComplete={canComplete ? () => setCompleteTarget(row) : null}
        completing={completeMutation.isPending && completeTarget?.id === row.id}
        menuActions={menuActions}
      />
    );
  };

  const columns = [
    {
      id: "name",
      header: "Dự án",
      className: "w-auto",
      cell: (row: ProjectRow) => (
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-text-primary" title={row.name}>
            {row.name}
          </div>
          {row.objective ? (
            <div
              className="hidden truncate text-helper text-text-muted lg:block"
              title={row.objective}
            >
              {row.objective}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "w-[112px]",
      headerClassName: "w-[112px]",
      cell: (row: ProjectRow) => (
        <StatusBadge label={PROJECT_STATUS_LABEL[row.status]} tone={PROJECT_STATUS_TONE[row.status]} />
      ),
    },
    {
      id: "owner",
      header: "Phụ trách",
      className: "hidden w-[130px] lg:table-cell",
      headerClassName: "hidden w-[130px] lg:table-cell",
      cell: (row: ProjectRow) => (
        <div
          className="truncate text-text-secondary"
          title={row.ownerName ?? "Chưa chỉ định"}
        >
          {row.ownerName ?? "Chưa chỉ định"}
        </div>
      ),
    },
    {
      id: "teams",
      header: "Team",
      className: "hidden w-[130px] xl:table-cell",
      headerClassName: "hidden w-[130px] xl:table-cell",
      cell: (row: ProjectRow) => {
        const label = row.teamIds.length === 0 ? "—" : row.teamIds.map(teamName).join(", ");
        return (
          <div className="truncate text-text-secondary" title={label}>
            {label}
          </div>
        );
      },
    },
    {
      id: "progress",
      header: "Tiến độ",
      className: "hidden w-[110px] lg:table-cell",
      headerClassName: "hidden w-[110px] lg:table-cell",
      cell: (row: ProjectRow) => {
        const value = timeProgress(row);
        if (value === null) return <span className="text-text-muted">—</span>;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Progress value={value} className="h-1.5 min-w-0 flex-1" />
            <span className="shrink-0 text-caption tabular-nums text-text-muted">{value}%</span>
          </div>
        );
      },
    },
    {
      id: "deadline",
      header: "Deadline",
      className: "w-[96px] whitespace-nowrap",
      headerClassName: "w-[96px]",
      cell: (row: ProjectRow) => (
        <span className={isOverdue(row) ? "text-state-danger" : "text-text-secondary"}>
          {formatDate(row.deadline)}
        </span>
      ),
    },
    {
      id: "task-count",
      header: "Số CV",
      align: "right" as const,
      className: "hidden w-[64px] tabular-nums lg:table-cell",
      headerClassName: "hidden w-[64px] text-right lg:table-cell",
      cell: (row: ProjectRow) => (
        <span className="text-text-secondary">{taskCounts[row.id] ?? 0}</span>
      ),
    },
    {
      id: "actions",
      header: "Hành động",
      align: "right" as const,
      className: "w-[140px] whitespace-nowrap",
      headerClassName: "w-[140px] text-right",
      cell: (row: ProjectRow) => rowActions(row),
    },
  ];


  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Dự án"
        description="Tạo dự án, theo dõi quy trình duyệt và dự án đã duyệt trong phạm vi bạn được xem."
        actions={
          access.can("projects.create") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Tạo dự án
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Input
          placeholder="Tìm theo tên dự án"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm theo tên dự án"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {PROJECT_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {PROJECT_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger aria-label="Lọc theo Project Owner">
            <SelectValue placeholder="Project Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Owner</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
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
        <Select value={facilityFilter} onValueChange={setFacilityFilter}>
          <SelectTrigger aria-label="Lọc theo Cơ sở">
            <SelectValue placeholder="Cơ sở" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Cơ sở</SelectItem>
            {facilities.map((facility) => (
              <SelectItem key={facility.id} value={facility.id}>
                {facility.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-md border border-border-subtle p-1" role="tablist">
          {(
            [
              ["active", "Đang hoạt động"],
              ["pending", "Chờ duyệt"],
              ["rejected", "Bị từ chối"],
              ["archived", "Lưu trữ"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              role="tab"
              aria-selected={view === key}
              variant={view === key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <span className="text-caption text-text-muted">{rows.length} dự án</span>
      </div>

      <DataTable
        className="hidden overflow-x-hidden sm:block"
        tableClassName="table-fixed"
        density="compact"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={projectsResult.isLoading}
        error={projectsResult.isError}
        onRetry={() => void projectsResult.refetch()}
        errorTitle="Không tải được danh sách dự án"
        emptyTitle={EMPTY_TITLE[view]}
        emptyDescription={EMPTY_DESCRIPTION[view]}
        onRowClick={(row) =>
          void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })
        }
      />

      <div className="flex flex-col gap-3 sm:hidden">
        {projectsResult.isLoading ? (
          <div className="rounded-card border border-border-default bg-surface p-4 text-body text-text-muted">
            Đang tải danh sách dự án…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-border-default bg-surface p-4 text-body text-text-muted">
            {EMPTY_TITLE[view]}
          </div>
        ) : (
          rows.map((row) => {
            const value = timeProgress(row);
            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void navigate({ to: "/projects/$projectId", params: { projectId: row.id } });
                  }
                }}
                className="cen-transition flex min-w-0 flex-col gap-2 rounded-card border border-border-default bg-surface p-3 shadow-level-1"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-body font-medium text-text-primary">
                      {row.name}
                    </div>
                    {row.objective ? (
                      <div className="truncate text-helper text-text-muted">{row.objective}</div>
                    ) : null}
                  </div>
                  <StatusBadge
                    label={PROJECT_STATUS_LABEL[row.status]}
                    tone={PROJECT_STATUS_TONE[row.status]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-text-muted">
                  <span className="truncate">Phụ trách: {row.ownerName ?? "Chưa chỉ định"}</span>
                  <span className="truncate">
                    Team: {row.teamIds.length === 0 ? "—" : row.teamIds.map(teamName).join(", ")}
                  </span>
                  <span className={isOverdue(row) ? "text-state-danger" : undefined}>
                    Deadline: {formatDate(row.deadline)}
                  </span>
                  <span>Số CV: {taskCounts[row.id] ?? 0}</span>
                </div>
                {value !== null ? (
                  <div className="flex items-center gap-2">
                    <Progress value={value} className="h-1.5 min-w-0 flex-1" />
                    <span className="shrink-0 text-caption tabular-nums text-text-muted">
                      {value}%
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-end">{rowActions(row)}</div>
              </div>
            );
          })
        )}
      </div>



      {access.userId ? (
        <ProjectFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          project={null}
          fullEdit={false}
          currentUserRole={access.role}
          currentUserId={access.userId}
          teams={teams}
          facilities={facilities}
          people={people}
          onCreated={(projectId) =>
            void navigate({ to: "/projects/$projectId", params: { projectId } })
          }
        />
      ) : null}

      {access.userId && editTarget ? (
        <ProjectFormDrawer
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          project={editTarget}
          fullEdit={isProjectApproved(editTarget)}
          currentUserRole={access.role}
          currentUserId={access.userId}
          teams={teams}
          facilities={facilities}
          people={people}
        />
      ) : null}

      {deadlineTarget ? (
        <DeadlineRequestModal
          open
          onOpenChange={(open) => {
            if (!open) setDeadlineTarget(null);
          }}
          entityType="project"
          entityId={deadlineTarget.id}
          entityName={deadlineTarget.name}
          currentDeadline={deadlineTarget.deadline}
          dateOnly
        />
      ) : null}

      <ConfirmDialog
        open={completeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !completeMutation.isPending) setCompleteTarget(null);
        }}
        title="Xác nhận hoàn thành dự án?"
        description={`Dự án "${completeTarget?.name ?? ""}" sẽ chuyển sang trạng thái Hoàn thành và vào khu vực Lưu trữ.`}
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
        title="Đưa dự án vào Lưu trữ?"
        description={`Dự án "${archiveTarget?.name ?? ""}" sẽ được ẩn khỏi danh sách đang hoạt động, trạng thái giữ nguyên.`}
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
        title="Khôi phục dự án?"
        description={`Dự án "${restoreTarget?.name ?? ""}" sẽ quay lại danh sách đang hoạt động.`}
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
        title="Xóa dự án?"
        description={`Dự án "${deleteTarget?.name ?? ""}" và các công việc thuộc dự án sẽ bị ẩn khỏi toàn bộ danh sách vận hành. Hành động này chỉ Admin thực hiện và được ghi Audit Log.`}
        confirmLabel="Xóa"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
      />
    </div>
  );
}
