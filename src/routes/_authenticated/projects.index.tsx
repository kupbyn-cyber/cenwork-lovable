import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { ProjectAccordionItem } from "@/components/project/project-accordion-item";
import { ProjectFormDrawer } from "@/components/project/project-form-drawer";
import { TaskCompleteDialog } from "@/components/task/task-complete-dialog";
import { TaskFormDrawer } from "@/components/task/task-form-drawer";
import { TaskCardList } from "@/components/task/task-card-list";
import { RowActionsCell } from "@/components/common/row-actions-cell";
import { DeadlineRequestModal } from "@/components/common/deadline-request-modal";
import type { RowAction } from "@/components/common/row-actions-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgAccess } from "@/hooks/use-org-access";
import { facilitiesQuery, teamsQuery } from "@/lib/org-data";
import { setManualArchive } from "@/lib/deadline-data";
import { canSoftDelete, softDeleteEntity } from "@/lib/soft-delete";
import {
  APPROVAL_ACTION_LABEL,
  APPROVAL_STAGE_LABEL,
  EMPTY_TASK_STATS,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
  activePeopleQuery,
  allProjectApprovalsQuery,
  approvalStage,
  buildProjectTaskStats,
  canAddTaskToProject,
  canDecideProject,
  canEditProject,
  canManuallyArchiveProject,
  canRequestProjectDeadline,
  canRestoreProject,
  canSubmitProject,
  decideProject,
  formatDate,
  groupTasksByProject,
  isProjectApproved,
  isProjectArchived,
  isProjectManuallyArchived,
  isProjectPendingApproval,
  isProjectRejected,
  nextStatuses,
  projectsQuery,
  setProjectStatus,
  submitProject,
  type ProjectAccessContext,
  type ProjectRow,
} from "@/lib/project-data";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
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

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Dự án — CEN WORK" },
      {
        name: "description",
        content:
          "Quản lý dự án CEN WORK theo bốn trạng thái: đang hoạt động, chờ duyệt, bị từ chối và lưu trữ, kèm công việc bên trong từng dự án.",
      },
      { property: "og:title", content: "Dự án — CEN WORK" },
      {
        property: "og:description",
        content:
          "Quản lý dự án CEN WORK theo bốn trạng thái: đang hoạt động, chờ duyệt, bị từ chối và lưu trữ, kèm công việc bên trong từng dự án.",
      },
    ],
  }),
  component: ProjectsPage,
});

const ALL = "__all__";
const PAGE_SIZE = 10;

type ProjectView = "active" | "pending" | "rejected" | "archived";

const VIEW_ORDER: [ProjectView, string][] = [
  ["active", "Đang hoạt động"],
  ["pending", "Chờ duyệt"],
  ["rejected", "Bị từ chối"],
  ["archived", "Lưu trữ"],
];

const EMPTY_TITLE: Record<ProjectView, string> = {
  active: "Chưa có dự án đang hoạt động",
  pending: "Không có dự án chờ duyệt",
  rejected: "Không có dự án bị từ chối",
  archived: "Chưa có dự án lưu trữ",
};

const EMPTY_DESCRIPTION: Record<ProjectView, string> = {
  active: "Dự án sau khi được duyệt sẽ xuất hiện ở đây kèm danh sách công việc.",
  pending: "Dự án đang chờ Leader hoặc Admin/CMO duyệt sẽ hiển thị ở đây.",
  rejected: "Dự án bị từ chối có thể chỉnh sửa và gửi duyệt lại trên cùng bản ghi.",
  archived: "Dự án hoàn thành hoặc lưu trữ thủ công sẽ xuất hiện ở đây.",
};

/** Tab của một dự án — dùng chung cho bộ đếm và bộ lọc. */
function projectBucket(project: ProjectRow): ProjectView {
  if (isProjectArchived(project)) return "archived";
  if (isProjectRejected(project)) return "rejected";
  if (isProjectPendingApproval(project) || !isProjectApproved(project)) return "pending";
  return "active";
}

function ProjectsPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const projectsResult = useQuery(projectsQuery());
  const tasksResult = useQuery(tasksQuery());
  const approvalsResult = useQuery(allProjectApprovalsQuery());
  const teamsResult = useQuery(teamsQuery());
  const facilitiesResult = useQuery(facilitiesQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [ownerFilter, setOwnerFilter] = React.useState(ALL);
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [facilityFilter, setFacilityFilter] = React.useState(ALL);
  const [view, setView] = React.useState<ProjectView>("active");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [expanded, setExpanded] = React.useState<string[]>([]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProjectRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<ProjectRow | null>(null);
  const [deadlineTarget, setDeadlineTarget] = React.useState<ProjectRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ProjectRow | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectRow | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<ProjectRow | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const [taskProject, setTaskProject] = React.useState<ProjectRow | null>(null);
  const [taskEditTarget, setTaskEditTarget] = React.useState<TaskRow | null>(null);
  const [taskCompleteTarget, setTaskCompleteTarget] = React.useState<TaskRow | null>(null);
  const [taskDeadlineTarget, setTaskDeadlineTarget] = React.useState<TaskRow | null>(null);
  const [taskArchiveTarget, setTaskArchiveTarget] = React.useState<TaskRow | null>(null);
  const [taskRestoreTarget, setTaskRestoreTarget] = React.useState<TaskRow | null>(null);
  const [taskDeleteTarget, setTaskDeleteTarget] = React.useState<TaskRow | null>(null);

  const projects = React.useMemo(() => projectsResult.data ?? [], [projectsResult.data]);
  const allTasks = React.useMemo(() => tasksResult.data ?? [], [tasksResult.data]);
  const teams = teamsResult.data ?? [];
  const facilities = facilitiesResult.data ?? [];
  const people = peopleResult.data ?? [];
  const approvals = approvalsResult.data ?? {};
  const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? "—";

  /** KPI Task và Task con: tính từ MỘT query tasks duy nhất (không N+1). */
  const statsByProject = React.useMemo(() => buildProjectTaskStats(allTasks), [allTasks]);
  const tasksByProject = React.useMemo(() => groupTasksByProject(allTasks), [allTasks]);

  const ctx: ProjectAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };
  const taskCtx: TaskAccessContext = ctx;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["project-approvals-all"] });
    void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  /* ---------- Mutation Dự án ---------- */
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

  const decideMutation = useMutation({
    mutationFn: (input: { id: string; approve: boolean; reason?: string | null }) =>
      decideProject(input.id, input.approve, input.reason ?? null),
    onSuccess: (_data, input) => {
      refresh();
      setRejectTarget(null);
      setRejectNote("");
      cenToast.success(input.approve ? "Đã duyệt dự án." : "Đã từ chối dự án.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: (project: ProjectRow) => submitProject(project.id),
    onSuccess: () => {
      refresh();
      cenToast.success("Đã gửi duyệt lại dự án.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  /* ---------- Mutation Task ---------- */
  const taskArchiveMutation = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) =>
      setManualArchive("task", input.id, input.archived),
    onSuccess: (_data, input) => {
      refresh();
      setTaskArchiveTarget(null);
      setTaskRestoreTarget(null);
      cenToast.success(
        input.archived ? "Đã đưa công việc vào Lưu trữ." : "Đã khôi phục công việc khỏi Lưu trữ.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const taskDeleteMutation = useMutation({
    mutationFn: (task: TaskRow) => softDeleteEntity("task", task.id),
    onSuccess: () => {
      refresh();
      setTaskDeleteTarget(null);
      cenToast.success("Đã xóa công việc khỏi danh sách vận hành.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  /* ---------- Lọc và phân tab ---------- */
  const matchesFilters = React.useCallback(
    (project: ProjectRow) => {
      const keyword = search.trim().toLowerCase();
      if (keyword && !project.name.toLowerCase().includes(keyword)) return false;
      if (statusFilter !== ALL && project.status !== statusFilter) return false;
      if (ownerFilter !== ALL && project.owner_id !== ownerFilter) return false;
      if (teamFilter !== ALL && !project.teamIds.includes(teamFilter)) return false;
      if (facilityFilter !== ALL && !project.facilityIds.includes(facilityFilter)) return false;
      return true;
    },
    [search, statusFilter, ownerFilter, teamFilter, facilityFilter],
  );

  const counts = React.useMemo(() => {
    const base: Record<ProjectView, number> = { active: 0, pending: 0, rejected: 0, archived: 0 };
    for (const project of projects) {
      if (!matchesFilters(project)) continue;
      base[projectBucket(project)] += 1;
    }
    return base;
  }, [projects, matchesFilters]);

  const rows = React.useMemo(
    () => projects.filter((project) => projectBucket(project) === view && matchesFilters(project)),
    [projects, view, matchesFilters],
  );

  const visibleRows = React.useMemo(() => rows.slice(0, limit), [rows, limit]);

  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [view, search, statusFilter, ownerFilter, teamFilter, facilityFilter]);

  const filtering =
    search.trim() !== "" ||
    statusFilter !== ALL ||
    ownerFilter !== ALL ||
    teamFilter !== ALL ||
    facilityFilter !== ALL;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter(ALL);
    setOwnerFilter(ALL);
    setTeamFilter(ALL);
    setFacilityFilter(ALL);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  /* ---------- Hành động ---------- */
  const projectActions = (project: ProjectRow) => {
    const canComplete = nextStatuses(project, ctx).includes("completed");
    const menuActions: RowAction[] = [];
    if (canRequestProjectDeadline(project, ctx)) {
      menuActions.push({
        key: "deadline",
        label: "Yêu cầu đổi deadline",
        icon: CalendarClock,
        onSelect: () => setDeadlineTarget(project),
      });
    }
    if (canManuallyArchiveProject(project, ctx)) {
      menuActions.push({
        key: "archive",
        label: "Đưa vào Lưu trữ",
        icon: Archive,
        onSelect: () => setArchiveTarget(project),
      });
    }
    if (canRestoreProject(project, ctx)) {
      menuActions.push({
        key: "restore",
        label: "Khôi phục khỏi Lưu trữ",
        icon: ArchiveRestore,
        onSelect: () => setRestoreTarget(project),
      });
    }
    if (canSoftDelete(access.role)) {
      menuActions.push({
        key: "delete",
        label: "Xóa",
        icon: Trash2,
        tone: "destructive",
        onSelect: () => setDeleteTarget(project),
      });
    }
    return (
      <RowActionsCell
        onView={() =>
          void navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
        }
        onEdit={canEditProject(project, ctx) ? () => setEditTarget(project) : null}
        onComplete={canComplete ? () => setCompleteTarget(project) : null}
        completing={completeMutation.isPending && completeTarget?.id === project.id}
        menuActions={menuActions}
      />
    );
  };

  const taskActions = (task: TaskRow) => {
    const canComplete =
      canChangeTaskStatus(task, taskCtx) && task.status !== "done" && !isTaskArchived(task);
    const menuActions: RowAction[] = [];
    if (canRequestTaskDeadline(task, taskCtx)) {
      menuActions.push({
        key: "deadline",
        label: "Yêu cầu đổi deadline",
        icon: CalendarClock,
        onSelect: () => setTaskDeadlineTarget(task),
      });
    }
    if (canManuallyArchiveTask(task, taskCtx)) {
      menuActions.push({
        key: "archive",
        label: "Đưa vào Lưu trữ",
        icon: Archive,
        onSelect: () => setTaskArchiveTarget(task),
      });
    }
    if (canRestoreTask(task, taskCtx)) {
      menuActions.push({
        key: "restore",
        label: "Khôi phục khỏi Lưu trữ",
        icon: ArchiveRestore,
        onSelect: () => setTaskRestoreTarget(task),
      });
    }
    if (canSoftDelete(access.role)) {
      menuActions.push({
        key: "delete",
        label: "Xóa",
        icon: Trash2,
        tone: "destructive",
        onSelect: () => setTaskDeleteTarget(task),
      });
    }
    return (
      <RowActionsCell
        onView={() => void navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })}
        onEdit={canEditTask(task, taskCtx) ? () => setTaskEditTarget(task) : null}
        onComplete={canComplete ? () => setTaskCompleteTarget(task) : null}
        completing={taskCompleteTarget?.id === task.id}
        menuActions={menuActions}
      />
    );
  };

  /** Cột Task bên trong dự án — không lặp lại cột Dự án. */
  const taskColumns = [
    {
      id: "name",
      header: "Công việc",
      className: "px-3",
      headerClassName: "px-3",
      cell: (row: TaskRow) => (
        <span className="block truncate font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      id: "assignee",
      header: "Phụ trách",
      className: "w-[132px] px-3",
      headerClassName: "w-[132px] px-3",
      cell: (row: TaskRow) => (
        <span className="block truncate text-text-secondary">{row.assigneeName ?? "—"}</span>
      ),
    },
    {
      id: "deadline",
      header: "Deadline",
      className: "w-[136px] px-3 whitespace-nowrap",
      headerClassName: "w-[136px] px-3",
      cell: (row: TaskRow) => (
        <span className={isTaskOverdue(row) ? "text-state-danger" : "text-text-secondary"}>
          {formatDateTime(row.deadline)}
        </span>
      ),
    },
    {
      id: "priority",
      header: "Ưu tiên",
      className: "w-[100px] px-3",
      headerClassName: "w-[100px] px-3",
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
      className: "w-[128px] px-3",
      headerClassName: "w-[128px] px-3",
      cell: (row: TaskRow) => (
        <StatusBadge label={TASK_STATUS_LABEL[row.status]} tone={TASK_STATUS_TONE[row.status]} />
      ),
    },
    {
      id: "actions",
      header: "Hành động",
      align: "right" as const,
      className: "w-[132px] px-3 whitespace-nowrap",
      headerClassName: "w-[132px] px-3 text-right",
      cell: (row: TaskRow) => taskActions(row),
    },
  ];

  const renderTaskList = (project: ProjectRow) => {
    const tasks = tasksByProject[project.id] ?? [];
    if (tasks.length === 0) {
      return (
        <p className="py-2 text-body-sm text-text-muted">
          Chưa có công việc nào trong dự án này.
        </p>
      );
    }
    if (isMobile) {
      return (
        <TaskCardList
          tasks={tasks}
          columns={["assignee", "deadline", "priority", "status"]}
          onOpen={(task) => void navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })}
          renderActions={taskActions}
        />
      );
    }
    return (
      <DataTable
        className="overflow-x-hidden"
        tableClassName="table-fixed"
        density="compact"
        columns={taskColumns}
        data={tasks}
        getRowId={(row) => row.id}
        onRowClick={(row) => void navigate({ to: "/tasks/$taskId", params: { taskId: row.id } })}
      />
    );
  };

  const renderApprovalHistory = (project: ProjectRow) => {
    const entries = (approvals[project.id] ?? []).slice(0, 5);
    if (entries.length === 0) {
      return <p className="text-body-sm text-text-muted">Chưa có lịch sử phê duyệt.</p>;
    }
    return (
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.id} className="text-body-sm text-text-secondary">
            <span className="text-text-primary">
              {APPROVAL_ACTION_LABEL[entry.action] ?? entry.action}
            </span>{" "}
            · {APPROVAL_STAGE_LABEL[entry.stage] ?? entry.stage} · Vòng {entry.round} ·{" "}
            {entry.actorName ?? "Hệ thống"} ·{" "}
            {new Date(entry.created_at).toLocaleString("vi-VN")}
            {entry.reason ? (
              <span className="block text-caption text-text-muted">Lý do: {entry.reason}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  };

  const InfoGrid = ({ project }: { project: ProjectRow }) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm lg:grid-cols-4">
      <div>
        <div className="text-caption text-text-muted">Người tạo</div>
        <div className="truncate text-text-primary">{project.creatorName ?? "—"}</div>
      </div>
      <div>
        <div className="text-caption text-text-muted">Team phụ trách</div>
        <div className="truncate text-text-primary">
          {project.responsible_team_id ? teamName(project.responsible_team_id) : "—"}
        </div>
      </div>
      <div>
        <div className="text-caption text-text-muted">Project Owner</div>
        <div className="truncate text-text-primary">{project.ownerName ?? "Chưa chỉ định"}</div>
      </div>
      <div>
        <div className="text-caption text-text-muted">Deadline</div>
        <div className="text-text-primary">{formatDate(project.deadline)}</div>
      </div>
    </div>
  );

  const renderPendingBody = (project: ProjectRow) => {
    const stage = approvalStage(project);
    const canDecide = canDecideProject(project, ctx);
    return (
      <div className="flex flex-col gap-3">
        <InfoGrid project={project} />
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <Badge variant="neutral" size="sm">
            Bước hiện tại: {stage === "leader" ? "Leader Team phụ trách" : "Admin/CMO"}
          </Badge>
          <span className="text-text-muted">
            Gửi duyệt:{" "}
            {project.submitted_at
              ? new Date(project.submitted_at).toLocaleString("vi-VN")
              : "—"}
          </span>
        </div>
        <div>
          <div className="mb-1 text-caption uppercase tracking-wide text-text-muted">
            Lịch sử phê duyệt
          </div>
          {renderApprovalHistory(project)}
        </div>
        <p className="text-caption text-text-muted">
          Dự án chưa được duyệt nên chưa thể tạo công việc.
        </p>
        {canDecide ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={decideMutation.isPending && decideMutation.variables?.id === project.id}
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate({ id: project.id, approve: true })}
            >
              <Check />
              Duyệt
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decideMutation.isPending}
              onClick={() => {
                setRejectTarget(project);
                setRejectNote("");
                setRejectError(null);
              }}
            >
              <X />
              Từ chối
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderRejectedBody = (project: ProjectRow) => (
    <div className="flex flex-col gap-3">
      <InfoGrid project={project} />
      <div className="rounded-control border border-state-danger/40 bg-state-danger/5 p-3 text-body-sm">
        <div className="text-text-primary">
          Bị từ chối lúc{" "}
          {project.rejected_at ? new Date(project.rejected_at).toLocaleString("vi-VN") : "—"}
        </div>
        <div className="text-text-secondary">
          Lý do: {project.rejection_reason ?? project.last_decision_note ?? "—"}
        </div>
      </div>
      <div>
        <div className="mb-1 text-caption uppercase tracking-wide text-text-muted">
          Lịch sử các vòng duyệt
        </div>
        {renderApprovalHistory(project)}
      </div>
      <div className="flex flex-wrap gap-2">
        {canEditProject(project, ctx) ? (
          <Button size="sm" variant="secondary" onClick={() => setEditTarget(project)}>
            Sửa dự án
          </Button>
        ) : null}
        {canSubmitProject(project, ctx) ? (
          <Button
            size="sm"
            loading={submitMutation.isPending && submitMutation.variables?.id === project.id}
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate(project)}
          >
            <Send />
            Gửi duyệt lại
          </Button>
        ) : null}
      </div>
    </div>
  );

  const renderArchivedBody = (project: ProjectRow) => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        {isProjectManuallyArchived(project) ? (
          <Badge variant="neutral" size="sm">
            Lưu trữ thủ công
          </Badge>
        ) : (
          <Badge variant="success" size="sm">
            Lưu trữ do hoàn thành
          </Badge>
        )}
        {project.completed_at ? (
          <span className="text-text-muted">
            Hoàn thành: {new Date(project.completed_at).toLocaleString("vi-VN")}
          </span>
        ) : null}
        <span className="text-text-muted">Không thể tạo công việc mới khi đang lưu trữ.</span>
      </div>
      <InfoGrid project={project} />
      {renderTaskList(project)}
    </div>
  );

  const renderBody = (project: ProjectRow) => {
    if (view === "pending") return renderPendingBody(project);
    if (view === "rejected") return renderRejectedBody(project);
    if (view === "archived") return renderArchivedBody(project);
    return renderTaskList(project);
  };

  const loading = projectsResult.isLoading || tasksResult.isLoading;
  const errored = projectsResult.isError || tasksResult.isError;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Dự án"
        description="Quản lý dự án theo bốn trạng thái và thao tác công việc ngay bên trong từng dự án."
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
        <div
          className="inline-flex flex-wrap rounded-md border border-border-subtle p-1"
          role="tablist"
        >
          {VIEW_ORDER.map(([key, label]) => (
            <Button
              key={key}
              role="tab"
              aria-selected={view === key}
              variant={view === key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setView(key)}
            >
              {label} ({counts[key]})
            </Button>
          ))}
        </div>
        {filtering ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X />
            Xóa bộ lọc
          </Button>
        ) : null}
        <span className="text-caption text-text-muted">{rows.length} dự án</span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : errored ? (
        <ErrorState
          title="Không tải được danh sách dự án"
          onRetry={() => {
            void projectsResult.refetch();
            void tasksResult.refetch();
          }}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState title={EMPTY_TITLE[view]} description={EMPTY_DESCRIPTION[view]} />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {visibleRows.map((project) => {
            const stats = statsByProject[project.id] ?? EMPTY_TASK_STATS;
            const allowAdd = view === "active" && canAddTaskToProject(project, ctx);
            return (
              <ProjectAccordionItem
                key={project.id}
                project={project}
                stats={stats}
                teamName={
                  project.responsible_team_id
                    ? teamName(project.responsible_team_id)
                    : project.teamIds.length > 0
                      ? project.teamIds.map(teamName).join(", ")
                      : "Chưa gán Team"
                }
                expanded={expanded.includes(project.id)}
                onToggle={() => toggleExpand(project.id)}
                showTaskStats={view === "active" || view === "archived"}
                canAddTask={allowAdd}
                onAddTask={() => setTaskProject(project)}
                actions={projectActions(project)}
              >
                {renderBody(project)}
              </ProjectAccordionItem>
            );
          })}

          {rows.length > visibleRows.length ? (
            <Button
              variant="outline"
              onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
              className="self-center"
            >
              Tải thêm ({rows.length - visibleRows.length})
            </Button>
          ) : null}
        </div>
      )}

      {/* Form dùng chung — không tạo form thứ hai */}
      <ProjectFormDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        project={null}
        fullEdit={access.isSystemAdmin || access.isLeader}
        currentUserRole={access.role}
        currentUserId={access.userId ?? ""}
        teams={teams}
        facilities={facilities}
        people={people}
      />
      <ProjectFormDrawer
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        project={editTarget}
        fullEdit={access.isSystemAdmin || access.isLeader}
        currentUserRole={access.role}
        currentUserId={access.userId ?? ""}
        teams={teams}
        facilities={facilities}
        people={people}
      />

      {taskProject ? (
        <TaskFormDrawer
          open
          onOpenChange={(open) => !open && setTaskProject(null)}
          task={null}
          ctx={taskCtx}
          projects={projects}
          teams={teams}
          people={people}
          lockedProjectId={taskProject.id}
          onCreated={() => {
            setExpanded((prev) =>
              prev.includes(taskProject.id) ? prev : [...prev, taskProject.id],
            );
            setTaskProject(null);
            refresh();
          }}
        />
      ) : null}

      {taskEditTarget ? (
        <TaskFormDrawer
          open
          onOpenChange={(open) => !open && setTaskEditTarget(null)}
          task={taskEditTarget}
          ctx={taskCtx}
          projects={projects}
          teams={teams}
          people={people}
        />
      ) : null}

      <ConfirmDialog
        open={completeTarget !== null}
        onOpenChange={(open) => !open && setCompleteTarget(null)}
        title="Hoàn thành dự án?"
        description={`Dự án "${completeTarget?.name ?? ""}" sẽ chuyển sang trạng thái hoàn thành và vào khu vực Lưu trữ.`}
        confirmLabel="Hoàn thành"
        loading={completeMutation.isPending}
        onConfirm={() => completeTarget && completeMutation.mutate(completeTarget)}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Đưa dự án vào Lưu trữ?"
        description="Dự án rời danh sách vận hành nhưng vẫn xem được ở tab Lưu trữ."
        confirmLabel="Lưu trữ"
        loading={archiveMutation.isPending}
        onConfirm={() =>
          archiveTarget && archiveMutation.mutate({ id: archiveTarget.id, archived: true })
        }
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
        title="Khôi phục dự án?"
        description="Dự án quay lại danh sách vận hành."
        confirmLabel="Khôi phục"
        loading={archiveMutation.isPending}
        onConfirm={() =>
          restoreTarget && archiveMutation.mutate({ id: restoreTarget.id, archived: false })
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Xóa dự án?"
        description="Dự án bị ẩn khỏi danh sách vận hành; dữ liệu và lịch sử vẫn được giữ lại."
        confirmLabel="Xóa"
        tone="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />

      <TaskCompleteDialog
        task={taskCompleteTarget}
        onOpenChange={(open) => {
          if (!open) setTaskCompleteTarget(null);
        }}
        onCompleted={() => {
          refresh();
          setTaskCompleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={taskArchiveTarget !== null}
        onOpenChange={(open) => !open && setTaskArchiveTarget(null)}
        title="Đưa công việc vào Lưu trữ?"
        description="Công việc rời danh sách vận hành nhưng vẫn xem được."
        confirmLabel="Lưu trữ"
        loading={taskArchiveMutation.isPending}
        onConfirm={() =>
          taskArchiveTarget &&
          taskArchiveMutation.mutate({ id: taskArchiveTarget.id, archived: true })
        }
      />

      <ConfirmDialog
        open={taskRestoreTarget !== null}
        onOpenChange={(open) => !open && setTaskRestoreTarget(null)}
        title="Khôi phục công việc?"
        description="Công việc quay lại danh sách vận hành."
        confirmLabel="Khôi phục"
        loading={taskArchiveMutation.isPending}
        onConfirm={() =>
          taskRestoreTarget &&
          taskArchiveMutation.mutate({ id: taskRestoreTarget.id, archived: false })
        }
      />

      <ConfirmDialog
        open={taskDeleteTarget !== null}
        onOpenChange={(open) => !open && setTaskDeleteTarget(null)}
        title="Xóa công việc?"
        description="Công việc bị ẩn khỏi danh sách vận hành; dữ liệu và lịch sử vẫn được giữ lại."
        confirmLabel="Xóa"
        tone="destructive"
        loading={taskDeleteMutation.isPending}
        onConfirm={() => taskDeleteTarget && taskDeleteMutation.mutate(taskDeleteTarget)}
      />

      <Modal
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (decideMutation.isPending) return;
          if (!open) setRejectTarget(null);
        }}
        title="Từ chối dự án"
        description="Bắt buộc nhập lý do để người tạo chỉnh sửa và gửi duyệt lại."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={decideMutation.isPending}
              onClick={() => setRejectTarget(null)}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              loading={decideMutation.isPending}
              onClick={() => {
                if (rejectNote.trim().length < 5) {
                  setRejectError("Lý do từ chối tối thiểu 5 ký tự.");
                  return;
                }
                if (rejectTarget) {
                  decideMutation.mutate({
                    id: rejectTarget.id,
                    approve: false,
                    reason: rejectNote.trim(),
                  });
                }
              }}
            >
              Từ chối
            </Button>
          </>
        }
      >
        <FormField
          id="project-reject-note"
          label="Lý do từ chối"
          required
          error={rejectError ?? undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={rejectNote}
              onChange={(event) => {
                setRejectNote(event.target.value);
                setRejectError(null);
              }}
              placeholder="Nêu rõ nội dung cần chỉnh sửa"
            />
          )}
        </FormField>
      </Modal>

      {deadlineTarget ? (
        <DeadlineRequestModal
          open
          onOpenChange={(open) => !open && setDeadlineTarget(null)}
          entityType="project"
          entityId={deadlineTarget.id}
          entityName={deadlineTarget.name}
          currentDeadline={deadlineTarget.deadline}
          dateOnly
        />
      ) : null}

      {taskDeadlineTarget ? (
        <DeadlineRequestModal
          open
          onOpenChange={(open) => !open && setTaskDeadlineTarget(null)}
          entityType="task"
          entityId={taskDeadlineTarget.id}
          entityName={taskDeadlineTarget.name}
          currentDeadline={taskDeadlineTarget.deadline}
        />
      ) : null}
    </div>
  );
}
