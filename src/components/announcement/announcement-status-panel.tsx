import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  announcementRecipientsQuery,
  effectiveRecipientStatus,
  type RecipientRow,
} from "@/lib/announcement-data";
import { formatHanoiDateTime } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";

/**
 * ANNOUNCEMENT-STATUS-01 — tab "Trạng thái" người nhận.
 * Phạm vi dữ liệu do RLS của announcement_recipients quyết định
 * (người gửi, Admin/CMO, Leader của team người nhận); UI chỉ trình bày.
 */
type FilterKey = "all" | "unread" | "read" | "unacked" | "acked" | "overdue";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unread", label: "Chưa đọc" },
  { key: "read", label: "Đã đọc" },
  { key: "unacked", label: "Chưa xác nhận" },
  { key: "acked", label: "Đã xác nhận" },
  { key: "overdue", label: "Quá hạn" },
];

interface StatusRow extends RecipientRow {
  name: string;
  teamName: string;
  hasRead: boolean;
  hasAck: boolean;
  isOverdue: boolean;
}

function matchFilter(row: StatusRow, filter: FilterKey): boolean {
  switch (filter) {
    case "unread":
      return !row.hasRead;
    case "read":
      return row.hasRead;
    case "unacked":
      return !row.hasAck;
    case "acked":
      return row.hasAck;
    case "overdue":
      return row.isOverdue;
    default:
      return true;
  }
}

function ReadBadge({ row }: { row: StatusRow }) {
  return row.hasRead ? (
    <StatusBadge tone="success" label="Đã đọc" />
  ) : (
    <StatusBadge tone="neutral" label="Chưa đọc" />
  );
}

function AckBadge({ row }: { row: StatusRow }) {
  if (row.hasAck)
    return <StatusBadge tone="success" label={row.is_late ? "Đã xác nhận (trễ)" : "Đã xác nhận"} />;
  if (row.isOverdue) return <StatusBadge tone="error" label="Quá hạn" />;
  return <StatusBadge tone="warning" label="Chưa xác nhận" />;
}

export function AnnouncementStatusPanel({ announcementId }: { announcementId: string }) {
  const recipients = useQuery(announcementRecipientsQuery(announcementId));
  const members = useQuery(membersQuery());
  const teams = useQuery(teamsQuery());
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [search, setSearch] = React.useState("");

  const rows: StatusRow[] = React.useMemo(() => {
    const memberById = new Map((members.data ?? []).map((member) => [member.id, member]));
    const teamById = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
    return (recipients.data ?? []).map((row) => {
      const member = memberById.get(row.user_id);
      const status = effectiveRecipientStatus(row);
      const hasAck = row.status === "completed" || row.status === "exempt";
      return {
        ...row,
        name: member?.display_name ?? "Không xác định",
        teamName: (member?.primary_team_id && teamById.get(member.primary_team_id)) || "—",
        hasRead: Boolean(row.first_opened_at),
        hasAck,
        isOverdue: status === "overdue",
      };
    });
  }, [recipients.data, members.data, teams.data]);

  const counts = React.useMemo(
    () => ({
      total: rows.length,
      read: rows.filter((row) => row.hasRead).length,
      unread: rows.filter((row) => !row.hasRead).length,
      acked: rows.filter((row) => row.hasAck).length,
      unacked: rows.filter((row) => !row.hasAck).length,
      overdue: rows.filter((row) => row.isOverdue).length,
    }),
    [rows],
  );

  const visible = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchFilter(row, filter)) return false;
      if (!keyword) return true;
      return (
        row.name.toLowerCase().includes(keyword) || row.teamName.toLowerCase().includes(keyword)
      );
    });
  }, [rows, filter, search]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="neutral">Tổng người nhận: {counts.total}</Badge>
        <StatusBadge tone="success" label={`Đã đọc: ${counts.read}`} />
        <StatusBadge tone="neutral" label={`Chưa đọc: ${counts.unread}`} />
        <StatusBadge tone="success" label={`Đã xác nhận: ${counts.acked}`} />
        <StatusBadge tone="warning" label={`Chưa xác nhận: ${counts.unacked}`} />
        <StatusBadge tone="error" label={`Quá hạn: ${counts.overdue}`} />
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={filter === item.key ? "secondary" : "ghost"}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo tên hoặc Team"
          className="sm:max-w-[260px]"
          aria-label="Tìm người nhận theo tên hoặc Team"
        />
      </div>

      {/* Mobile: danh sách card, tránh cuộn ngang toàn trang */}
      <div className="flex min-w-0 flex-col gap-2 md:hidden">
        {recipients.isLoading ? (
          <p className="text-body-sm text-text-muted">Đang tải…</p>
        ) : visible.length === 0 ? (
          <p className="text-body-sm text-text-muted">Không có người nhận phù hợp bộ lọc.</p>
        ) : (
          visible.map((row) => (
            <div
              key={row.id}
              className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3"
            >
              <div className="min-w-0">
                <p className="break-words text-label text-text-primary">{row.name}</p>
                <p className="text-helper text-text-muted">{row.teamName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ReadBadge row={row} />
                <AckBadge row={row} />
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <dt className="text-helper text-text-muted">Thời điểm đọc</dt>
                  <dd className="text-helper text-text-primary">
                    {row.first_opened_at ? formatHanoiDateTime(row.first_opened_at) : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-helper text-text-muted">Thời điểm xác nhận</dt>
                  <dd className="text-helper text-text-primary">
                    {row.acknowledged_at ? formatHanoiDateTime(row.acknowledged_at) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ))
        )}
      </div>

      <div className="hidden min-w-0 md:block">
        <DataTable<StatusRow>
          data={visible}
          getRowId={(row) => row.id}
          loading={recipients.isLoading}
          error={recipients.isError}
          onRetry={() => void recipients.refetch()}
          emptyTitle="Không có người nhận phù hợp"
          emptyDescription="Thử đổi bộ lọc hoặc từ khóa tìm kiếm."
          columns={[
            {
              id: "name",
              header: "Họ tên",
              className: "min-w-[180px]",
              cell: (row) => row.name,
            },
            { id: "team", header: "Team", className: "min-w-[140px]", cell: (row) => row.teamName },
            {
              id: "read",
              header: "Trạng thái đọc",
              className: "min-w-[130px]",
              cell: (row) => <ReadBadge row={row} />,
            },
            {
              id: "read-at",
              header: "Thời điểm đọc",
              className: "min-w-[150px]",
              cell: (row) =>
                row.first_opened_at ? formatHanoiDateTime(row.first_opened_at) : "—",
            },
            {
              id: "ack",
              header: "Trạng thái xác nhận",
              className: "min-w-[160px]",
              cell: (row) => <AckBadge row={row} />,
            },
            {
              id: "ack-at",
              header: "Thời điểm xác nhận",
              className: "min-w-[160px]",
              cell: (row) =>
                row.acknowledged_at ? formatHanoiDateTime(row.acknowledged_at) : "—",
            },
          ]}
        />
      </div>
    </div>
  );
}