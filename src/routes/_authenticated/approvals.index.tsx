import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

import { AnnouncementModuleTabs } from "@/components/announcement/module-tabs";
import { ModuleCreateActions } from "@/components/announcement/module-create-actions";
import { ApprovalFormDrawer } from "@/components/approval/approval-form-drawer";
import { ApprovalDetailModal } from "@/components/approval/approval-detail-modal";
import { ApprovalQuickActions } from "@/components/approval/approval-quick-actions";
import { NapStatsCards } from "@/components/announcement/nap-stats-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
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
  approvalListQuery,
  type ApprovalListItem,
} from "@/lib/approval-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TITLE = "Yêu cầu phê duyệt — CEN WORK";
const DESCRIPTION = "Tạo, theo dõi và xử lý các yêu cầu phê duyệt nội bộ trong CEN WORK.";

export const Route = createFileRoute("/_authenticated/approvals/")({
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

const FILTERS = [
  { value: "all", label: "Tất cả" },
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

function ApprovalCard({
  item,
  senderLabel,
  onOpenDetail,
}: {
  item: ApprovalListItem;
  senderLabel: string;
  onOpenDetail: () => void;
}) {
  const { request } = item;
  const needsAction = item.myDecision?.decision_status === "pending" && item.status !== "withdrawn";
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
              Phê duyệt
            </Badge>
          </span>
          <p className="min-w-0 break-words text-body font-semibold text-text-primary">
            {request.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {needsAction ? <StatusBadge tone="progress" label="Chưa xử lý" /> : null}
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
        <span>Người gửi: {senderLabel}</span>
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
        {needsAction ? <ApprovalQuickActions item={item} /> : null}
      </div>
    </div>
  );
}

function ApprovalsPage() {
  const { user } = useAuth();
  const { can } = useOrgAccess();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const list = useQuery(approvalListQuery(user?.id));

  const filtered = React.useMemo(
    () => (list.data ?? []).filter((item) => status === "all" || item.status === status),
    [list.data, status],
  );

  const rank = (item: ApprovalListItem) => {
    if (item.status === "overdue") return 0;
    if (item.myDecision?.decision_status === "pending" && item.status === "pending") return 1;
    if (item.status === "pending") return 2;
    return 3;
  };
  const ordered = [...filtered].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    if (rank(a) < 3) {
      return new Date(a.request.due_at).getTime() - new Date(b.request.due_at).getTime();
    }
    return new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime();
  });

  const mine = ordered.filter((item) => item.myDecision !== null);
  const inbox = mine.filter((item) => item.myDecision?.decision_status === "pending");
  const history = mine.filter((item) => item.myDecision?.decision_status !== "pending");
  const sent = ordered.filter((item) => item.request.sender_id === user?.id);

  function senderLabel(item: ApprovalListItem) {
    return item.request.sender_id === user?.id ? "Bạn" : "Thành viên khác";
  }

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
      return <EmptyState icon={ClipboardCheck} title="Chưa có yêu cầu" description={emptyText} />;
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {items.map((item) => (
          <ApprovalCard
            key={item.request.id}
            item={item}
            senderLabel={senderLabel(item)}
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
        description="Theo dõi thông báo nội bộ và các yêu cầu cần phê duyệt."
        actions={
          <ModuleCreateActions
            canCreateAnnouncement={can(PERMISSIONS.ANNOUNCEMENTS_CREATE)}
            canCreateApproval={can(PERMISSIONS.APPROVALS_CREATE)}
            onCreateAnnouncement={() => void navigate({ to: "/announcements" })}
            onCreateApproval={() => setCreateOpen(true)}
          />
        }
      >
        <AnnouncementModuleTabs />
      </PageHeader>

      <NapStatsCards scope="approval" onSelect={setStatus} />

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Lọc trạng thái" className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs defaultValue="inbox">
            <TabsList>
              <TabsTrigger value="inbox">
                Cần tôi xử lý{inbox.length ? ` (${inbox.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="history">Đã xử lý / Lịch sử</TabsTrigger>
              <TabsTrigger value="sent">Đã gửi</TabsTrigger>
            </TabsList>
            <TabsContent value="inbox" className="mt-4">
              {renderList(inbox, "Yêu cầu cần bạn phê duyệt sẽ xuất hiện tại đây.")}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              {renderList(history, "Yêu cầu bạn đã xử lý sẽ xuất hiện tại đây.")}
            </TabsContent>
            <TabsContent value="sent" className="mt-4">
              {renderList(sent, "Yêu cầu bạn đã gửi sẽ xuất hiện tại đây.")}
            </TabsContent>
          </Tabs>
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
