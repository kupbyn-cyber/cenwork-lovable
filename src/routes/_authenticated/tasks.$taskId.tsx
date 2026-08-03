import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  Loader2,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import { RowActionsMenu, type RowAction } from "@/components/common/row-actions-menu";
import {
  DeadlineDecisionModal,
  DeadlineRequestModal,
} from "@/components/common/deadline-request-modal";
import { TaskCompleteDialog } from "@/components/task/task-complete-dialog";
import { TaskFormDrawer } from "@/components/task/task-form-drawer";
import { cn } from "@/lib/utils";
import { useFlashHighlight } from "@/hooks/use-flash-highlight";
import { useOrgAccess } from "@/hooks/use-org-access";
import { auditActionLabel, formatAuditTime } from "@/lib/audit-data";
import {
  deadlineRequestsQuery,
  findPending,
  setManualArchive,
} from "@/lib/deadline-data";
import { teamsQuery } from "@/lib/org-data";
import { activePeopleQuery, projectsQuery } from "@/lib/project-data";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_STATUS_TONE,
  canApproveTaskDeadline,
  canChangeTaskStatus,
  canEditTask,
  canManuallyArchiveTask,
  canRequestTaskDeadline,
  canRestoreTask,
  formatDate,
  formatDateTime,
  isCompletedEarly,
  isTaskManuallyArchived,
  isTaskOverdue,
  setTaskStatus,
  taskHistoryQuery,
  taskQuery,
  taskResultsQuery,
  taskTimeProgress,
  type TaskAccessContext,
  type TaskStatus,
} from "@/lib/task-data";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({
    meta: [
      { title: "Chi tiết công việc — CEN WORK" },
      {
        name: "description",
        content:
          "Thông tin công việc CEN WORK: người phụ trách, người tham gia, thời gian, ưu tiên, trạng thái và lịch sử.",
      },
      { property: "og:title", content: "Chi tiết công việc — CEN WORK" },
      {
        property: "og:description",
        content:
          "Thông tin công việc CEN WORK: người phụ trách, người tham gia, thời gian, ưu tiên, trạng thái và lịch sử.",
      },
    ],
  }),
  component: TaskDetailPage,
});

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-body text-text-primary">{value}</span>
    </div>
  );
}

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const taskResult = useQuery(taskQuery(taskId));
  const historyResult = useQuery(taskHistoryQuery(taskId));
  const resultsResult = useQuery(taskResultsQuery(taskId));
  const projectsResult = useQuery(projectsQuery());
  const teamsResult = useQuery(teamsQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [decisionOpen, setDecisionOpen] = React.useState(false);
  const [completeOpen, setCompleteOpen] = React.useState(false);

  const task = taskResult.data ?? null;
  const ctx: TaskAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  const requestsResult = useQuery(deadlineRequestsQuery("task", taskId));
  const pendingRequest = findPending(requestsResult.data, "task", taskId);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["task-history", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["task-results", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["deadline-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  const { flash, isFlashing, flashKey } = useFlashHighlight();

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => setTaskStatus(taskId, status),
    onSuccess: (_data, status) => {
      invalidate();
      flash("status");
      cenToast.success(`Đã chuyển trạng thái: ${TASK_STATUS_LABEL[status]}.`);
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => setManualArchive("task", taskId, archived),
    onSuccess: (_data, archived) => {
      invalidate();
      setArchiveOpen(false);
      setRestoreOpen(false);
      cenToast.success(
        archived ? "Đã đưa công việc vào Lưu trữ." : "Đã khôi phục công việc khỏi Lưu trữ.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  if (taskResult.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (taskResult.isError) {
    return (
      <ErrorState
        title="Không tải được công việc"
        onRetry={() => void taskResult.refetch()}
      />
    );
  }

  if (!task) {
    return (
      <EmptyState
        title="Không tìm thấy công việc"
        description="Công việc không tồn tại hoặc ngoài phạm vi bạn được xem."
        action={
          <Button variant="secondary" onClick={() => void navigate({ to: "/tasks" })}>
            Về danh sách công việc
          </Button>
        }
      />
    );
  }

  const progress = taskTimeProgress(task);
  const editable = canEditTask(task, ctx);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Link
        to="/tasks"
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-icon-sm" aria-hidden="true" />
        Danh sách công việc
      </Link>

      <PageHeader
        title={task.name}
        description={task.projectName ? `Thuộc dự án: ${task.projectName}` : "Công việc độc lập"}
        actions={
          <div className="flex flex-wrap gap-2">
            {canChangeTaskStatus(task, ctx) ? (
              <div className="flex items-center gap-2">
              <Select
                value={task.status}
                onValueChange={(value) => {
                  if (value === "done") {
                    setCompleteOpen(true);
                    return;
                  }
                  statusMutation.mutate(value as TaskStatus);
                }}
                disabled={statusMutation.isPending}
              >
                <SelectTrigger className="w-48" aria-label="Đổi trạng thái công việc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TASK_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusMutation.isPending ? (
                <Loader2
                  className="size-icon-sm shrink-0 animate-spin text-text-muted"
                  aria-label="Đang cập nhật trạng thái"
                  role="status"
                />
              ) : null}
              </div>
            ) : null}
            {editable ? (
              <Button
                variant="secondary"
                disabled={statusMutation.isPending}
                onClick={() => setEditOpen(true)}
              >
                <Pencil />
                Cập nhật
              </Button>
            ) : null}
            {pendingRequest && canApproveTaskDeadline(task, ctx) ? (
              <Button variant="secondary" onClick={() => setDecisionOpen(true)}>
                <CalendarClock />
                Duyệt đổi deadline
              </Button>
            ) : null}
            <RowActionsMenu
              actions={
                [
                  canRequestTaskDeadline(task, ctx) && !pendingRequest
                    ? {
                        key: "deadline",
                        label: "Yêu cầu đổi deadline",
                        icon: CalendarClock,
                        onSelect: () => setRequestOpen(true),
                      }
                    : null,
                  canManuallyArchiveTask(task, ctx)
                    ? {
                        key: "archive",
                        label: "Đưa vào Lưu trữ",
                        icon: Archive,
                        onSelect: () => setArchiveOpen(true),
                      }
                    : null,
                  canRestoreTask(task, ctx)
                    ? {
                        key: "restore",
                        label: "Khôi phục",
                        icon: ArchiveRestore,
                        onSelect: () => setRestoreOpen(true),
                      }
                    : null,
                ].filter(Boolean) as RowAction[]
              }
            />

          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin công việc</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow
              label="Trạng thái"
              value={
                <span
                  key={`status-${flashKey("status")}`}
                  className={cn(
                    "inline-flex rounded-badge",
                    isFlashing("status") && "cen-flash",
                  )}
                >
                  <StatusBadge
                    label={TASK_STATUS_LABEL[task.status]}
                    tone={TASK_STATUS_TONE[task.status]}
                  />
                </span>
              }
            />
            <InfoRow
              label="Mức ưu tiên"
              value={
                <StatusBadge
                  label={TASK_PRIORITY_LABEL[task.priority]}
                  tone={TASK_PRIORITY_TONE[task.priority]}
                />
              }
            />
            <InfoRow label="Người phụ trách" value={task.assigneeName ?? "—"} />
            <InfoRow label="Team phụ trách" value={task.teamName ?? "—"} />
            <InfoRow label="Ngày bắt đầu" value={formatDate(task.start_date)} />
            <InfoRow
              label="Deadline"
              value={
                <span className={isTaskOverdue(task) ? "text-state-danger" : undefined}>
                  {formatDateTime(task.deadline)}
                  {isTaskOverdue(task) ? " · Quá hạn" : ""}
                </span>
              }
            />
            <InfoRow label="Người tạo" value={task.creatorName ?? "—"} />
            <InfoRow
              label="Người tham gia"
              value={task.participantNames.length > 0 ? task.participantNames.join(", ") : "—"}
            />
            {task.description ? (
              <div className="sm:col-span-2">
                <InfoRow label="Mô tả" value={<LinkifiedText text={task.description} />} />
              </div>
            ) : null}
            {progress !== null ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-caption uppercase tracking-wide text-text-muted">
                  Tiến độ thời gian
                </span>
                <Progress value={progress} />
                <span className="text-caption text-text-muted">{progress}%</span>
              </div>
            ) : null}
            {task.completed_at ? (
              <InfoRow
                label="Thời điểm hoàn thành"
                value={
                  <span className={isCompletedEarly(task) ? "text-state-success" : undefined}>
                    {formatDateTime(task.completed_at)}
                    {isCompletedEarly(task) ? " · Hoàn thành trước hạn" : ""}
                  </span>
                }
              />
            ) : null}
            {task.result_text ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Kết quả công việc"
                  value={
                    <span>
                      <LinkifiedText text={task.result_text} />
                      <span className="mt-1 block text-caption text-text-muted">
                        Cập nhật bởi {task.resultUpdatedByName ?? "—"} ·{" "}
                        {formatDateTime(task.result_updated_at)}
                      </span>
                    </span>
                  }
                />
              </div>
            ) : null}
            {pendingRequest ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Yêu cầu đổi deadline"
                  value={`Đang chờ xử lý — đề xuất ${formatDateTime(pendingRequest.proposed_deadline)} (${pendingRequest.requesterName ?? "—"})`}
                />
              </div>
            ) : null}
            {isTaskManuallyArchived(task) ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Trạng thái lưu trữ"
                  value={`Đã đưa vào Lưu trữ thủ công lúc ${formatDateTime(task.manually_archived_at)}. Trạng thái nghiệp vụ giữ nguyên.`}
                />
              </div>
            ) : null}

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử kết quả</CardTitle>
          </CardHeader>
          <CardContent>
            {resultsResult.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : resultsResult.isError ? (
              <ErrorState
                title="Không tải được lịch sử kết quả"
                onRetry={() => void resultsResult.refetch()}
              />
            ) : (resultsResult.data ?? []).length === 0 ? (
              <p className="text-body-sm text-text-muted">Chưa có kết quả nào được ghi nhận.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {(resultsResult.data ?? []).map((entry, index) => (
                  <li key={entry.id} className="min-w-0 border-l-2 border-border-default pl-3">
                    <LinkifiedText
                      as="p"
                      className="text-body-sm text-text-primary"
                      text={entry.result_text}
                    />
                    <p className="text-caption text-text-muted">
                      {index === 0 ? "Kết quả hiện tại · " : ""}
                      {entry.authorName ?? "—"} · {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lịch sử thay đổi</CardTitle>
          </CardHeader>
          <CardContent>
            {historyResult.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : historyResult.isError ? (
              <ErrorState
                title="Không tải được lịch sử"
                onRetry={() => void historyResult.refetch()}
              />
            ) : (historyResult.data ?? []).length === 0 ? (
              <p className="text-body-sm text-text-muted">Chưa có thay đổi nào được ghi nhận.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {(historyResult.data ?? []).map((entry) => (
                  <li key={entry.id} className="min-w-0 border-l-2 border-border-default pl-3">
                    <p className="text-body-sm text-text-primary">
                      {auditActionLabel(entry.action)}
                    </p>
                    <p className="text-caption text-text-muted">
                      {entry.actor_email ?? "—"} · {formatAuditTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {access.userId ? (
        <TaskFormDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          task={task}
          ctx={ctx}
          projects={projectsResult.data ?? []}
          teams={teamsResult.data ?? []}
          people={peopleResult.data ?? []}
        />
      ) : null}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Đưa công việc vào Lưu trữ?"
        description="Công việc không bị xóa và trạng thái nghiệp vụ giữ nguyên; công việc chỉ chuyển sang tab Lưu trữ."
        confirmLabel="Đưa vào Lưu trữ"
        loading={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate(true)}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Khôi phục công việc?"
        description="Công việc quay lại danh sách đang hoạt động, trạng thái nghiệp vụ không đổi."
        confirmLabel="Khôi phục"
        loading={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate(false)}
      />

      <TaskCompleteDialog
        task={completeOpen ? task : null}
        onOpenChange={(open) => setCompleteOpen(open)}
        onCompleted={() => {
          invalidate();
          flash("status");
        }}
      />

      <DeadlineRequestModal
        open={requestOpen}
        onOpenChange={setRequestOpen}
        entityType="task"
        entityId={task.id}
        entityName={task.name}
        currentDeadline={task.deadline}
      />

      <DeadlineDecisionModal
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        request={pendingRequest}
        entityName={task.name}
      />

    </div>
  );
}
