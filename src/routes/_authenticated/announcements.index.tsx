import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnnouncementFormDrawer } from "@/components/announcement/announcement-form-drawer";
import { AnnouncementAckCard } from "@/components/announcement/announcement-ack-card";
import { SystemNotificationCard } from "@/components/announcement/system-notification-card";
import { AnnouncementModuleTabs } from "@/components/announcement/module-tabs";
import { ModuleCreateActions } from "@/components/announcement/module-create-actions";
import { ApprovalFormDrawer } from "@/components/approval/approval-form-drawer";
import { NapStatsCards } from "@/components/announcement/nap-stats-cards";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ackStatsQuery,
  ANNOUNCEMENT_STATUS_LABEL,
  inboxQuery,
  myAnnouncementsQuery,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type AnnouncementRow,
  type InboxRow,
} from "@/lib/announcement-data";
import { activeMembersQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQuery,
  type NotificationRow,
} from "@/lib/notification-data";
import {
  internalItem,
  matchesStatusFilter,
  sortByPriority,
  isTodo,
  systemItem,
  type InboxKindFilter,
} from "@/lib/inbox-view";
import { AnnouncementDetailModal } from "@/components/announcement/announcement-detail-modal";

const TITLE = "Thông báo nội bộ — CEN WORK";
const DESCRIPTION =
  "Soạn, phát hành và theo dõi thông báo nội bộ bắt buộc xác nhận trong CEN WORK.";

