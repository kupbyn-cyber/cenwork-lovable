import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

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
import { AnnouncementModuleTabs } from "@/components/announcement/module-tabs";
import { ModuleCreateActions } from "@/components/announcement/module-create-actions";
import { ApprovalFormDrawer } from "@/components/approval/approval-form-drawer";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ackStatsQuery,
  ANNOUNCEMENT_STATUS_LABEL,
  effectiveRecipientStatus,
  inboxQuery,
  myAnnouncementsQuery,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type AnnouncementRow,
  type InboxRow,
} from "@/lib/announcement-data";
import { membersQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";

const TITLE = "Thông báo nội bộ — CEN WORK";
const DESCRIPTION =
  "Soạn, phát hành và theo dõi thông báo nội bộ bắt buộc xác nhận trong CEN WORK.";

export const Route = createFileRoute("/_authenticated/announcements/")({
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
  const [tab, setTab] = React.useState("inbox");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AnnouncementRow | null>(null);
  const [openCardId, setOpenCardId] = React.useState<string | null>(null);

  const inbox = useQuery(inboxQuery(user?.id));
  const created = useQuery(myAnnouncementsQuery(user?.id));
  const members = useQuery(membersQuery());

  const createdIds = React.useMemo(
    () => (created.data ?? []).filter((row) => row.status === "published").map((row) => row.id),
    [created.data],
  );
  const ackStats = useQuery(ackStatsQuery(createdIds));

  const nameById = React.useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.display_name])),
    [members.data],
  );

  const matches = (title: string) => title.toLowerCase().includes(search.trim().toLowerCase());

  // Chỉ nghĩa vụ của chính người dùng: RLS cho phép người gửi/quản trị đọc cả bản ghi
  // của người khác, nhưng tab này là lịch sử cá nhân.
  const inboxRows = (inbox.data ?? []).filter(
    (row) =>
      row.user_id === user?.id &&
      matches(row.announcement.title) &&
      (status === "all" || effectiveRecipientStatus(row) === status),
  );

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


      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <Input
              value={search}
              placeholder="Tìm theo tiêu đề"
              aria-label="Tìm theo tiêu đề"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Lọc trạng thái" className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {tab === "inbox" ? (
                  <>
                    <SelectItem value="unread">Chưa đọc</SelectItem>
                    <SelectItem value="reading">Đang đọc</SelectItem>
                    <SelectItem value="completed">Đã hoàn thành</SelectItem>
                    <SelectItem value="overdue">Quá hạn</SelectItem>
                    <SelectItem value="exempt">Miễn hoàn thành</SelectItem>
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
              <TabsTrigger value="inbox">Thông báo của tôi</TabsTrigger>
              <TabsTrigger value="created">Thông báo đã gửi</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="mt-4">
              {inbox.isLoading ? (
                <SkeletonCard lines={3} />
              ) : inbox.isError ? (
                <ErrorState
                  title="Không tải được thông báo"
                  description="Thử lại để tải danh sách thông báo của bạn."
                  onRetry={() => void inbox.refetch()}
                />
              ) : inboxRows.length === 0 ? (
                <EmptyState
                  title="Chưa có thông báo"
                  description="Thông báo gửi tới bạn sẽ xuất hiện tại đây."
                />
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {inboxRows.map((row) => (
                    <AnnouncementAckCard
                      key={row.id}
                      row={row}
                      senderName={nameById.get(row.announcement.created_by) ?? "—"}
                      open={openCardId === row.id}
                      onOpenChange={(next) => setOpenCardId(next ? row.id : null)}
                    />
                  ))}
                </div>
              )}
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
    </div>
  );
}
