import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { EntityAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { announcementRecipientsQuery, type RecipientRow } from "@/lib/announcement-data";
import { formatHanoiDateTime, formatHanoiTime } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";
import { cn } from "@/lib/utils";

/**
 * ANN-STATUS-UI-01 — tab "Trạng thái" người nhận.
 * Mỗi người chỉ có MỘT trạng thái tổng hợp; "đã xác nhận" luôn kéo theo "đã đọc".
 * Phạm vi dữ liệu do RLS của announcement_recipients quyết định; UI chỉ trình bày.
 */
type Bucket = "overdue" | "read_pending" | "unread" | "acked";

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Quá hạn",
  read_pending: "Đã đọc, chờ xác nhận",
  unread: "Chưa đọc",
  acked: "Đã xác nhận",
};

const BUCKET_ORDER: Bucket[] = ["overdue", "read_pending", "unread", "acked"];

const BUCKET_TONE: Record<Bucket, "error" | "warning" | "neutral" | "success"> = {
  overdue: "error",
  read_pending: "warning",
  unread: "neutral",
  acked: "success",
};

type FilterKey = "all" | "attention" | "acked";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "attention", label: "Cần chú ý" },
  { key: "acked", label: "Đã xác nhận" },
];

interface StatusRow extends RecipientRow {
  name: string;
  teamId: string | null;
  teamName: string;
  bucket: Bucket;
  /** Đã xác nhận luôn được coi là đã đọc: fallback về thời điểm xác nhận. */
  readAt: string | null;
  timeline: string;
}

function formatOverdue(dueAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(dueAt).getTime()) / 60_000);
  if (minutes < 60) return `Quá hạn ${Math.max(minutes, 1)} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Quá hạn ${hours} giờ`;
  return `Quá hạn ${Math.floor(hours / 24)} ngày`;
}

function buildRow(
  row: RecipientRow,
  name: string,
  teamId: string | null,
  teamName: string,
): StatusRow {
  const acked = row.status === "completed" || row.status === "exempt";
  const readAt = acked ? (row.first_opened_at ?? row.acknowledged_at ?? row.read_completed_at) : row.first_opened_at;
  const overdue = !acked && new Date(row.due_at).getTime() < Date.now();
  const bucket: Bucket = acked ? "acked" : overdue ? "overdue" : readAt ? "read_pending" : "unread";
  const timeline = acked
    ? row.acknowledged_at
      ? `Đã xác nhận lúc ${formatHanoiTime(row.acknowledged_at)}`
      : "Đã xác nhận"
    : overdue
      ? formatOverdue(row.due_at)
      : readAt
        ? `Đã đọc lúc ${formatHanoiTime(readAt)}`
        : "Chưa đọc";
  return { ...row, name, teamId, teamName, bucket, readAt, timeline };
}

