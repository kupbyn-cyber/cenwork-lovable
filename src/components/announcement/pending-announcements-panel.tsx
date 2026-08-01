import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { AnnouncementAckCard } from "@/components/announcement/announcement-ack-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePendingAnnouncements } from "@/hooks/use-pending-announcements";
import { membersQuery } from "@/lib/org-data";

/**
 * CEN 1.0 — khối "Thông báo cần xác nhận" tại Trang chủ.
 * Cùng nguồn dữ liệu recipient với trang Thông báo nội bộ và thanh nhắc trên cùng.
 */
export function PendingAnnouncementsPanel() {
  const { pending, isLoading, isError, refetch } = usePendingAnnouncements();
  const members = useQuery(membersQuery());
  const [openId, setOpenId] = React.useState<string | null>(null);

  const nameById = React.useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.display_name])),
    [members.data],
  );

  if (isLoading) return null;

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-(--card-pad)">
          <span className="text-body text-state-danger">
            Không tải được danh sách thông báo cần xác nhận.
          </span>
          <button
            type="button"
            className="text-label text-text-primary underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Thử lại
          </button>
        </CardContent>
      </Card>
    );
  }

  if (pending.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Megaphone className="size-icon-sm shrink-0 text-state-warning" aria-hidden="true" />
          Thông báo cần xác nhận ({pending.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        {pending.map((row) => (
          <AnnouncementAckCard
            key={row.id}
            row={row}
            compact
            senderName={nameById.get(row.announcement.created_by) ?? "—"}
            open={openId === row.id}
            onOpenChange={(next) => setOpenId(next ? row.id : null)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
