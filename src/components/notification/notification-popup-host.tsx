import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ClipboardCheck,
  FileText,
  Megaphone,
  Sparkles,
  Stamp,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotificationPopups } from "@/hooks/use-notification-popups";
import {
  markNotificationRead,
  notificationEventLabel,
  type NotificationRow,
} from "@/lib/notification-data";

/**
 * NOTIFY-POPUP-01 — lớp popup nổi góc trên bên phải.
 * Dùng chung bản ghi notification với Notification Center; popup xuất hiện hay
 * biến mất đều KHÔNG đổi trạng thái đã đọc. Chỉ hành động "Xem chi tiết" mới
 * gọi đúng cơ chế mark-as-read hiện có.
 */
const AUTO_DISMISS_MS = 7000;

function iconFor(eventType: string): LucideIcon {
  if (eventType.startsWith("task.")) return ClipboardCheck;
  if (eventType.startsWith("report.")) return FileText;
  if (eventType.startsWith("approval.")) return Stamp;
  if (eventType.startsWith("announcement.")) return Megaphone;
  if (eventType.startsWith("recognition.")) return Sparkles;
  return Bell;
}

function PopupCard({
  row,
  onOpen,
  onClose,
}: {
  row: NotificationRow;
  onOpen: (row: NotificationRow) => void;
  onClose: (id: string) => void;
}) {
  const [paused, setPaused] = React.useState(false);
  const Icon = iconFor(row.event_type);

  React.useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onClose(row.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [paused, row.id, onClose]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="cen-popup-in pointer-events-auto w-full overflow-hidden rounded-card border border-border-default bg-surface/85 shadow-lg backdrop-blur-md"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 p-3">
        <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-control border border-border-default bg-surface-subtle text-text-secondary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-caption font-medium text-text-muted">
            {notificationEventLabel(row.event_type)}
          </p>
          <p className="mt-0.5 line-clamp-2 text-label font-semibold text-text-primary">
            {row.title}
          </p>
          {row.body ? (
            <p className="mt-0.5 line-clamp-2 text-caption text-text-secondary">{row.body}</p>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="mt-1 -ml-2"
            onClick={() => onOpen(row)}
          >
            Xem chi tiết
          </Button>
        </div>
        <IconButton
          variant="ghost"
          size="icon-sm"
          type="button"
          label="Đóng thông báo"
          onClick={() => onClose(row.id)}
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}

export function NotificationPopupHost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { items, dismiss, dismissAll } = useNotificationPopups();

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const limit = isMobile ? 1 : 3;
  const visible = items.slice(-limit);
  const hidden = items.length - visible.length;

  function openNotification(row: NotificationRow) {
    if (!row.read_at) markRead.mutate(row.id);
    dismiss(row.id);
    // Tái sử dụng đúng mapping route của Notification Center; không có đích hợp
    // lệ thì mở hộp thư thay vì điều hướng sai.
    if (row.link) void navigate({ to: row.link });
    else void navigate({ to: "/announcements", search: { kind: "system" } });
  }

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-16 right-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4"
    >
      {visible.map((item) => (
        <PopupCard key={item.row.id} row={item.row} onOpen={openNotification} onClose={dismiss} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => {
            dismissAll();
            void navigate({ to: "/announcements", search: { kind: "system" } });
          }}
          className="cen-transition pointer-events-auto w-full rounded-card border border-border-default bg-surface/85 px-3 py-2 text-left text-caption font-medium text-text-secondary shadow-lg backdrop-blur-md hover:text-text-primary"
        >
          Bạn có thêm {hidden} thông báo mới
        </button>
      ) : null}
    </div>
  );
}
