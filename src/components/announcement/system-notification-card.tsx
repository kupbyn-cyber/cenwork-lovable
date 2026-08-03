import { useNavigate } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatHanoiDateTime } from "@/lib/datetime";
import { notificationEventLabel, type NotificationRow } from "@/lib/notification-data";
import { cn } from "@/lib/utils";

/**
 * NOTIFY-UX-01 — card thông báo hệ thống trong hộp thư chung.
 * Chỉ đọc + điều hướng; không có xác nhận bắt buộc.
 */
interface Props {
  row: NotificationRow;
  pending?: boolean;
  onRead: (id: string) => void;
}

export function SystemNotificationCard({ row, pending, onRead }: Props) {
  const navigate = useNavigate();

  return (
    <Card className={cn("min-w-0", row.read_at ? null : "border-border-strong")}>
      <CardContent className="pt-(--card-pad)">
        <button
          type="button"
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={() => {
            if (pending) return;
            if (!row.read_at) onRead(row.id);
            if (row.link) void navigate({ to: row.link });
          }}
          className="cen-transition flex w-full min-w-0 flex-col gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-progress disabled:opacity-70"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge size="sm" variant="outline">
              Hệ thống
            </Badge>
            <Badge size="sm" variant={row.read_at ? "neutral" : "info"}>
              {notificationEventLabel(row.event_type)}
            </Badge>
            <Badge size="sm" variant={row.read_at ? "neutral" : "brand-subtle"}>
              {row.read_at ? "Đã đọc" : "Chưa đọc"}
            </Badge>
          </span>
          <span
            className={cn(
              "min-w-0 break-words text-body",
              row.read_at ? "text-text-secondary" : "font-semibold text-text-primary",
            )}
          >
            {row.title}
          </span>
          {row.body ? (
            <span className="min-w-0 break-words text-helper text-text-muted">{row.body}</span>
          ) : null}
          <span className="text-caption text-text-muted">
            {formatHanoiDateTime(row.created_at)}
          </span>
        </button>
      </CardContent>
    </Card>
  );
}
