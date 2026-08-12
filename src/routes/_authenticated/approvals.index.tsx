import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";

import { AnnouncementModuleTabs } from "@/components/announcement/module-tabs";
import { ModuleCreateActions } from "@/components/announcement/module-create-actions";
import { ApprovalFormDrawer } from "@/components/approval/approval-form-drawer";
import { ApprovalDetailModal } from "@/components/approval/approval-detail-modal";
import { ApprovalQuickActions } from "@/components/approval/approval-quick-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  APPROVAL_MODE_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_TONE,
  approvalDirectoryQuery,
  approvalListQuery,
  type ApprovalListItem,
} from "@/lib/approval-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * NAP-UI-11 — hai góc nhìn UI trên cùng dữ liệu Approval hiện có:
 * - view=proposal (Đề xuất): request do chính người dùng gửi.
 * - view=approval (Phê duyệt, mặc định): request người dùng cần/đã xử lý.
 * Không đổi schema, workflow, quyền hay server function.
 */
type ApprovalView = "proposal" | "approval";

const TAB_PANEL_CLASS =
  "mt-4 flex min-h-[260px] min-w-0 flex-col sm:min-h-[320px] lg:min-h-[420px]";

const TITLE = "Đề xuất & Phê duyệt — CEN WORK";
const DESCRIPTION = "Tạo, theo dõi và xử lý các yêu cầu phê duyệt nội bộ trong CEN WORK.";
const SUBTITLE = "Theo dõi thông báo nội bộ, các đề xuất bạn đã gửi và các yêu cầu cần phê duyệt.";

export const Route = createFileRoute("/_authenticated/approvals/")({
  validateSearch: (search: Record<string, unknown>): { view?: ApprovalView } =>
    search["view"] === "proposal" ? { view: "proposal" } : {},
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalsPage,
});

const STATUS_FILTERS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "overdue", label: "Quá hạn" },
  { value: "approved", label: "Đã phê duyệt" },
  { value: "rejected", label: "Đã từ chối" },
  { value: "withdrawn", label: "Đã thu hồi" },
];

