import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CalendarClock,
  Columns3,
  Plus,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
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
import { TaskCompleteDialog } from "@/components/task/task-complete-dialog";
import { TaskStatusQuickSelect } from "@/components/task/task-status-quick-select";
import { TaskCancelDialog } from "@/components/task/task-cancel-dialog";
import { TaskFormDrawer } from "@/components/task/task-form-drawer";
import { TaskApprovalPanel } from "@/components/task/task-approval-panel";
import { TaskAdvancedFilters } from "@/components/task/task-advanced-filters";
import { TaskCardList } from "@/components/task/task-card-list";
import { TaskQuickViewModal } from "@/components/task/task-quick-view-modal";
import { TaskSavedViews } from "@/components/task/task-saved-views";
import { RowActionsCell } from "@/components/common/row-actions-cell";
import { DeadlineRequestModal } from "@/components/common/deadline-request-modal";
import type { RowAction } from "@/components/common/row-actions-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CommentIndicator,
  DeadlineCountdown,
  PriorityLabel,
} from "@/components/task/task-cell-bits";
import { taskUnreadCountsQuery } from "@/lib/task-comment-data";
import { useOrgAccess } from "@/hooks/use-org-access";
import { teamsQuery } from "@/lib/org-data";
import { setManualArchive } from "@/lib/deadline-data";
import { canSoftDelete, softDeleteEntity } from "@/lib/soft-delete";
import { activePeopleQuery, projectsQuery } from "@/lib/project-data";
import { buildMineScope, isTaskMine } from "@/lib/mine-scope";
import { buildTaskPrefill } from "@/lib/task-prefill";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  canCancelTask,
  canChangeTaskStatus,
  canEditTask,
  canManuallyArchiveTask,
  canRequestTaskDeadline,
  canRestoreTask,
  isTaskArchived,
  taskStatusView,
  tasksQuery,
  type TaskAccessContext,
  type TaskRow,
} from "@/lib/task-data";
import {
  COLUMN_LABEL,
  DEFAULT_COLUMNS,
  EMPTY_FILTERS,
  NO_PROJECT,
  OPTIONAL_COLUMNS,
  TASK_SORT_LABEL,
  TASK_SORT_ORDER,
  filterTasks,
  hasActiveFilters,
  savedViewsQuery,
  sortTasks,
  type OptionalColumnId,
  type SavedViewConfig,
  type TaskFilterState,
  type TaskSortKey,
} from "@/lib/task-view-data";