export const Route = createFileRoute("/_authenticated/announcements/")({
  validateSearch: (search: Record<string, unknown>) => ({
    kind:
      search["kind"] === "internal" || search["kind"] === "system"
        ? (search["kind"] as InboxKindFilter)
        : ("all" as InboxKindFilter),
  }),
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
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = useAuth();
  const { can } = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { kind } = Route.useSearch();
  const [tab, setTab] = React.useState("todo");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AnnouncementRow | null>(null);
  const [openCardId, setOpenCardId] = React.useState<string | null>(null);
  const [detailRow, setDetailRow] = React.useState<InboxRow | null>(null);

  const inbox = useQuery(inboxQuery(user?.id));
  const created = useQuery(myAnnouncementsQuery(user?.id));
  const members = useQuery(activeMembersQuery());
  const notifications = useQuery(notificationsQuery(user?.id, 100));

  function refreshNotifications() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: refreshNotifications,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refreshNotifications,
  });

  const systemRows = React.useMemo(
    () => (notifications.data ?? []) as NotificationRow[],
    [notifications.data],
  );
  const systemUnread = systemRows.filter((row) => !row.read_at).length;

  function setKind(next: InboxKindFilter) {
    setStatus("all");
    void navigate({ to: "/announcements", search: { kind: next } });
  }

  const createdIds = React.useMemo(
    () => (created.data ?? []).filter((row) => row.status === "published").map((row) => row.id),
    [created.data],
  );
  const ackStats = useQuery(ackStatsQuery(createdIds));

  const nameById = React.useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.display_name])),
    [members.data],
  );

  const term = search.trim().toLowerCase();
  const matches = (title: string) => title.toLowerCase().includes(term);

  // Chỉ nghĩa vụ của chính người dùng: RLS cho phép người gửi/quản trị đọc cả bản ghi
  // của người khác, nhưng tab này là lịch sử cá nhân.
  const internalRows = (inbox.data ?? []).filter((row) => row.user_id === user?.id);

  const inboxItems = React.useMemo(() => {
    const items = [
      ...(kind === "system" ? [] : internalRows.map(internalItem)),
      ...(kind === "internal" ? [] : systemRows.map(systemItem)),
    ].filter(
      (item) =>
        (item.title.toLowerCase().includes(term) || item.body.toLowerCase().includes(term)) &&
        matchesStatusFilter(item, kind, status),
    );
    return sortByPriority(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.data, systemRows, kind, status, term, user?.id]);

  const todoItems = inboxItems.filter((item) => isTodo(item));
  const doneItems = inboxItems.filter((item) => !isTodo(item));

  function renderInbox(items: typeof inboxItems, emptyText: string) {
    const loading =
      (inbox.isLoading && kind !== "system") || (notifications.isLoading && kind !== "internal");
    return (
      <>
        {kind !== "system" && inbox.isError ? (
          <ErrorState
            title="Không tải được thông báo nội bộ"
            description="Thử lại để tải thông báo nội bộ của bạn."
            onRetry={() => void inbox.refetch()}
          />
        ) : null}
        {kind !== "internal" && notifications.isError ? (
          <ErrorState
            title="Không tải được thông báo hệ thống"
            description="Thử lại để tải thông báo hệ thống của bạn."
            onRetry={() => void notifications.refetch()}
          />
        ) : null}

        {loading ? (
          <SkeletonCard lines={3} />
        ) : items.length === 0 ? (
          <EmptyState title="Chưa có thông báo" description={emptyText} />
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            {items.map((item) =>
              item.source === "internal" ? (
                <AnnouncementAckCard
                  key={item.key}
                  row={item.original as InboxRow}
                  showSourceBadge
                  senderName={
                    nameById.get((item.original as InboxRow).announcement.created_by) ?? "—"
                  }
                  open={openCardId === item.key}
                  onOpenChange={(next) => setOpenCardId(next ? item.key : null)}
                  onOpenDetail={() => setDetailRow(item.original as InboxRow)}
                />
              ) : (
                <SystemNotificationCard
                  key={item.key}
                  row={item.original as NotificationRow}
                  pending={markOne.isPending && markOne.variables === item.id}
                  onRead={(id) => markOne.mutate(id)}
                />
              ),
            )}
          </div>
        )}
      </>
    );
  }

  const createdRows = (created.data ?? []).filter(
    (row) => matches(row.title) && (status === "all" || row.status === status),
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Thông báo & Phê duyệt"
        description="Theo dõi thông báo nội bộ và các yêu cầu cần phê duyệt."
        actions={
          <ModuleCreateActions
            canCreateAnnouncement={can(PERMISSIONS.ANNOUNCEMENTS_CREATE)}
            canCreateApproval={can(PERMISSIONS.APPROVALS_CREATE)}
            onCreateAnnouncement={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
            onCreateApproval={() => setApprovalOpen(true)}
          />
        }
      >
        <AnnouncementModuleTabs />
      </PageHeader>

      <NapStatsCards
        scope="announcement"
        onSelect={(filter) => {
          setTab(filter === "completed" || filter === "done" ? "done" : "todo");
          setStatus(filter);
        }}
      />

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {tab !== "created" ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {(
                [
                  ["all", "Tất cả"],
                  ["internal", "Nội bộ"],
                  ["system", "Hệ thống"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={kind === value ? "primary" : "secondary"}
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {label}
                  {value === "system" && systemUnread > 0 ? ` (${systemUnread})` : ""}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ms-auto"
                disabled={systemUnread === 0 || markAll.isPending}
                loading={markAll.isPending}
                onClick={() => markAll.mutate()}
              >
                <CheckCheck />
                Đánh dấu thông báo hệ thống đã đọc tất cả
              </Button>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <Input
              value={search}
              placeholder="Tìm theo tiêu đề hoặc nội dung"
              aria-label="Tìm theo tiêu đề hoặc nội dung"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Lọc trạng thái" className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {tab !== "created" && kind === "internal" ? (
                  <>
                    <SelectItem value="unread">Chưa đọc</SelectItem>
                    <SelectItem value="reading">Đang đọc</SelectItem>
                    <SelectItem value="completed">Đã hoàn thành</SelectItem>
                    <SelectItem value="overdue">Quá hạn</SelectItem>
                    <SelectItem value="exempt">Miễn hoàn thành</SelectItem>
                  </>
                ) : tab !== "created" && kind === "system" ? (
                  <>
                    <SelectItem value="unread">Chưa đọc</SelectItem>
                    <SelectItem value="read">Đã đọc</SelectItem>
                  </>
                ) : tab !== "created" ? (
                  <>
                    <SelectItem value="todo">Cần xử lý</SelectItem>
                    <SelectItem value="done">Đã xử lý</SelectItem>
                    <SelectItem value="overdue">Quá hạn</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="draft">Nháp</SelectItem>
                    <SelectItem value="published">Đã phát hành</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setStatus("all");
            }}
          >
            <TabsList>
              <TabsTrigger value="todo">Cần tôi xử lý{todoItems.length ? ` (${todoItems.length})` : ""}</TabsTrigger>
              <TabsTrigger value="done">Đã xử lý / Lịch sử</TabsTrigger>
              <TabsTrigger value="created">Đã gửi</TabsTrigger>
            </TabsList>

            <TabsContent value="todo" className="mt-4">
              {renderInbox(todoItems, "Bạn không còn thông báo nào cần xử lý.")}
            </TabsContent>

            <TabsContent value="done" className="mt-4">
              {renderInbox(doneItems, "Thông báo bạn đã xử lý sẽ xuất hiện tại đây.")}
            </TabsContent>

            <TabsContent value="created" className="mt-4">
              <DataTable<AnnouncementRow>
                data={createdRows}
                getRowId={(row) => row.id}
                loading={created.isLoading}
                error={created.isError}
                onRetry={() => void created.refetch()}
                emptyTitle="Chưa có thông báo nào"
                emptyDescription="Bản nháp và thông báo đã phát hành của bạn sẽ hiển thị tại đây."
                columns={[
                  {
                    id: "title",
                    header: "Tiêu đề",
                    className: "min-w-[220px]",
                    cell: (row) => (
                      <Link
                        to="/announcements/$announcementId"
                        params={{ announcementId: row.id }}
                        className="break-words font-medium text-text-primary underline-offset-2 hover:underline"
                      >
                        {row.title || "(Chưa có tiêu đề)"}
                      </Link>
                    ),
                  },
                  {
                    id: "status",
                    header: "Trạng thái",
                    className: "min-w-[140px]",
                    cell: (row) => (
                      <StatusBadge
                        tone={row.status === "published" ? "success" : "neutral"}
                        label={ANNOUNCEMENT_STATUS_LABEL[row.status]}
                      />
                    ),
                  },
                  {
                    id: "ack",
                    header: "Đã xác nhận",
                    className: "min-w-[150px]",
                    cell: (row) => {
                      if (row.status !== "published") return "—";
                      const stat = ackStats.data?.[row.id];
                      if (!stat) return "—";
                      return (
                        <span className="text-body-sm text-text-primary">
                          {stat.completed}/{stat.total}
                          {stat.overdue > 0 ? (
                            <span className="text-state-danger"> • {stat.overdue} quá hạn</span>
                          ) : null}
                        </span>
                      );
                    },
                  },
                  {
                    id: "due",
                    header: "Hạn xác nhận",
                    className: "min-w-[160px]",
                    cell: (row) => (row.due_at ? formatHanoiDateTime(row.due_at) : "—"),
                  },

                  {
                    id: "action",
                    header: "",
                    className: "min-w-[110px]",
                    cell: (row) =>
                      row.status === "draft" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          Sửa nháp
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AnnouncementFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        announcement={editing}
      />

      <ApprovalFormDrawer open={approvalOpen} onOpenChange={setApprovalOpen} />

      <AnnouncementDetailModal
        row={detailRow}
        senderName={detailRow ? (nameById.get(detailRow.announcement.created_by) ?? "—") : "—"}
        open={Boolean(detailRow)}
        onOpenChange={(next) => {
          if (!next) setDetailRow(null);
        }}
      />
    </div>
  );
}
