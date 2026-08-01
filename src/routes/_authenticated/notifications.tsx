import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useFlashHighlight } from "@/hooks/use-flash-highlight";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationEventLabel,
  notificationsQuery,
} from "@/lib/notification-data";
import { cn } from "@/lib/utils";

const TITLE = "Thông báo — CEN WORK";
const DESCRIPTION =
  "Danh sách thông báo cá nhân trong CEN WORK: công việc, báo cáo và dự án liên quan tới bạn.";

export const Route = createFileRoute("/_authenticated/notifications")({
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
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  const list = useQuery(notificationsQuery(user?.id, 100));

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const { flash, isFlashing, flashKey } = useFlashHighlight();

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (_data, id) => {
      refresh();
      flash(id);
    },
  });
  const pendingId = markOne.isPending ? markOne.variables : null;
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh });

  const rows = (list.data ?? []).filter((row) => (filter === "unread" ? !row.read_at : true));
  const unreadCount = (list.data ?? []).filter((row) => !row.read_at).length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Thông báo"
        description="Thông báo được tạo tự động khi có thay đổi liên quan tới bạn."
        actions={
          <Button
            variant="secondary"
            type="button"
            disabled={unreadCount === 0 || markAll.isPending}
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck />
            Đánh dấu đã đọc tất cả
          </Button>
        }
      />

      <Card>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={(value) => setFilter(value as "all" | "unread")}>
              <SelectTrigger aria-label="Lọc thông báo" className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="unread">Chưa đọc</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-body-sm text-text-muted">{unreadCount} thông báo chưa đọc</span>
          </div>

          {list.isError ? (
            <ErrorState
              title="Không tải được thông báo"
              description="Vui lòng thử lại."
              onRetry={() => void list.refetch()}
            />
          ) : list.isLoading ? (
            <ul className="flex min-w-0 flex-col gap-2" aria-busy="true">
              {[0, 1, 2, 3].map((index) => (
                <li key={index}>
                  <Skeleton className="h-[86px] w-full rounded-control" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Không có thông báo"
              description="Thông báo mới sẽ xuất hiện tại đây."
            />
          ) : (
            <ul className="flex min-w-0 flex-col gap-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    key={`${row.id}-${flashKey(row.id)}`}
                    aria-busy={pendingId === row.id || undefined}
                    disabled={pendingId === row.id}
                    onClick={() => {
                      if (pendingId) return;
                      if (!row.read_at) markOne.mutate(row.id);
                      if (row.link) void navigate({ to: row.link });
                    }}
                    className={cn(
                      "cen-transition cen-press-subtle flex w-full min-w-0 flex-col gap-1 rounded-control border p-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-progress disabled:opacity-70",
                      isFlashing(row.id) && "cen-flash",
                      row.read_at
                        ? "border-border-default bg-surface"
                        : "border-border-strong bg-surface-raised",
                    )}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 break-words text-label",
                          row.read_at ? "text-text-secondary" : "font-semibold text-text-primary",
                        )}
                      >
                        {row.title}
                      </span>
                      <Badge size="sm" variant={row.read_at ? "neutral" : "info"}>
                        {notificationEventLabel(row.event_type)}
                      </Badge>
                    </span>
                    {row.body ? (
                      <span className="min-w-0 break-words text-body-sm text-text-secondary">
                        {row.body}
                      </span>
                    ) : null}
                    <span className="text-caption text-text-muted">
                      {formatHanoiDateTime(row.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
