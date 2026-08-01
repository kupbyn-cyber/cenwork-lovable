import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  announcementRecipientsQuery,
  effectiveRecipientStatus,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type EffectiveRecipientStatus,
  type RecipientRow,
} from "@/lib/announcement-data";
import { membersQuery } from "@/lib/org-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.1 theo dõi tiến độ xác nhận.
 * RLS quyết định người dùng thấy được bao nhiêu người nhận; UI chỉ hiển thị dữ liệu trả về.
 */
const ORDER: EffectiveRecipientStatus[] = [
  "unread",
  "reading",
  "completed",
  "overdue",
  "exempt",
];

export function AnnouncementProgress({ announcementId }: { announcementId: string }) {
  const recipients = useQuery(announcementRecipientsQuery(announcementId));
  const members = useQuery(membersQuery());

  const nameById = React.useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member.display_name])),
    [members.data],
  );

  const rows = recipients.data ?? [];
  const counts = ORDER.map((status) => ({
    status,
    value: rows.filter((row) => effectiveRecipientStatus(row) === status).length,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="neutral">Tổng người nhận: {rows.length}</Badge>
        {counts.map((item) => (
          <StatusBadge
            key={item.status}
            tone={RECIPIENT_STATUS_TONE[item.status]}
            label={`${RECIPIENT_STATUS_LABEL[item.status]}: ${item.value}`}
          />
        ))}
      </div>

      <DataTable<RecipientRow>
        data={rows}
        getRowId={(row) => row.id}
        loading={recipients.isLoading}
        error={recipients.isError}
        onRetry={() => void recipients.refetch()}
        emptyTitle="Chưa có người nhận"
        emptyDescription="Danh sách người nhận được chốt khi phát hành."
        columns={[
          {
            id: "user",
            header: "Người nhận",
            className: "min-w-[180px]",
            cell: (row) => nameById.get(row.user_id) ?? row.user_id,
          },
          {
            id: "status",
            header: "Trạng thái",
            className: "min-w-[140px]",
            cell: (row) => {
              const status = effectiveRecipientStatus(row);
              return (
                <StatusBadge
                  tone={RECIPIENT_STATUS_TONE[status]}
                  label={RECIPIENT_STATUS_LABEL[status]}
                />
              );
            },
          },
          {
            id: "opened",
            header: "Mở lần đầu",
            className: "min-w-[150px]",
            cell: (row) => (row.first_opened_at ? formatHanoiDateTime(row.first_opened_at) : "—"),
          },
          {
            id: "read",
            header: "Đọc đến cuối",
            className: "min-w-[150px]",
            cell: (row) =>
              row.read_completed_at ? formatHanoiDateTime(row.read_completed_at) : "—",
          },
          {
            id: "ack",
            header: "Xác nhận",
            className: "min-w-[170px]",
            cell: (row) =>
              row.acknowledged_at
                ? `${formatHanoiDateTime(row.acknowledged_at)}${row.is_late ? " (trễ hạn)" : " (đúng hạn)"}`
                : "—",
          },
        ]}
      />
    </div>
  );
}