export const Route = createFileRoute("/_authenticated/tasks/")({
  /** DASH-CORE-01 — nhận tham số lọc sẵn khi drill-down từ Dashboard hiệu suất. */
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    status?: string | undefined;
    assignee?: string | undefined;
    team?: string | undefined;
    project?: string | undefined;
    priority?: string | undefined;
    kind?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    overdue?: string | undefined;
    mine?: string | undefined;
    needsMe?: string | undefined;
  } => {
    const str = (key: string) =>
      typeof search[key] === "string" ? (search[key] as string) : undefined;
    return {
      status: str("status"),
      assignee: str("assignee"),
      team: str("team"),
      project: str("project"),
      priority: str("priority"),
      kind: str("kind"),
      from: str("from"),
      to: str("to"),
      overdue: search["overdue"] === "1" || search["overdue"] === true ? "1" : undefined,
      mine: search["mine"] === "1" || search["mine"] === true ? "1" : undefined,
      needsMe: search["needsMe"] === "1" || search["needsMe"] === true ? "1" : undefined,
    };
  },
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

const PAGE_SIZE = 25;

function TasksPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const drill = Route.useSearch();
  /** Có tham số drill-down từ Dashboard hay không (quyết định có áp chế độ xem mặc định). */
  const hasDrill = Object.values(drill).some((value) => value !== undefined);
  const isOverdueDrill = drill.overdue === "1" || drill.kind === "overdue";

  const tasksResult = useQuery(tasksQuery());
  const projectsResult = useQuery(projectsQuery());
  const teamsResult = useQuery(teamsQuery());
  const peopleResult = useQuery(activePeopleQuery());
  const viewsResult = useQuery(savedViewsQuery(access.userId));
  const unreadResult = useQuery(taskUnreadCountsQuery(access.userId));

  /** Bộ lọc áp dụng (đã debounce phần tìm kiếm). */
  const [filters, setFilters] = React.useState<TaskFilterState>(() => ({
    ...EMPTY_FILTERS,
    status: drill.status ? drill.status.split(",").filter(Boolean) : [],
    assignee: drill.assignee ? [drill.assignee] : [],
    team: drill.team ? [drill.team] : [],
    project: drill.project ? [drill.project] : [],
    priority: drill.priority ? [drill.priority] : [],
    kind: (isOverdueDrill ? "overdue" : (drill.kind ?? "all")) as TaskFilterState["kind"],
    deadlineFrom: isOverdueDrill ? "" : (drill.from ?? ""),
    deadlineTo: isOverdueDrill ? "" : (drill.to ?? ""),
    mine: drill.mine === "1",
    needsMe: drill.needsMe === "1",
  }));
  const [searchInput, setSearchInput] = React.useState("");
  const [sort, setSort] = React.useState<TaskSortKey>("created_desc");
  const [columns, setColumns] = React.useState<OptionalColumnId[]>(DEFAULT_COLUMNS);
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"active" | "archived">("active");
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<TaskRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<TaskRow | null>(null);
  const [deadlineTarget, setDeadlineTarget] = React.useState<TaskRow | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<TaskRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<TaskRow | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<TaskRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TaskRow | null>(null);
  /** TASK-WORKFLOW-UX-01 — nhìn nhanh công việc trước khi mở trang chi tiết. */
  const [quickView, setQuickView] = React.useState<TaskRow | null>(null);

  const projects = projectsResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const people = peopleResult.data ?? [];
  const projectById = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const myPrimaryTeamId =
    people.find((person) => person.id === access.userId)?.primary_team_id ?? null;
  const mineScope = React.useMemo(
    () => buildMineScope(access.userId, access.leaderTeamId, myPrimaryTeamId),
    [access.userId, access.leaderTeamId, myPrimaryTeamId],
  );
  const savedViews = React.useMemo(() => viewsResult.data ?? [], [viewsResult.data]);

  const ctx: TaskAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  // Debounce tìm kiếm để không lọc lại theo từng ký tự.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const applyView = React.useCallback(
    (viewId: string | null) => {
      setActiveViewId(viewId);
      setLimit(PAGE_SIZE);
      if (!viewId) {
        setFilters(EMPTY_FILTERS);
        setSearchInput("");
        setSort("created_desc");
        setColumns(DEFAULT_COLUMNS);
        return;
      }
      const target = savedViews.find((item) => item.id === viewId);
      if (!target) return;
      setFilters(target.filters);
      setSearchInput(target.filters.search);
      setSort(target.sort);
      setColumns(target.columns);
    },
    [savedViews],
  );

  /** Áp dụng chế độ xem mặc định cá nhân khi mở trang. */
  const appliedDefaultRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedDefaultRef.current || viewsResult.isLoading) return;
    appliedDefaultRef.current = true;
    // Drill-down từ Dashboard phải giữ nguyên bộ lọc được truyền sang.
    if (hasDrill) return;
    const preferred = savedViews.find((item) => item.isDefault);
    if (preferred) applyView(preferred.id);
  }, [savedViews, viewsResult.isLoading, applyView, hasDrill]);

  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

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

  const allTasks = React.useMemo(() => tasksResult.data ?? [], [tasksResult.data]);

  const rows = React.useMemo(
    () =>
      sortTasks(
        filterTasks(allTasks, filters, view, ctx, (task) =>
          isTaskMine(task, mineScope, projectById),
        ),
        sort,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTasks, filters, view, sort, mineScope, projectById, access.role],
  );

  const visibleRows = React.useMemo(() => rows.slice(0, limit), [rows, limit]);

  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filters, sort, view]);

  const filtering = hasActiveFilters(filters);
  const totalInScope = React.useMemo(
    () => allTasks.filter((task) => isTaskArchived(task) === (view === "archived")).length,
    [allTasks, view],
  );

  const patchFilters = (patch: Partial<TaskFilterState>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
  };

  const currentConfig: SavedViewConfig = { filters, sort, columns };

  /** Giá trị tự điền cho form tạo Task, lấy từ bộ lọc hiện tại và đã kiểm tra hợp lệ. */
  const createPrefill = React.useMemo(
    () => buildTaskPrefill(filters, projects, people, teams),
    [filters, projects, people, teams],
  );

  const rowActions = (row: TaskRow) => {
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
    if (canCancelTask(row, ctx)) {
      menuActions.push({
        key: "cancel",
        label: "Hủy công việc",
        icon: Ban,
        tone: "destructive",
        onSelect: () => setCancelTarget(row),
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
        completing={completeTarget?.id === row.id}
        menuActions={menuActions}
      />
    );
  };

  const show = (id: OptionalColumnId) => columns.includes(id);

  const unreadCount = (taskId: string) => unreadResult.data?.[taskId] ?? 0;

  /** Mở chi tiết Task và cuộn tới khu vực Bình luận. */
  const openComments = (taskId: string) =>
    void navigate({ to: "/tasks/$taskId", params: { taskId }, hash: "task-comments" });

  const col = (width: string) => ({ className: `${width} px-3`, headerClassName: `${width} px-3` });

  const tableColumns = [
    {
      id: "name",
      header: "Công việc",
      className: "px-3",
      headerClassName: "px-3",
      cell: (row: TaskRow) => (
        <div className="flex min-w-0 items-start gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 font-medium text-text-primary">
            {row.name}
          </span>
          <CommentIndicator unread={unreadCount(row.id)} onOpen={() => openComments(row.id)} />
        </div>
      ),
    },
    ...(show("project")
      ? [
          {
            id: "project",
            header: "Dự án",
            ...col("w-[112px]"),
            cell: (row: TaskRow) =>
              row.projectName ? (
                <span className="block truncate text-text-secondary">{row.projectName}</span>
              ) : (
                <Badge variant="outline" className="font-normal">
                  Độc lập
                </Badge>
              ),
          },
        ]
      : []),
    ...(show("assignee")
      ? [
          {
            id: "assignee",
            header: "Phụ trách",
            ...col("w-[104px]"),
            cell: (row: TaskRow) => (
              <span className="block truncate text-text-secondary">{row.assigneeName ?? "—"}</span>
            ),
          },
        ]
      : []),
    ...(show("team")
      ? [
          {
            id: "team",
            header: "Team",
            className: "w-[84px] px-3 hidden lg:table-cell",
            headerClassName: "w-[84px] px-3 hidden lg:table-cell",
            cell: (row: TaskRow) => (
              <span className="block truncate text-text-secondary">{row.teamName ?? "—"}</span>
            ),
          },
        ]
      : []),
    ...(show("deadline")
      ? [
          {
            id: "deadline",
            header: "Deadline",
            ...col("w-[128px]"),
            cell: (row: TaskRow) => <DeadlineCountdown task={row} />,
          },
        ]
      : []),
    ...(show("priority")
      ? [
          {
            id: "priority",
            header: "Ưu tiên",
            ...col("w-[96px]"),
            cell: (row: TaskRow) => <PriorityLabel priority={row.priority} />,
          },
        ]
      : []),
    ...(show("status")
      ? [
          {
            id: "status",
            header: "Trạng thái",
            ...col("w-[148px]"),
            cell: (row: TaskRow) => (
              <TaskStatusQuickSelect task={row} ctx={ctx} onRequestComplete={setCompleteTarget} />
            ),
          },
        ]
      : []),
    {
      id: "actions",
      header: "Hành động",
      align: "right" as const,
      className: "w-[112px] whitespace-nowrap px-3",
      headerClassName: "w-[112px] px-3 text-right",
      cell: rowActions,
    },
  ];

  const emptyTitle = filtering
    ? "Không có công việc phù hợp bộ lọc"
    : view === "archived"
      ? "Chưa có công việc lưu trữ"
      : "Chưa có công việc nào";
  const emptyDescription = filtering
    ? "Thử bỏ bớt điều kiện lọc hoặc xóa bộ lọc để xem lại toàn bộ công việc."
    : view === "archived"
      ? "Công việc sẽ xuất hiện ở đây sau khi được xác nhận hoàn thành hoặc lưu trữ."
      : "Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ.";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Công việc"
        description="Toàn bộ công việc thuộc dự án hoặc độc lập, trong phạm vi bạn được xem."
        actions={
          access.can("tasks.create") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Tạo công việc
            </Button>
          ) : null
        }
      />

      <TaskSavedViews
        userId={access.userId}
        views={savedViews}
        activeViewId={activeViewId}
        onSelect={applyView}
        currentConfig={currentConfig}
      />

      <TaskApprovalPanel ctx={ctx} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Input
          placeholder="Tìm theo tên công việc"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Tìm theo tên công việc"
        />
        <MultiSelect
          placeholder="Trạng thái"
          ariaLabel="Lọc theo trạng thái"
          value={filters.status}
          onChange={(value) => patchFilters({ status: value })}
          options={TASK_STATUS_ORDER.map((status) => ({
            value: status,
            label: TASK_STATUS_LABEL[status],
          }))}
        />
        <MultiSelect
          placeholder="Người phụ trách"
          ariaLabel="Lọc theo người phụ trách"
          value={filters.assignee}
          onChange={(value) => patchFilters({ assignee: value })}
          searchable
          searchPlaceholder="Tìm theo tên, email…"
          options={people.map((person) => ({
            value: person.id,
            label: person.display_name,
            hint: person.email ?? undefined,
          }))}
        />
        <MultiSelect
          placeholder="Dự án"
          ariaLabel="Lọc theo dự án"
          value={filters.project}
          onChange={(value) => patchFilters({ project: value })}
          searchable
          searchPlaceholder="Tìm dự án…"
          options={[
            { value: NO_PROJECT, label: "Công việc độc lập" },
            ...projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
        />
        <MultiSelect
          placeholder="Team"
          ariaLabel="Lọc theo Team"
          value={filters.team}
          onChange={(value) => patchFilters({ team: value })}
          searchable
          searchPlaceholder="Tìm Team…"
          options={teams.map((team) => ({ value: team.id, label: team.name }))}
        />
        <Select value={sort} onValueChange={(value) => setSort(value as TaskSortKey)}>
          <SelectTrigger aria-label="Sắp xếp">
            <SelectValue placeholder="Sắp xếp" />
          </SelectTrigger>
          <SelectContent>
            {TASK_SORT_ORDER.map((key) => (
              <SelectItem key={key} value={key}>
                {TASK_SORT_LABEL[key]}
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

        <TaskAdvancedFilters filters={filters} onChange={patchFilters} people={people} />

        <Button
          variant={filters.related ? "secondary" : "outline"}
          size="sm"
          aria-pressed={filters.related}
          onClick={() => patchFilters({ related: !filters.related })}
        >
          <UserCheck />
          Của tôi
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 />
              Cột hiển thị
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Cột hiển thị</DropdownMenuLabel>
            {OPTIONAL_COLUMNS.map((id) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={show(id)}
                onCheckedChange={(checked) =>
                  setColumns((prev) =>
                    checked
                      ? OPTIONAL_COLUMNS.filter((item) => item === id || prev.includes(item))
                      : prev.filter((item) => item !== id),
                  )
                }
                onSelect={(event) => event.preventDefault()}
              >
                {COLUMN_LABEL[id]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {filtering ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X />
            Xóa bộ lọc
          </Button>
        ) : null}

        <span className="text-caption text-text-muted">
          {rows.length} công việc{filtering ? ` / ${totalInScope}` : ""}
        </span>
      </div>

      {isMobile && !tasksResult.isLoading && !tasksResult.isError && visibleRows.length > 0 ? (
        <TaskCardList
          tasks={visibleRows}
          columns={columns}
          ctx={ctx}
          onRequestComplete={setCompleteTarget}
          onOpen={(task) => setQuickView(task)}
          unreadCount={unreadCount}
          onOpenComments={openComments}
          renderActions={rowActions}
        />
      ) : (
        <DataTable
          columns={tableColumns}
          data={visibleRows}
          density="compact"
          tableClassName="table-fixed"
          getRowId={(row) => row.id}
          loading={tasksResult.isLoading}
          error={tasksResult.isError}
          onRetry={() => void tasksResult.refetch()}
          errorTitle="Không tải được danh sách công việc"
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          onRowClick={(row) => setQuickView(row)}
        />
      )}

      <TaskQuickViewModal
        task={quickView}
        onOpenChange={(open) => {
          if (!open) setQuickView(null);
        }}
      />

      {visibleRows.length < rows.length ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((value) => value + PAGE_SIZE)}
          >
            Tải thêm ({rows.length - visibleRows.length} công việc)
          </Button>
        </div>
      ) : null}

      {access.userId ? (
        <TaskFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          task={null}
          ctx={ctx}
          projects={projects}
          teams={teams}
          people={people}
          prefill={createPrefill}
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

      <TaskCompleteDialog
        task={completeTarget}
        onOpenChange={(open) => {
          if (!open) setCompleteTarget(null);
        }}
        onCompleted={() => {
          refresh();
          setCompleteTarget(null);
        }}
      />

      <TaskCancelDialog
        task={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onCancelled={() => {
          refresh();
          setCancelTarget(null);
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
