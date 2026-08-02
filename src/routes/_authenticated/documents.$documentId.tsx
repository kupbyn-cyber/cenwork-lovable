import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cenToast } from "@/components/ui/toast";
import { DocumentFormDrawer } from "@/components/document/document-form-drawer";
import { DocumentApprovalPanel } from "@/components/document/document-approval-panel";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  DOCUMENT_SOURCE_LABEL,
  DOCUMENT_VERSION_STATUS_LABEL,
} from "@/lib/document-catalog";
import {
  approveDocument,
  canDeleteDocument,
  canManageDocument,
  deleteDocumentDraft,
  documentQuery,
  documentStatus,
  isDraftDocument,
  myScopeAccessQuery,
  rejectDocument,
  setDocumentApprover,
  submitDocument,
  updateDocumentDraft,
  withdrawDocument,
  type DocumentAccessContext,
  type DocumentDraftInput,
} from "@/lib/document-data";
import { DOCUMENT_STATUS_TONE, formatDate, scopeText, typeText } from "@/lib/document-view";
import { activePeopleQuery, projectsQuery } from "@/lib/project-data";
import { teamsQuery } from "@/lib/org-data";


export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Chi tiết tài liệu — CEN WORK" },
      {
        name: "description",
        content: "Thông tin tài liệu nội bộ CEN WORK: phạm vi, phiên bản, hiệu lực và nguồn.",
      },
      { property: "og:title", content: "Chi tiết tài liệu — CEN WORK" },
      {
        property: "og:description",
        content: "Xem và quản lý bản nháp tài liệu theo đúng quyền truy cập.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentDetailPage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-text-muted">{label}</p>
      <div className="mt-0.5 break-words text-body text-text-primary">{children}</div>
    </div>
  );
}

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useOrgAccess();

  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const document = useQuery(documentQuery(documentId));
  const teams = useQuery(teamsQuery());
  const projects = useQuery(projectsQuery());
  const people = useQuery(activePeopleQuery());
  const scopeAccess = useQuery(myScopeAccessQuery(access.userId ?? undefined));

  const ctx: DocumentAccessContext = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
    manageableProjectIds: scopeAccess.data?.projectIds ?? [],
  };

  const doc = document.data ?? null;

  const updateMutation = useMutation({
    mutationFn: (input: DocumentDraftInput) =>
      updateDocumentDraft(doc!.id, doc!.latestVersion!.id, input),
    onSuccess: () => {
      cenToast.success("Đã lưu bản nháp.");
      setEditOpen(false);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocumentDraft(documentId),
    onSuccess: () => {
      cenToast.success("Đã xóa bản nháp.");
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void navigate({ to: "/documents" });
    },
    onError: (error: Error) => {
      cenToast.error(error.message);
      setConfirmDelete(false);
    },
  });

  const [approvalPending, setApprovalPending] = React.useState<
    "submit" | "withdraw" | "approve" | "reject" | "reassign" | null
  >(null);

  const refreshDocument = () => {
    void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const runApproval = async (
    kind: "submit" | "withdraw" | "approve" | "reject" | "reassign",
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (approvalPending) return;
    setApprovalPending(kind);
    try {
      await action();
      cenToast.success(successMessage);
      refreshDocument();
    } catch (error) {
      cenToast.error((error as Error).message);
    } finally {
      setApprovalPending(null);
    }
  };

  const [lifecyclePending, setLifecyclePending] = React.useState<LifecyclePending>(null);

  const runLifecycle = async (
    kind: Exclude<LifecyclePending, null>,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (lifecyclePending) return;
    setLifecyclePending(kind);
    try {
      await action();
      cenToast.success(successMessage);
      refreshDocument();
    } catch (error) {
      cenToast.error((error as Error).message);
    } finally {
      setLifecyclePending(null);
    }
  };


  if (document.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64 rounded-control" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (document.isError) {
    return (
      <ErrorState
        title="Không tải được chi tiết tài liệu"
        description={(document.error as Error)?.message}
        onRetry={() => void document.refetch()}
      />
    );
  }

  if (!doc) {
    return (
      <EmptyState
        title="Không tìm thấy tài liệu"
        description="Tài liệu không tồn tại hoặc bạn không có quyền xem."
        action={
          <Button variant="secondary" onClick={() => void navigate({ to: "/documents" })}>
            Về thư viện tài liệu
          </Button>
        }
      />
    );
  }

  const status = documentStatus(doc);
  const version = doc.latestVersion;
  const manageable = canManageDocument(doc, ctx);
  const editable = manageable && isDraftDocument(doc);
  const deletable = canDeleteDocument(doc, ctx);

  const teamOptions = (teams.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const projectOptions = (projects.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  const allowedTeams = access.isSystemAdmin
    ? teamOptions
    : teamOptions.filter((t) => (scopeAccess.data?.teamIds ?? []).includes(t.id));
  const allowedProjects = access.isSystemAdmin
    ? projectOptions
    : projectOptions.filter((p) => (scopeAccess.data?.projectIds ?? []).includes(p.id));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title={doc.name}
        description={doc.display_name}
        meta={
          <>
            <StatusBadge
              label={DOCUMENT_VERSION_STATUS_LABEL[status]}
              tone={DOCUMENT_STATUS_TONE[status]}
              size="sm"
            />
            <Badge variant="outline" className="font-normal">
              {version?.version_label ?? `v${version?.version_no ?? 1}`}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {doc.code}
            </Badge>
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void navigate({ to: "/documents" })}>
              <ArrowLeft className="size-icon-sm" aria-hidden="true" /> Quay lại
            </Button>
            <Button variant="secondary" asChild>
              <a href={doc.source_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-icon-sm" aria-hidden="true" /> Mở tài liệu
              </a>
            </Button>
            {manageable ? (
              editable ? (
                <Button
                  onClick={() => {
                    setFormError(null);
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="size-icon-sm" aria-hidden="true" /> Sửa bản nháp
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button disabled>
                        <Pencil className="size-icon-sm" aria-hidden="true" /> Sửa bản nháp
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Chỉ sửa được khi tài liệu đang ở trạng thái nháp.
                  </TooltipContent>
                </Tooltip>
              )
            ) : null}
            {manageable ? (
              deletable ? (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-icon-sm" aria-hidden="true" /> Xóa
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="destructive" disabled>
                        <Trash2 className="size-icon-sm" aria-hidden="true" /> Xóa
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Tài liệu đã từng gửi duyệt hoặc không còn là bản nháp nên không thể xóa.
                  </TooltipContent>
                </Tooltip>
              )
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Thông tin tài liệu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Mô tả">{doc.description || "—"}</Field>
          <Field label="Loại tài liệu">{typeText(doc.doc_type)}</Field>
          <Field label="Phạm vi">{scopeText(doc)}</Field>
          <Field label="Người phụ trách">{doc.ownerName ?? "—"}</Field>
          <Field label="Người tạo">{doc.creatorName ?? "—"}</Field>
          <Field label="Nguồn">{DOCUMENT_SOURCE_LABEL[doc.source_type]}</Field>
          <Field label="Ngày hiệu lực">{formatDate(version?.effective_from)}</Field>
          <Field label="Ngày hết hiệu lực">{formatDate(version?.effective_to)}</Field>
          <Field label="Ghi chú phiên bản">{version?.change_note || "—"}</Field>
          <Field label="Từ khóa">
            {doc.keywords.length === 0 ? (
              "—"
            ) : (
              <span className="flex flex-wrap gap-1">
                {doc.keywords.map((keyword) => (
                  <Badge key={keyword} variant="outline" className="font-normal">
                    {keyword}
                  </Badge>
                ))}
              </span>
            )}
          </Field>
          <Field label="Đường dẫn">
            <a
              href={doc.source_url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-brand-primary underline-offset-2 hover:underline"
            >
              {doc.source_url}
            </a>
          </Field>
        </CardContent>
      </Card>

      <DocumentApprovalPanel
        document={doc}
        ctx={ctx}
        people={people.data ?? []}
        pending={approvalPending}
        onSubmit={() =>
          void runApproval("submit", () => submitDocument(doc.id), "Đã gửi duyệt tài liệu.")
        }
        onWithdraw={() =>
          void runApproval("withdraw", () => withdrawDocument(doc.id), "Đã thu hồi yêu cầu duyệt.")
        }
        onApprove={(selfReason) =>
          void runApproval(
            "approve",
            () => approveDocument(doc.id, selfReason ?? undefined),
            "Đã duyệt tài liệu.",
          )
        }
        onReject={(reason) =>
          void runApproval("reject", () => rejectDocument(doc.id, reason), "Đã từ chối tài liệu.")
        }
        onReassign={(approverId) =>
          void runApproval(
            "reassign",
            () => setDocumentApprover(doc.id, approverId),
            "Đã chỉ định người duyệt thay thế.",
          )
        }
      />

      <DocumentLifecyclePanel
        document={doc}
        ctx={ctx}
        pending={lifecyclePending}
        onReport={(note) =>
          void runLifecycle("report", () => reportDocumentLink(doc.id, note), "Đã báo link lỗi.")
        }
        onResolve={(note, newUrl) =>
          void runLifecycle(
            "resolve",
            () => resolveDocumentLink(doc.id, note, newUrl),
            "Đã xác nhận xử lý đường dẫn.",
          )
        }
        onArchive={(reason) =>
          void runLifecycle("archive", () => archiveDocument(doc.id, reason), "Đã lưu trữ tài liệu.")
        }
        onRestore={(reason) =>
          void runLifecycle(
            "restore",
            () => restoreDocument(doc.id, reason),
            "Đã khôi phục tài liệu.",
          )
        }
      />




      <DocumentFormDrawer
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setFormError(null);
        }}
        document={doc}
        teams={allowedTeams}
        projects={allowedProjects}
        people={people.data ?? []}
        allowSystemScope={access.isSystemAdmin}
        submitting={updateMutation.isPending}
        serverError={formError}
        defaultOwnerId={doc.owner_id}
        onSubmit={(input) => {
          setFormError(null);
          updateMutation.mutate(input);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="destructive"
        title="Xóa bản nháp tài liệu?"
        description={`"${doc.name}" sẽ bị xóa vĩnh viễn.`}
        confirmLabel="Xóa bản nháp"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
