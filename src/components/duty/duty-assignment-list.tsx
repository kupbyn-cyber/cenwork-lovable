import * as React from "react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { CalendarDays, Check, Clock, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DUTY_STATUS_LABEL,
  DUTY_UNKNOWN_PERSON,
  dutyAreaLabel,
  dutyJobLabel,
  dutyStatusTone,
  effectiveDutyStatus,
  type DutyAssignmentRow,
  type DutyPerson,
} from "@/lib/duty-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * CEN DUTY-02 / DUTY-LIST-UX-01 — Danh sách phân công trực nhật.
 * Ưu tiên thị giác: người phụ trách → nhiệm vụ → khu vực → ngày giờ → trạng thái.
 * Desktop: bảng nhóm theo ngày. Mobile/tablet: card, không cuộn ngang.
 */
export interface DutyListActions {
  canManage: boolean;
  userId: string | null;
  busyId: string | null;
  onEdit: (row: DutyAssignmentRow) => void;
  onDelete: (row: DutyAssignmentRow) => void;
  onToggleComplete: (row: DutyAssignmentRow, completed: boolean) => void;
}

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function formatDutyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return `${WEEKDAYS[date.getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function hhmm(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts[parts.length - 1] ?? "";
  const first = parts.length > 1 ? (parts[parts.length - 2] ?? "") : "";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
}

/** Người phụ trách: luôn có tên, không bao giờ để trống. */
function peopleOf(row: DutyAssignmentRow): DutyPerson[] {
  if (row.people && row.people.length > 0) return row.people;
  if (row.memberIds.length > 0) {
    return row.memberIds.map((id, index) => ({
      id,
      name: row.memberNames[index]?.trim() || DUTY_UNKNOWN_PERSON,
    }));
  }
  if (row.assignee_id) {
    return [{ id: row.assignee_id, name: row.assignee?.display_name || DUTY_UNKNOWN_PERSON }];
  }
  return [];
}

function PersonChips({ people, size = "sm" }: { people: DutyPerson[]; size?: "xs" | "sm" }) {
  if (people.length === 0) {
    return <span className="text-caption text-text-muted">Chưa phân công nhân sự</span>;
  }
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {people.map((person) => (
        <li
          key={person.id}
          className="flex min-w-0 items-center gap-1.5 rounded-full bg-surface-subtle py-0.5 pr-2.5 pl-0.5"
        >
          <Avatar size={size === "xs" ? "xs" : "sm"} className="shrink-0">
            <AvatarFallback>{initials(person.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate text-label font-medium text-text-primary">
            {person.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Chỉ dịch vụ ngoài, không có nhân sự nội bộ → không bắt buộc hoàn thành. */
function isExternalOnly(row: DutyAssignmentRow): boolean {
  return !row.assignee_id && Boolean(row.external_provider_id);
}

function canToggle(row: DutyAssignmentRow, actions: DutyListActions): boolean {
  if (isExternalOnly(row)) return false;
  if (actions.canManage) return true;
  if (!actions.userId) return false;
  if (row.status === "completed") return row.completed_by === actions.userId;
  return row.assignee_id === actions.userId || row.memberIds.includes(actions.userId);
}

function RowActions({ row, actions }: { row: DutyAssignmentRow; actions: DutyListActions }) {
  const status = effectiveDutyStatus(row);
  const toggleable = canToggle(row, actions);
  const busy = actions.busyId === row.id;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {toggleable ? (
        status === "completed" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => actions.onToggleComplete(row, false)}
          >
            <RotateCcw />
            Mở lại
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => actions.onToggleComplete(row, true)}>
            <Check />
            Đã hoàn thành
          </Button>
        )
      ) : null}
      {actions.canManage ? (
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => actions.onEdit(row)}>
            <Pencil />
            Sửa
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => actions.onDelete(row)}
            className="text-state-danger"
          >
            <Trash2 />
            Xóa
          </Button>
        </>
      ) : null}
    </div>
  );
}

function TimeLine({ row }: { row: DutyAssignmentRow }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-caption text-text-muted">
      <Clock className="size-3.5 shrink-0" aria-hidden />
      {hhmm(row.start_time)}–{hhmm(row.end_time)} · Hạn {hhmm(row.due_time)}
    </span>
  );
}

function DutyCard({ row, actions }: { row: DutyAssignmentRow; actions: DutyListActions }) {
  const status = effectiveDutyStatus(row);
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-control border border-border-default bg-background-elevated p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <p className="min-w-0 truncate text-label font-semibold text-text-primary">
          {formatDutyDate(row.duty_date)}
        </p>
        <StatusBadge label={DUTY_STATUS_LABEL[status]} tone={dutyStatusTone(status)} />
      </div>

      <PersonChips people={peopleOf(row)} />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="min-w-0 text-body font-semibold break-words text-text-primary">
          {dutyJobLabel(row)}
        </p>
        <p className="min-w-0 text-caption break-words text-text-secondary">
          Khu vực: {dutyAreaLabel(row)}
        </p>
        {row.duty_team?.name ? (
          <p className="text-caption text-text-muted">Team: {row.duty_team.name}</p>
        ) : null}
        {row.provider ? (
          <p className="text-caption text-text-muted">Dịch vụ ngoài: {row.provider.name}</p>
        ) : null}
        <TimeLine row={row} />
        {row.completed_at ? (
          <p className="text-caption text-text-muted">
            Hoàn thành: {row.completed_person?.display_name ?? "—"} ·{" "}
            {formatHanoiDateTime(row.completed_at)}
          </p>
        ) : null}
        {row.note ? <LinkifiedText className="text-caption text-text-secondary" text={row.note} /> : null}
      </div>

      <RowActions row={row} actions={actions} />
    </li>
  );
}

function DutyTableRow({ row, actions }: { row: DutyAssignmentRow; actions: DutyListActions }) {
  const status = effectiveDutyStatus(row);
  return (
    <tr className="border-t border-border-default align-top">
      <td className="w-[30%] min-w-0 px-3 py-3">
        <PersonChips people={peopleOf(row)} />
        {row.provider ? (
          <p className="mt-1 text-caption text-text-muted">Dịch vụ ngoài: {row.provider.name}</p>
        ) : null}
      </td>
      <td className="w-[24%] px-3 py-3">
        <p className="text-label font-medium break-words text-text-primary">{dutyJobLabel(row)}</p>
        {row.duty_team?.name ? (
          <p className="text-caption text-text-muted">Team: {row.duty_team.name}</p>
        ) : null}
      </td>
      <td className="w-[22%] px-3 py-3 text-label break-words text-text-secondary">
        {dutyAreaLabel(row)}
      </td>
      <td className="px-3 py-3">
        <TimeLine row={row} />
        {row.completed_at ? (
          <p className="text-caption text-text-muted">
            {row.completed_person?.display_name ?? "—"} · {formatHanoiDateTime(row.completed_at)}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <StatusBadge label={DUTY_STATUS_LABEL[status]} tone={dutyStatusTone(status)} />
      </td>
      <td className="px-3 py-3 text-right">
        <RowActions row={row} actions={actions} />
      </td>
    </tr>
  );
}

function groupByDate(rows: DutyAssignmentRow[]): { date: string; items: DutyAssignmentRow[] }[] {
  const map = new Map<string, DutyAssignmentRow[]>();
  for (const row of rows) {
    map.set(row.duty_date, [...(map.get(row.duty_date) ?? []), row]);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, items }));
}

export function DutyAssignmentList({
  rows,
  actions,
  emptyTitle = "Chưa có lịch trực nhật",
  emptyDescription,
}: {
  rows: DutyAssignmentRow[];
  actions: DutyListActions;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const groups = React.useMemo(() => groupByDate(rows), [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        variant="compact"
        title={emptyTitle}
        {...(emptyDescription ? { description: emptyDescription } : {})}
      />
    );
  }

  return (
    <div className="min-w-0">
      {/* Mobile & tablet: card, không cuộn ngang */}
      <div className="flex flex-col gap-4 lg:hidden">
        {groups.map((group) => (
          <section key={group.date} className="min-w-0">
            <h3 className="mb-2 text-caption font-semibold text-text-muted uppercase">
              {formatDutyDate(group.date)}
            </h3>
            <ul className="flex flex-col gap-3">
              {group.items.map((row) => (
                <DutyCard key={row.id} row={row} actions={actions} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Desktop: bảng nhóm theo ngày */}
      <div className="hidden min-w-0 lg:block">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="text-caption text-text-muted uppercase">
              <th className="px-3 pb-2 text-left font-semibold">Phụ trách</th>
              <th className="px-3 pb-2 text-left font-semibold">Nhiệm vụ</th>
              <th className="px-3 pb-2 text-left font-semibold">Khu vực</th>
              <th className="px-3 pb-2 text-left font-semibold">Khung giờ</th>
              <th className="px-3 pb-2 text-left font-semibold">Trạng thái</th>
              <th className="px-3 pb-2 text-right font-semibold">Hành động</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.date}>
              <tr>
                <th
                  colSpan={6}
                  className="bg-surface-subtle px-3 py-1.5 text-left text-caption font-semibold text-text-secondary"
                >
                  {formatDutyDate(group.date)}
                </th>
              </tr>
              {group.items.map((row) => (
                <DutyTableRow key={row.id} row={row} actions={actions} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
