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
import { useAuth } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ANNOUNCEMENT_STATUS_LABEL,
  effectiveRecipientStatus,
  inboxQuery,
  myAnnouncementsQuery,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type AnnouncementRow,
  type InboxRow,
} from "@/lib/announcement-data";
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
  const [editing, setEditing] = React.useState<AnnouncementRow | null>(null);

  const inbox = useQuery(inboxQuery(user?.id));
  const created = useQuery(myAnnouncementsQuery(user?.id));

  const matches = (title: string) =>
    title.toLowerCase().includes(search.trim().toLowerCase());

  const inboxRows = (inbox.data ?? []).filter(
    (row) =>
      matches(row.announcement.title) &&
      (status === "all" || effectiveRecipientStatus(row) === status),
  );

  const createdRows = (created.data ?? []).filter(
    (row) => matches(row.title) && (status === "all" || row.status === status),
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Thông báo nội bộ"
        description="Thông báo do người dùng chủ động soạn và yêu cầu người nhận xác nhận."
        actions={
          can(PERMISSIONS.ANNOUNCEMENTS_CREATE) ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              <Plus />
              Soạn thông báo
            </Button>
          ) : null
        }
      />

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
              <TabsTrigger value="inbox">Tôi nhận</TabsTrigger>
              <TabsTrigger value="created">Tôi đã tạo</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="mt-4">
              <DataTable<InboxRow>
                data={inboxRows}
                getRowId={(row) => row.id}
                loading={inbox.isLoading}
                error={inbox.isError}
                onRetry={() => void inbox.refetch()}
                emptyTitle="Chưa có thông báo"
                emptyDescription="Thông báo gửi tới bạn sẽ xuất hiện tại đây."
                columns={[
                  {
                    id: "title",
                    header: "Tiêu đề",
                    className: "min-w-[220px]",
                    cell: (row) => (
                      <Link
                        to="/announcements/$announcementId"
                        params={{ announcementId: row.announcement_id }}
                        className="break-words font-medium text-text-primary underline-offset-2 hover:underline"
                      >
                        {row.announcement.title}
                      </Link>
                    ),
                  },
                  {
                    id: "status",
                    header: "Trạng thái",
                    className: "min-w-[140px]",
                    cell: (row) => {
                      const value = effectiveRecipientStatus(row);
                      return (
                        <StatusBadge
                          tone={RECIPIENT_STATUS_TONE[value]}
                          label={RECIPIENT_STATUS_LABEL[value]}
                        />
                      );
                    },
                  },
                  {
                    id: "due",
                    header: "Hạn xác nhận",
                    className: "min-w-[160px]",
                    cell: (row) => formatHanoiDateTime(row.due_at),
                  },
                  {
                    id: "published",
                    header: "Phát hành",
                    className: "min-w-[160px]",
                    cell: (row) => formatHanoiDateTime(row.announcement.published_at),
                  },
                ]}
              />
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
    </div>
  );
}
