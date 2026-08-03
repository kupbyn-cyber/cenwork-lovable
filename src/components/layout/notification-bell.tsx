import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQuery,
  unreadCountQuery,
  type NotificationRow,
} from "@/lib/notification-data";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — M5 chuông thông báo.
 * Dữ liệu thật theo người đăng nhập; RLS đảm bảo chỉ thấy thông báo của mình.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);

  const unread = useQuery(unreadCountQuery(user?.id));
  const list = useQuery({ ...notificationsQuery(user?.id, 8), enabled: Boolean(user?.id) && open });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
  });

  const count = unread.data ?? 0;
  const badge = count > 99 ? "99+" : String(count);

  function openNotification(row: NotificationRow) {
    if (!row.read_at) markOne.mutate(row.id);
    setOpen(false);
    if (row.link) void navigate({ to: row.link });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <span className="relative inline-flex">
          <IconButton
            variant="ghost"
            size="icon"
            type="button"
            label={count > 0 ? `Thông báo — ${badge} chưa đọc` : "Thông báo"}
          >
            <Bell />
          </IconButton>
          {count > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-state-danger px-1 text-[10px] leading-4 font-semibold text-text-inverse"
            >
              {badge}
            </span>
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[20rem] max-w-[92vw]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span className="text-label font-semibold text-text-primary">Thông báo</span>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={count === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck />
            Đọc hết
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {list.isLoading ? (
          <p className="px-2 py-4 text-body-sm text-text-muted">Đang tải…</p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="px-2 py-4 text-body-sm text-text-muted">Chưa có thông báo nào.</p>
        ) : (
          (list.data ?? []).map((row) => (
            <DropdownMenuItem
              key={row.id}
              className="flex-col items-start gap-0.5"
              onSelect={() => openNotification(row)}
            >
              <span
                className={cn(
                  "w-full truncate text-label",
                  row.read_at ? "text-text-secondary" : "font-semibold text-text-primary",
                )}
              >
                {row.title}
              </span>
              {row.body ? (
                <span className="w-full truncate text-caption text-text-muted">{row.body}</span>
              ) : null}
              <span className="text-caption text-text-muted">
                {formatHanoiDateTime(row.created_at)}
              </span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            void navigate({ to: "/announcements", search: { kind: "system" } });
          }}
        >
          Xem tất cả thông báo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
