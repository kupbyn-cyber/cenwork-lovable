import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, FileText, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cenToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RowActionsMenu, type RowAction } from "@/components/common/row-actions-menu";
import { DocumentCardList } from "@/components/document/document-card-list";
import { DocumentFilters } from "@/components/document/document-filters";
import { DocumentFormDrawer } from "@/components/document/document-form-drawer";
import { DocumentOverview } from "@/components/document/document-overview";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgAccess } from "@/hooks/use-org-access";
import { DOCUMENT_VERSION_STATUS_LABEL } from "@/lib/document-catalog";
import {
  canDeleteDocument,
  canManageDocument,
  createDocumentDraft,
  deleteDocumentDraft,
  documentStatus,
  documentsQuery,
  isDraftDocument,
  myScopeAccessQuery,
  updateDocumentDraft,
  type DocumentAccessContext,
  type DocumentDraftInput,
  type DocumentRow,
} from "@/lib/document-data";
import {
  DOCUMENT_SORT_OPTIONS,
  DOCUMENT_STATUS_TONE,
  DOCUMENT_VIEWS,
  EMPTY_DOCUMENT_FILTERS,
  buildOverviewMetrics,
  filterDocuments,
  formatDate,
  hasActiveDocumentFilters,
  scopeText,
  sortDocuments,
  typeText,
  type DocumentFilterState,
  type DocumentSortKey,
  type DocumentViewKey,
} from "@/lib/document-view";
import { activePeopleQuery, projectsQuery } from "@/lib/project-data";
import { teamsQuery } from "@/lib/org-data";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "Tài liệu — CEN WORK" },
      {
        name: "description",
        content:
          "Thư viện tài liệu CEN WORK: quy định, quy trình, hướng dẫn và mẫu biểu theo phạm vi Team và Dự án.",
      },
      { property: "og:title", content: "Tài liệu — CEN WORK" },
      {
        property: "og:description",
        content: "Tra cứu và quản lý tài liệu nội bộ theo đúng phạm vi và quyền truy cập.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const access = useOrgAccess();

  const [view, setView] = React.useState<DocumentViewKey>("overview");
  const [filters, setFilters] = React.useState<DocumentFilterState>(EMPTY_DOCUMENT_FILTERS);
  const [sort, setSort] = React.useState<DocumentSortKey>("updated_desc");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = React.useState<DocumentRow | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const documents = useQuery(documentsQuery());
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

  const rows = documents.data ?? [];
  const filtered = React.useMemo(
    () => sortDocuments(filterDocuments(rows, filters, view, ctx), sort),
    [rows, filters, view, sort, ctx.userId, ctx.role, ctx.leaderTeamId],
  );
  const metrics = React.useMemo(() => buildOverviewMetrics(rows, ctx), [rows, ctx.userId]);

  const teamOptions = (teams.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const projectOptions = (projects.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  const allowedTeams = access.isSystemAdmin
    ? teamOptions
    : teamOptions.filter((t) => (scopeAccess.data?.teamIds ?? []).includes(t.id));
  const allowedProjects = access.isSystemAdmin
    ? projectOptions
    : projectOptions.filter((p) => (scopeAccess.data?.projectIds ?? []).includes(p.id));

  const canCreate =
    Boolean(access.userId) &&
    (access.isSystemAdmin || allowedTeams.length > 0 || allowedProjects.length > 0);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const createMutation = useMutation({
    mutationFn: (input: DocumentDraftInput) => createDocumentDraft(input, access.userId!),
    onSuccess: () => {
      cenToast.success("Đã tạo bản nháp tài liệu.");
      setFormOpen(false);
      setFormError(null);
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: DocumentDraftInput) =>
      updateDocumentDraft(editing!.id, editing!.latestVersion!.id, input),
    onSuccess: () => {
      cenToast.success("Đã lưu bản nháp.");
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      invalidate();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (doc: DocumentRow) => deleteDocumentDraft(doc.id),
    onSuccess: () => {
      cenToast.success("Đã xóa bản nháp.");
      setDeleting(null);
      invalidate();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const openDetail = (doc: DocumentRow) =>
    navigate({ to: "/documents/$documentId", params: { documentId: doc.id } });

  const rowActions = (doc: DocumentRow): RowAction[] => {
    const actions: RowAction[] = [
      { key: "open", label: "Xem chi tiết", onSelect: () => openDetail(doc) },
      {
        key: "source",
        label: "Mở tài liệu nguồn",
        icon: ExternalLink,
        onSelect: () => window.open(doc.source_url, "_blank", "noopener,noreferrer"),
      },
    ];
    if (canManageDocument(doc, ctx) && isDraftDocument(doc)) {
      actions.push({
        key: "edit",
        label: "Sửa bản nháp",
        onSelect: () => {
          setEditing(doc);
          setFormError(null);
          setFormOpen(true);
        },
      });
    }
    if (canDeleteDocument(doc, ctx)) {
      actions.push({
        key: "delete",
        label: "Xóa bản nháp",
        tone: "destructive",
        onSelect: () => setDeleting(doc),
      });
    }
    return actions;
  };

  const columns = [
    {
      id: "name",
      header: "Tên tài liệu",
      className: "min-w-[220px]",
      cell: (doc: DocumentRow) => (
        <button
          type="button"
          className="line-clamp-2 text-left text-body font-medium text-text-primary hover:underline"
          onClick={() => openDetail(doc)}
        >
          {doc.name}
        </button>
      ),
    },
    {
      id: "type",
      header: "Loại",
      className: "w-[120px]",
      cell: (doc: DocumentRow) => <span className="text-caption">{typeText(doc.doc_type)}</span>,
    },
    {
      id: "scope",
      header: "Phạm vi",
      className: "w-[150px]",
      cell: (doc: DocumentRow) => (
        <span className="line-clamp-2 text-caption">{scopeText(doc)}</span>
      ),
    },
    {
      id: "version",
      header: "PB",
      className: "w-[64px]",
      cell: (doc: DocumentRow) => (
        <Badge variant="outline" className="font-normal">
          {doc.latestVersion?.version_label ?? `v${doc.latestVersion?.version_no ?? 1}`}
        </Badge>
      ),
    },
    {
      id: "owner",
      header: "Người phụ trách",
      className: "w-[150px]",
      cell: (doc: DocumentRow) => (
        <span className="line-clamp-1 text-caption">{doc.ownerName ?? "—"}</span>
      ),
    },
    {
      id: "effective",
      header: "Hiệu lực",
      className: "w-[110px]",
      cell: (doc: DocumentRow) => (
        <span className="text-caption">{formatDate(doc.latestVersion?.effective_from)}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "w-[130px]",
      cell: (doc: DocumentRow) => {
        const status = documentStatus(doc);
        return (
          <StatusBadge
            label={DOCUMENT_VERSION_STATUS_LABEL[status]}
            tone={DOCUMENT_STATUS_TONE[status]}
            size="sm"
          />
        );
      },
    },
    {
      id: "warning",
      header: "Cảnh báo",
      className: "w-[90px]",
      cell: (doc: DocumentRow) =>
        doc.latestVersion?.needs_link_review ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex text-state-warning">
                <AlertTriangle className="size-icon-sm" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Tài liệu cần kiểm tra lại đường dẫn</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-caption text-text-muted">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      className: "w-[52px]",
      align: "right" as const,
      cell: (doc: DocumentRow) => <RowActionsMenu actions={rowActions(doc)} />,
    },
  ];

  const listBody = () => {
    if (documents.isError) {
      return (
        <ErrorState
          title="Không tải được danh sách tài liệu"
          description={(documents.error as Error)?.message}
          onRetry={() => void documents.refetch()}
        />
      );
    }
    if (documents.isLoading) {
      return isMobile ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={[]} getRowId={(d) => d.id} loading density="compact" />
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={FileText}
          title={
            hasActiveDocumentFilters(filters)
              ? "Không tìm thấy tài liệu phù hợp"
              : "Chưa có tài liệu trong phạm vi này"
          }
          description={
            hasActiveDocumentFilters(filters)
              ? "Thử xóa bớt bộ lọc hoặc đổi từ khóa tìm kiếm."
              : "Tạo bản nháp đầu tiên để bắt đầu xây dựng thư viện tài liệu."
          }
          {...(canCreate && !hasActiveDocumentFilters(filters)
            ? {
                action: (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormError(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="size-icon-sm" aria-hidden="true" /> Tạo bản nháp
                  </Button>
                ),
              }
            : {})}
        />
      );
    }
    return isMobile ? (
      <DocumentCardList
        documents={filtered}
        onOpen={openDetail}
        renderActions={(doc) => <RowActionsMenu actions={rowActions(doc)} />}
      />
    ) : (
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(d) => d.id}
        density="compact"
        tableClassName="table-fixed w-full"
      />
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Tài liệu"
        description="Tra cứu và quản lý tài liệu nội bộ theo đúng phạm vi bạn được phép truy cập."
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-icon-sm" aria-hidden="true" /> Tạo bản nháp
            </Button>
          ) : null
        }
      />

      <Tabs value={view} onValueChange={(value) => setView(value as DocumentViewKey)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          {DOCUMENT_VIEWS.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {view === "overview" ? (
        <DocumentOverview
          metrics={documents.isLoading ? null : metrics}
          loading={documents.isLoading}
          onOpen={openDetail}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-icon-sm -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Tìm theo tên, mô tả hoặc từ khóa"
                className="pl-9"
                aria-label="Tìm kiếm tài liệu"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(value) => setSort(value as DocumentSortKey)}>
                <SelectTrigger className="w-[190px]" aria-label="Sắp xếp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DocumentFilters
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters(EMPTY_DOCUMENT_FILTERS)}
                teams={teamOptions}
                projects={projectOptions}
                people={people.data ?? []}
              />
            </div>
          </div>

          {listBody()}
        </div>
      )}

      <DocumentFormDrawer
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        document={editing}
        teams={allowedTeams}
        projects={allowedProjects}
        people={people.data ?? []}
        allowSystemScope={access.isSystemAdmin}
        submitting={createMutation.isPending || updateMutation.isPending}
        serverError={formError}
        defaultOwnerId={access.userId}
        onSubmit={(input) => {
          setFormError(null);
          if (editing) updateMutation.mutate(input);
          else createMutation.mutate(input);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        tone="destructive"
        title="Xóa bản nháp tài liệu?"
        description={
          deleting
            ? `"${deleting.name}" sẽ bị xóa vĩnh viễn. Chỉ bản nháp chưa từng gửi duyệt mới xóa được.`
            : undefined
        }
        confirmLabel="Xóa bản nháp"
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
      />
    </div>
  );
}
