import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AnnouncementAckCard } from "@/components/announcement/announcement-ack-card";
import { usePendingAnnouncements } from "@/hooks/use-pending-announcements";
import { effectiveRecipientStatus } from "@/lib/announcement-data";
import { membersQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — thanh nhắc thông báo bắt buộc chưa xác nhận, hiển thị dưới Top Bar.
 * Chỉ hiển thị khi còn nghĩa vụ xác nhận; không cho đóng vĩnh viễn, chỉ thu gọn tạm thời.
 * Mở thanh hoặc mở nội dung KHÔNG tự xác nhận.
 */
export function AnnouncementReminderBar() {
  const navigate = useNavigate();
  const { pending } = usePendingAnnouncements();
  const members = useQuery(membersQuery());
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  const top = pending[0] ?? null;
  const activeRow = pending.find((row) => row.id === openId) ?? null;

  React.useEffect(() => {
    if (openId && !pending.some((row) => row.id === openId)) setOpenId(null);
  }, [pending, openId]);

  if (!top) return null;

  const senderName =
    (members.data ?? []).find((member) => member.id === top.announcement.created_by)
      ?.display_name ?? "—";
  const overdue = effectiveRecipientStatus(top) === "overdue";

  return (
    <>
      <div
        role="region"
        aria-label="Thông báo cần xác nhận"
        className={cn(
          "min-w-0 border-b px-4 py-2 sm:px-6",
          overdue
            ? "border-state-danger/40 bg-state-danger/10"
            : "border-border-default bg-surface-subtle",
        )}
      >
        <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle
              className={cn(
                "mt-0.5 size-icon-sm shrink-0",
                overdue ? "text-state-danger" : "text-state-warning",
              )}
              aria-hidden="true"
            />
            <p className="min-w-0 break-words text-body-sm text-text-primary">
              <strong>{top.announcement.title || "(Chưa có tiêu đề)"}</strong>
              {collapsed ? null : (
                <>
                  {" "}
                  · {senderName} ·{" "}
                  {overdue
                    ? `Quá hạn từ ${formatHanoiDateTime(top.due_at)}`
                    : `Hạn xác nhận ${formatHanoiDateTime(top.due_at)}`}
                </>
              )}
              {pending.length > 1 ? (
                <span className="text-text-muted">
                  {" "}
                  — Bạn còn {pending.length} thông báo cần xác nhận
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setOpenId(top.id)}>
              Xem và xác nhận
            </Button>
            {pending.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ to: "/announcements" })}
              >
                Xem tất cả
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <ChevronDown /> : <ChevronUp />}
              {collapsed ? "Mở rộng" : "Thu gọn"}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(activeRow)}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        title="Thông báo cần xác nhận"
        description="Đọc nội dung và bấm xác nhận. Mở thông báo không tự xác nhận thay bạn."
      >
        {activeRow ? (
          <AnnouncementAckCard
            row={activeRow}
            senderName={senderName}
            open
            onOpenChange={(next) => {
              if (!next) setOpenId(null);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