function RecipientCard({ row }: { row: StatusRow }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-w-0 rounded-control border border-border-default bg-surface-default p-3">
      <div className="flex min-w-0 items-center gap-3">
        <EntityAvatar name={row.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-text-primary">{row.name}</p>
          <p className="truncate text-helper text-text-muted">{row.teamName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge tone={BUCKET_TONE[row.bucket]} label={BUCKET_LABEL[row.bucket]} />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-helper text-text-muted underline-offset-2 hover:underline"
          >
            {row.timeline}
          </button>
        </div>
      </div>
      {open ? (
        <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-border-subtle pt-3 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-helper text-text-muted">Thời điểm đọc</dt>
            <dd className="text-helper text-text-primary">
              {row.readAt ? formatHanoiDateTime(row.readAt) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-helper text-text-muted">Thời điểm xác nhận</dt>
            <dd className="text-helper text-text-primary">
              {row.acknowledged_at ? formatHanoiDateTime(row.acknowledged_at) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-helper text-text-muted">Hạn xác nhận</dt>
            <dd className="text-helper text-text-primary">{formatHanoiDateTime(row.due_at)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function Group({
  bucket,
  rows,
  defaultOpen,
}: {
  bucket: Bucket;
  rows: StatusRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (rows.length === 0) return null;
  return (
    <section className="min-w-0 rounded-control border border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <StatusBadge tone={BUCKET_TONE[bucket]} label={BUCKET_LABEL[bucket]} />
          <span className="text-label text-text-primary">{rows.length}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 text-text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="flex min-w-0 flex-col gap-2 px-3 pb-3">
          {rows.map((row) => (
            <RecipientCard key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0 rounded-control border border-border-subtle bg-surface-subtle px-3 py-2">
      <p className="text-helper text-text-muted">{label}</p>
      <p className={cn("text-h4 text-text-primary", tone)}>{value}</p>
    </div>
  );
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
      const teamId = member?.primary_team_id ?? null;
      return buildRow(
        row,
        member?.display_name ?? "Không xác định",
        teamId,
        (teamId && teamById.get(teamId)) || "—",
      );
    });
  }, [recipients.data, members.data, teams.data]);

  const counts = React.useMemo(() => {
    const base = { total: rows.length, overdue: 0, read_pending: 0, unread: 0, acked: 0 };
    for (const row of rows) base[row.bucket] += 1;
    return base;
  }, [rows]);

  const percent = counts.total === 0 ? 0 : Math.round((counts.acked / counts.total) * 100);

  const teamProgress = React.useMemo(() => {
    const map = new Map<string, { name: string; total: number; acked: number }>();
    for (const row of rows) {
      const key = row.teamId ?? "none";
      const entry = map.get(key) ?? { name: row.teamName, total: 0, acked: 0 };
      entry.total += 1;
      if (row.bucket === "acked") entry.acked += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.acked / a.total - b.acked / b.total);
  }, [rows]);

  const visible = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "acked" && row.bucket !== "acked") return false;
      if (filter === "attention" && row.bucket === "acked") return false;
      if (!keyword) return true;
      return (
        row.name.toLowerCase().includes(keyword) || row.teamName.toLowerCase().includes(keyword)
      );
    });
  }, [rows, filter, search]);

  const grouped = React.useMemo(() => {
    const map: Record<Bucket, StatusRow[]> = {
      overdue: [],
      read_pending: [],
      unread: [],
      acked: [],
    };
    for (const row of visible) map[row.bucket].push(row);
    for (const bucket of BUCKET_ORDER)
      map[bucket].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    return map;
  }, [visible]);

  const attention = [
    { count: counts.overdue, text: `${counts.overdue} người quá hạn`, tone: "error" as const },
    {
      count: counts.read_pending,
      text: `${counts.read_pending} người đã đọc nhưng chưa xác nhận`,
      tone: "warning" as const,
    },
    { count: counts.unread, text: `${counts.unread} người chưa đọc`, tone: "neutral" as const },
  ].filter((item) => item.count > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Tổng người nhận" value={counts.total} />
        <Metric label="Đã xác nhận" value={counts.acked} tone="text-status-success" />
        <Metric label="Đã đọc, chờ xác nhận" value={counts.read_pending} />
        <Metric label="Chưa đọc" value={counts.unread} />
        <Metric label="Quá hạn" value={counts.overdue} tone="text-status-error" />
      </div>

      <div className="flex min-w-0 flex-col gap-2 rounded-control border border-border-subtle p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label text-text-primary">Tiến độ xác nhận</p>
          <p className="text-helper text-text-muted">
            {percent}% · {counts.acked}/{counts.total} người đã xác nhận
          </p>
        </div>
        <Progress value={percent} aria-label="Tỷ lệ đã xác nhận" />
      </div>

      {attention.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-label text-text-primary">Cần chú ý:</span>
          {attention.map((item) => (
            <StatusBadge key={item.text} tone={item.tone} label={item.text} />
          ))}
        </div>
      ) : null}

      {teamProgress.length > 1 ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-control border border-border-subtle p-3">
          <p className="text-label text-text-primary">Tiến độ theo Team</p>
          {teamProgress.map((team) => (
            <div key={team.name} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-helper text-text-primary">{team.name}</span>
                <span className="shrink-0 text-helper text-text-muted">
                  {team.acked}/{team.total} đã xác nhận
                </span>
              </div>
              <Progress
                value={Math.round((team.acked / team.total) * 100)}
                className="mt-1 h-1.5"
              />
            </div>
          ))}
        </div>
      ) : null}

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

      {recipients.isLoading ? (
        <p className="text-body-sm text-text-muted">Đang tải…</p>
      ) : visible.length === 0 ? (
        <p className="text-body-sm text-text-muted">Không có người nhận phù hợp bộ lọc.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {BUCKET_ORDER.map((bucket) => (
            <Group
              key={bucket}
              bucket={bucket}
              rows={grouped[bucket]}
              defaultOpen={bucket !== "acked"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