function preview(text: string) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}…` : clean;
}

function CountCards({
  items,
}: {
  items: { key: string; label: string; value: number; tone?: "danger" }[];
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.key}>
          <CardContent className="flex min-w-0 flex-col gap-1 p-4">
            <span className="break-words text-helper text-text-muted">{item.label}</span>
            <span
              className={cn(
                "text-heading-md font-semibold",
                item.tone === "danger" && item.value > 0
                  ? "text-state-danger"
                  : "text-text-primary",
              )}
            >
              {item.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function nameList(ids: string[], names: Map<string, string>) {
  if (ids.length === 0) return "—";
  const first = names.get(ids[0]!) ?? "Thành viên khác";
  return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
}

function ApprovalCard({
  item,
  variant,
  names,
  onOpenDetail,
}: {
  item: ApprovalListItem;
  variant: ApprovalView;
  names: Map<string, string>;
  onOpenDetail: () => void;
}) {
  const { request } = item;
  const needsAction = item.myDecision?.decision_status === "pending" && item.status !== "withdrawn";
  const approverIds = item.decisions
    .filter((decision) => decision.decision_status !== "replaced")
    .map((decision) => decision.approver_id);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-4",
        item.status === "overdue" ? "border-state-danger/50" : null,
        needsAction && item.status !== "overdue" ? "border-border-strong" : null,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex">
            <Badge size="sm" variant="outline">
              {variant === "proposal" ? "Đề xuất" : "Phê duyệt"}
            </Badge>
          </span>
          <p className="min-w-0 break-words text-body font-semibold text-text-primary">
            {request.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {variant === "approval" && needsAction ? (
            <StatusBadge tone="progress" label="Chưa xử lý" />
          ) : null}
          <StatusBadge
            tone={APPROVAL_STATUS_TONE[item.status]}
            label={APPROVAL_STATUS_LABEL[item.status]}
          />
        </div>
      </div>
      <p className="line-clamp-2 min-w-0 break-words text-helper text-text-muted">
        {preview(request.content)}
      </p>
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-helper text-text-muted">
        {variant === "proposal" ? (
          <span>Người duyệt: {nameList(approverIds, names)}</span>
        ) : (
          <span>Người gửi: {names.get(request.sender_id) ?? "Thành viên khác"}</span>
        )}
        <span>{APPROVAL_MODE_LABEL[request.approval_mode]}</span>
        <span>
          Tiến độ: {item.approvedCount}/{item.totalCount} đồng ý
        </span>
        <span>Gửi: {formatHanoiDateTime(request.created_at)}</span>
        <span>Hạn: {formatHanoiDateTime(request.due_at)}</span>
        <span>Phiên bản V{request.current_version}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onOpenDetail}>
          Xem chi tiết
        </Button>
        {variant === "approval" && needsAction ? <ApprovalQuickActions item={item} /> : null}
      </div>
    </div>
  );
}

function ApprovalsPage() {
  const { view: rawView } = Route.useSearch();
  const view: ApprovalView = rawView === "proposal" ? "proposal" : "approval";
  const { user } = useAuth();
  const { can } = useOrgAccess();
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [approverId, setApproverId] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const list = useQuery(approvalListQuery(user?.id));
  const directory = useQuery(approvalDirectoryQuery());

  const names = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of directory.data ?? []) map.set(row.id, row.display_name);
    if (user?.id) map.set(user.id, "Bạn");
    return map;
  }, [directory.data, user?.id]);

  const rank = (item: ApprovalListItem) => {
    if (item.status === "overdue") return 0;
    if (item.myDecision?.decision_status === "pending" && item.status === "pending") return 1;
    if (item.status === "pending") return 2;
    return 3;
  };
  const ordered = React.useMemo(() => {
    return [...(list.data ?? [])].sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      if (rank(a) < 3) {
        return new Date(a.request.due_at).getTime() - new Date(b.request.due_at).getTime();
      }
      return new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime();
    });
  }, [list.data]);

  const isProposal = view === "proposal";

  /** Nguồn dữ liệu theo góc nhìn: người gửi vs người xử lý. */
  const scoped = React.useMemo(
    () =>
      isProposal
        ? ordered.filter((item) => item.request.sender_id === user?.id)
        : ordered.filter((item) => item.myDecision !== null),
    [ordered, isProposal, user?.id],
  );

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return scoped.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (keyword) {
        const haystack = `${item.request.title} ${item.request.content}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (isProposal && approverId !== "all") {
        const hit = item.decisions.some(
          (decision) =>
            decision.approver_id === approverId && decision.decision_status !== "replaced",
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [scoped, status, search, approverId, isProposal]);

  // Đề xuất: Đang chờ / Đã xử lý.
  const proposalOpen = filtered.filter(
    (item) => item.status === "pending" || item.status === "overdue",
  );
  const proposalDone = filtered.filter(
    (item) => item.status !== "pending" && item.status !== "overdue",
  );

  // Phê duyệt: Cần tôi xử lý / Đã xử lý.
  const inbox = filtered.filter(
    (item) => item.myDecision?.decision_status === "pending" && item.status !== "withdrawn",
  );
  const history = filtered.filter((item) => item.myDecision?.decision_status !== "pending");

  const proposalStats = React.useMemo(() => {
    const count = (predicate: (item: ApprovalListItem) => boolean) =>
      scoped.filter(predicate).length;
    return [
      { key: "pending", label: "Đang chờ", value: count((item) => item.status === "pending") },
      {
        key: "overdue",
        label: "Quá hạn",
        value: count((item) => item.status === "overdue"),
        tone: "danger" as const,
      },
      { key: "approved", label: "Đã duyệt", value: count((item) => item.status === "approved") },
      { key: "rejected", label: "Đã từ chối", value: count((item) => item.status === "rejected") },
    ];
  }, [scoped]);

  const approvalStats = React.useMemo(() => {
    const pendingMine = scoped.filter(
      (item) => item.myDecision?.decision_status === "pending" && item.status !== "withdrawn",
    );
    return [
      { key: "todo", label: "Cần tôi xử lý", value: pendingMine.length },
      {
        key: "overdue",
        label: "Quá hạn",
        value: pendingMine.filter((item) => item.status === "overdue").length,
        tone: "danger" as const,
      },
      {
        key: "done",
        label: "Đã xử lý",
        value: scoped.filter((item) => item.myDecision?.decision_status !== "pending").length,
      },
    ];
  }, [scoped]);

  function renderList(items: ApprovalListItem[], emptyText: string) {
    if (list.isLoading) return <SkeletonCard lines={3} />;
    if (list.isError)
      return (
        <ErrorState
          title="Không tải được danh sách phê duyệt"
          description="Thử lại để tải các yêu cầu phê duyệt."
          onRetry={() => void list.refetch()}
        />
      );
    if (items.length === 0)
      return (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState icon={ClipboardCheck} title="Chưa có yêu cầu" description={emptyText} />
        </div>
      );
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {items.map((item) => (
          <ApprovalCard
            key={item.request.id}
            item={item}
            variant={view}
            names={names}
            onOpenDetail={() => setDetailId(item.request.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Thông báo & Phê duyệt"
        description={SUBTITLE}
        actions={
          <ModuleCreateActions
            context={isProposal ? "proposal" : "approval"}
            canCreate={can(PERMISSIONS.APPROVALS_CREATE)}
            onCreate={() => setCreateOpen(true)}
          />
        }
      >
        <AnnouncementModuleTabs />
      </PageHeader>

      <CountCards items={isProposal ? proposalStats : approvalStats} />

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tiêu đề hoặc nội dung"
              aria-label="Tìm kiếm yêu cầu"
              className="w-full sm:w-[260px]"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Lọc trạng thái" className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isProposal ? (
              <Select value={approverId} onValueChange={setApproverId}>
                <SelectTrigger aria-label="Lọc người duyệt" className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Người duyệt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả người duyệt</SelectItem>
                  {(directory.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {isProposal ? (
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">Tất cả</TabsTrigger>
                <TabsTrigger value="open">
                  Đang chờ{proposalOpen.length ? ` (${proposalOpen.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="done">Đã xử lý</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className={TAB_PANEL_CLASS}>
                {renderList(filtered, "Đề xuất bạn gửi sẽ xuất hiện tại đây.")}
              </TabsContent>
              <TabsContent value="open" className={TAB_PANEL_CLASS}>
                {renderList(proposalOpen, "Không có đề xuất đang chờ xử lý.")}
              </TabsContent>
              <TabsContent value="done" className={TAB_PANEL_CLASS}>
                {renderList(proposalDone, "Đề xuất đã được xử lý sẽ xuất hiện tại đây.")}
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs defaultValue="inbox">
              <TabsList>
                <TabsTrigger value="inbox">
                  Cần tôi xử lý{inbox.length ? ` (${inbox.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="history">Đã xử lý / Lịch sử</TabsTrigger>
              </TabsList>
              <TabsContent value="inbox" className={TAB_PANEL_CLASS}>
                {renderList(inbox, "Yêu cầu cần bạn phê duyệt sẽ xuất hiện tại đây.")}
              </TabsContent>
              <TabsContent value="history" className={TAB_PANEL_CLASS}>
                {renderList(history, "Yêu cầu bạn đã xử lý sẽ xuất hiện tại đây.")}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ApprovalFormDrawer open={createOpen} onOpenChange={setCreateOpen} />

      <ApprovalDetailModal
        approvalId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(next) => {
          if (!next) setDetailId(null);
        }}
      />
    </div>
  );
}
