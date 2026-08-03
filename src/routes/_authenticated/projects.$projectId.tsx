import * as React from "react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  Check,
  Pencil,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { RowActionsMenu, type RowAction } from "@/components/common/row-actions-menu";
import {
  DeadlineDecisionModal,
  DeadlineRequestModal,
} from "@/components/common/deadline-request-modal";
import { ProjectFormDrawer } from "@/components/project/project-form-drawer";
import { useOrgAccess } from "@/hooks/use-org-access";
import { auditActionLabel, formatAuditTime } from "@/lib/audit-data";
import { deadlineRequestsQuery, findPending, setManualArchive } from "@/lib/deadline-data";
import { facilitiesQuery, teamsQuery } from "@/lib/org-data";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  activePeopleQuery,
  APPROVAL_ACTION_LABEL,
  APPROVAL_STAGE_LABEL,
  approvalStage,
  canApproveProjectDeadline,
  canDecideProject,
  canEditProject,
  canManuallyArchiveProject,
  canRequestProjectDeadline,
  canRestoreProject,
  canSubmitProject,
  decideProject,
  formatDate,
  isProjectApproved,
  isProjectRejected,
  projectApprovalsQuery,
  submitProject,
  isCompletedEarly,
  isOverdue,
  isProjectManuallyArchived,
  nextStatuses,
  projectHistoryQuery,
  projectQuery,
  setProjectStatus,
  timeProgress,
  type ProjectAccessContext,
  type ProjectRow,
  type ProjectStatus,
} from "@/lib/project-data";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Chi tiết dự án — CEN WORK" },
      {
        name: "description",
        content: "Thông tin dự án CEN WORK: mục tiêu, Owner, Team, Cơ sở, thời gian và lịch sử.",
      },
      { property: "og:title", content: "Chi tiết dự án — CEN WORK" },
      {
        property: "og:description",
        content: "Thông tin dự án CEN WORK: mục tiêu, Owner, Team, Cơ sở, thời gian và lịch sử.",
      },
    ],
  }),
  component: ProjectDetailPage,
});

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
      <span className="min-w-0 break-words text-body text-text-primary">{value}</span>
    </div>
  );
}

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const projectResult = useQuery(projectQuery(projectId));
  const historyResult = useQuery(projectHistoryQuery(projectId));
  const approvalsResult = useQuery(projectApprovalsQuery(projectId));
  const teamsResult = useQuery(teamsQuery());
  const facilitiesResult = useQuery(facilitiesQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [editOpen, setEditOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [decisionOpen, setDecisionOpen] = React.useState(false);

  const project = projectResult.data ?? null;
  const teams = teamsResult.data ?? [];
  const facilities = facilitiesResult.data ?? [];
  const people = peopleResult.data ?? [];

  const ctx: ProjectAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };

  const requestsResult = useQuery(deadlineRequestsQuery("project", projectId));
  const pendingRequest = findPending(requestsResult.data, "project", projectId);

  const invalidateProject = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-history", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project-approvals", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const statusMutation = useMutation({
    mutationFn: (input: { status: ProjectStatus; note?: string | null }) =>
      setProjectStatus(projectId, input.status, input.note),
    onSuccess: (_data, variables) => {
      invalidateProject();
      cenToast.success(`Đã chuyển sang trạng thái: ${PROJECT_STATUS_LABEL[variables.status]}.`);
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  /** Gửi duyệt / gửi lại — database quyết định bước duyệt kế tiếp. */
  const submitMutation = useMutation({
    mutationFn: () => submitProject(projectId),
    onSuccess: (next) => {
      invalidateProject();
      cenToast.success(
        next === "planning"
          ? "Dự án đã được duyệt."
          : next === "proposal"
            ? "Đã gửi CMO duyệt."
            : "Đã gửi Leader duyệt.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { approve: boolean; reason?: string }) =>
      decideProject(projectId, input.approve, input.reason ?? null),
    onSuccess: (next, variables) => {
      invalidateProject();
      setRejectOpen(false);
      setRejectNote("");
      setRejectError(null);
      cenToast.success(
        variables.approve
          ? next === "planning"
            ? "Đã duyệt dự án."
            : "Đã duyệt và chuyển CMO."
          : "Đã từ chối dự án.",
      );
    },
    onError: (error: Error) => {
      if (rejectOpen) setRejectError(error.message);
      else cenToast.error(error.message);
    },
  });

  const manualArchiveMutation = useMutation({
    mutationFn: (archived: boolean) => setManualArchive("project", projectId, archived),
    onSuccess: (_data, archived) => {
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["project-history", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      setArchiveOpen(false);
      setRestoreOpen(false);
      cenToast.success(archived ? "Đã đưa dự án vào Lưu trữ." : "Đã khôi phục dự án khỏi Lưu trữ.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  if (projectResult.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (projectResult.isError) {
    return (
      <ErrorState
        title="Không tải được dự án"
        description={(projectResult.error as Error).message}
        onRetry={() => void projectResult.refetch()}
      />
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="Không tìm thấy dự án"
        description="Dự án không tồn tại hoặc ngoài phạm vi bạn được xem."
        action={
          <Button variant="outline" onClick={() => void navigate({ to: "/projects" })}>
            Về danh sách dự án
          </Button>
        }
      />
    );
  }

  const detail: ProjectRow = project;
  const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? "—";
  const facilityName = (id: string) =>
    facilities.find((facility) => facility.id === id)?.name ?? "—";
  const progress = timeProgress(detail);
  const busy = statusMutation.isPending || submitMutation.isPending || decideMutation.isPending;
  const stage = approvalStage(detail);

  const actions: React.ReactNode[] = [];
  if (canSubmitProject(detail, ctx)) {
    actions.push(
      <Button
        key="submit"
        loading={submitMutation.isPending}
        disabled={busy}
        onClick={() => submitMutation.mutate()}
      >
        <Send />
        {isProjectRejected(detail) ? "Gửi duyệt lại" : "Gửi duyệt"}
      </Button>,
    );
  }
  if (canDecideProject(detail, ctx)) {
    actions.push(
      <Button
        key="approve"
        loading={decideMutation.isPending && decideMutation.variables?.approve === true}
        disabled={busy}
        onClick={() => decideMutation.mutate({ approve: true })}
      >
        <Check />
        {stage === "leader" ? "Duyệt và chuyển CMO" : "Duyệt dự án"}
      </Button>,
      <Button key="reject" variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
        <X />
        Từ chối
      </Button>,
    );
  }
  for (const status of nextStatuses(detail, ctx)) {
    actions.push(
      <Button
        key={status}
        variant="secondary"
        loading={statusMutation.isPending && statusMutation.variables?.status === status}
        disabled={busy}
        onClick={() => statusMutation.mutate({ status })}
      >
        {PROJECT_STATUS_LABEL[status]}
      </Button>,
    );
  }
  if (canEditProject(detail, ctx)) {
    actions.push(
      <Button key="edit" variant="outline" disabled={busy} onClick={() => setEditOpen(true)}>
        <Pencil />
        Cập nhật
      </Button>,
    );
  }
  if (pendingRequest && canApproveProjectDeadline(ctx)) {
    actions.push(
      <Button key="decide" variant="secondary" onClick={() => setDecisionOpen(true)}>
        <CalendarClock />
        Duyệt đổi deadline
      </Button>,
    );
  }
  const menuActions: RowAction[] = [];
  if (canRequestProjectDeadline(detail, ctx) && !pendingRequest) {
    menuActions.push({
      key: "deadline",
      label: "Yêu cầu đổi deadline",
      icon: CalendarClock,
      onSelect: () => setRequestOpen(true),
    });
  }
  if (canManuallyArchiveProject(detail, ctx)) {
    menuActions.push({
      key: "archive",
      label: "Đưa vào Lưu trữ",
      icon: Archive,
      onSelect: () => setArchiveOpen(true),
    });
  }
  if (canRestoreProject(detail, ctx)) {
    menuActions.push({
      key: "restore",
      label: "Khôi phục",
      icon: ArchiveRestore,
      onSelect: () => setRestoreOpen(true),
    });
  }
  if (menuActions.length > 0) {
    actions.push(<RowActionsMenu key="more" actions={menuActions} />);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={detail.name}
        description={detail.objective}
        breadcrumb={
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-body-sm text-text-muted hover:text-text-primary"
          >
            <ArrowLeft className="size-4" />
            Danh sách dự án
          </Link>
        }
        meta={
          <>
            <StatusBadge
              label={PROJECT_STATUS_LABEL[detail.status]}
              tone={PROJECT_STATUS_TONE[detail.status]}
            />
            {isOverdue(detail) ? <StatusBadge label="Quá deadline" tone="error" /> : null}
          </>
        }
        actions={actions}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin tổng quan</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Chủ dự án" value={detail.ownerName ?? "Chưa chỉ định"} />
            <InfoRow label="Người tạo" value={detail.creatorName ?? "—"} />
            <InfoRow label="Ngày bắt đầu" value={formatDate(detail.start_date)} />
            <InfoRow
              label="Deadline"
              value={
                <span className={isOverdue(detail) ? "text-state-danger" : undefined}>
                  {formatDate(detail.deadline)}
                </span>
              }
            />
            <InfoRow
              label="Team tham gia"
              value={detail.teamIds.length ? detail.teamIds.map(teamName).join(", ") : "—"}
            />
            <InfoRow
              label="Cơ sở liên quan"
              value={
                detail.facilityIds.length ? detail.facilityIds.map(facilityName).join(", ") : "—"
              }
            />
            <InfoRow
              label="Phạm vi tham gia"
              value="Thành viên của Team phụ trách và các Team tham gia"
            />
            <InfoRow label="Cập nhật gần nhất" value={formatAuditTime(detail.updated_at)} />
            <div className="sm:col-span-2">
              <InfoRow
                label="Mô tả / kế hoạch"
                value={
                  detail.description?.trim() ? (
                    <LinkifiedText text={detail.description} />
                  ) : (
                    "Chưa có mô tả."
                  )
                }
              />
            </div>
            {progress !== null ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-caption uppercase tracking-wide text-text-muted">
                  Tiến độ thời gian
                </span>
                <Progress value={progress} />
                <span className="text-caption text-text-muted">{progress}%</span>
              </div>
            ) : null}
            {detail.completed_at ? (
              <InfoRow
                label="Thời điểm hoàn thành"
                value={
                  <span className={isCompletedEarly(detail) ? "text-state-success" : undefined}>
                    {formatAuditTime(detail.completed_at)}
                    {isCompletedEarly(detail) ? " · Hoàn thành trước hạn" : ""}
                  </span>
                }
              />
            ) : null}
            {pendingRequest ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Yêu cầu đổi deadline"
                  value={`Đang chờ xử lý — đề xuất ${formatAuditTime(pendingRequest.proposed_deadline)} (${pendingRequest.requesterName ?? "—"})`}
                />
              </div>
            ) : null}
            {isProjectManuallyArchived(detail) ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Trạng thái lưu trữ"
                  value={`Đã đưa vào Lưu trữ thủ công lúc ${formatAuditTime(detail.manually_archived_at ?? detail.updated_at)}. Trạng thái nghiệp vụ giữ nguyên.`}
                />
              </div>
            ) : null}
            {isProjectRejected(detail) && detail.rejection_reason ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Lý do từ chối"
                  value={
                    <span className="text-state-danger">
                      {detail.rejection_reason}
                      {detail.rejected_at ? ` · ${formatAuditTime(detail.rejected_at)}` : ""}
                    </span>
                  }
                />
              </div>
            ) : null}
            <InfoRow
              label="Team phụ trách"
              value={detail.responsible_team_id ? teamName(detail.responsible_team_id) : "—"}
            />
            {detail.last_decision_note ? (
              <div className="sm:col-span-2">
                <InfoRow
                  label="Ghi chú quyết định gần nhất"
                  value={<LinkifiedText text={detail.last_decision_note} />}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử phê duyệt</CardTitle>
        </CardHeader>
        <CardContent>
          {approvalsResult.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : approvalsResult.isError ? (
            <ErrorState
              title="Không tải được lịch sử phê duyệt"
              onRetry={() => void approvalsResult.refetch()}
            />
          ) : (approvalsResult.data ?? []).length === 0 ? (
            <p className="text-body-sm text-text-muted">Dự án chưa được gửi duyệt lần nào.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {(approvalsResult.data ?? []).map((entry) => (
                <li key={entry.id} className="min-w-0 border-l-2 border-border-default pl-3">
                  <p className="text-body-sm text-text-primary">
                    Vòng {entry.round} · {APPROVAL_ACTION_LABEL[entry.action] ?? entry.action} ·{" "}
                    {APPROVAL_STAGE_LABEL[entry.stage] ?? entry.stage}
                  </p>
                  <p className="text-caption text-text-muted">
                    {entry.actorName ?? "—"} · {formatAuditTime(entry.created_at)}
                  </p>
                  {entry.reason ? (
                    <p className="text-body-sm text-state-danger">Lý do: {entry.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {access.userId ? (
        <ProjectFormDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          project={detail}
          fullEdit={isProjectApproved(detail)}
          currentUserRole={access.role}
          currentUserId={access.userId}
          teams={teams}
          facilities={facilities}
          people={people}
        />
      ) : null}

      <Modal
        open={rejectOpen}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) {
            setRejectOpen(false);
            setRejectError(null);
          }
        }}
        title="Từ chối và nêu lý do"
        description="Dự án chuyển sang trạng thái Bị từ chối; người tạo có thể sửa và gửi duyệt lại trên cùng bản ghi."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={busy}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              loading={decideMutation.isPending && decideMutation.variables?.approve === false}
              disabled={busy}
              onClick={() => {
                if (!rejectNote.trim()) {
                  setRejectError("Phải nhập lý do từ chối.");
                  return;
                }
                setRejectError(null);
                decideMutation.mutate({ approve: false, reason: rejectNote.trim() });
              }}
            >
              Xác nhận từ chối
            </Button>
          </div>
        }
      >
        <FormField id="reject-note" label="Lý do từ chối" required error={rejectError ?? undefined}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
            />
          )}
        </FormField>
      </Modal>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Đưa dự án vào Lưu trữ?"
        description="Dự án không bị xóa và trạng thái nghiệp vụ giữ nguyên; dự án chỉ chuyển sang tab Lưu trữ."
        confirmLabel="Đưa vào Lưu trữ"
        loading={manualArchiveMutation.isPending}
        onConfirm={() => manualArchiveMutation.mutate(true)}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Khôi phục dự án?"
        description="Dự án quay lại danh sách đang hoạt động, trạng thái nghiệp vụ không đổi."
        confirmLabel="Khôi phục"
        loading={manualArchiveMutation.isPending}
        onConfirm={() => manualArchiveMutation.mutate(false)}
      />

      <DeadlineRequestModal
        open={requestOpen}
        onOpenChange={setRequestOpen}
        entityType="project"
        entityId={detail.id}
        entityName={detail.name}
        currentDeadline={detail.deadline ? `${detail.deadline}T00:00:00+07:00` : null}
        dateOnly
      />

      <DeadlineDecisionModal
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        request={pendingRequest}
        entityName={detail.name}
      />
    </div>
  );
}
