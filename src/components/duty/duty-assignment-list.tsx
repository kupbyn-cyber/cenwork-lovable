import * as React from "react";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { CalendarDays, Check, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DUTY_STATUS_LABEL,
  dutyAreaLabel,
  dutyJobLabel,
  dutyStatusTone,
  effectiveDutyStatus,
  type DutyAssignmentRow,
} from "@/lib/duty-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * CEN DUTY-02 — Danh sách phân công trực nhật.
 * Desktop: bảng gọn. Mobile: card, không cuộn ngang toàn trang.
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

function peopleLabel(row: DutyAssignmentRow): string {
  const names = row.memberNames.filter(Boolean);
  if (names.length > 0) return names.join(", ");
  return row.assignee?.display_name ?? "—";
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
    <div className="flex flex-wrap items-center justify-end gap-2">
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

function DutyCard({ row, actions }: { row: DutyAssignmentRow; actions: DutyListActions }) {
  const status = effectiveDutyStatus(row);
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default bg-background-elevated p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <p className="truncate text-label font-semibold text-text-primary">
            {formatDutyDate(row.duty_date)}
          </p>
          <p className="text-caption text-text-muted">
            {hhmm(row.start_time)}–{hhmm(row.end_time)} · Hạn {hhmm(row.due_time)}
          </p>
        </div>
        <StatusBadge label={DUTY_STATUS_LABEL[status]} tone={dutyStatusTone(status)} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
        <dt className="text-text-muted">Khu vực</dt>
        <dd className="min-w-0 break-words text-text-secondary">{dutyAreaLabel(row)}</dd>
        <dt className="text-text-muted">Nhiệm vụ</dt>
        <dd className="min-w-0 break-words text-text-secondary">{dutyJobLabel(row)}</dd>
        <dt className="text-text-muted">Team</dt>
        <dd className="min-w-0 break-words text-text-secondary">{row.duty_team?.name ?? "—"}</dd>
        <dt className="text-text-muted">Phụ trách</dt>
        <dd className="min-w-0 break-words text-text-secondary">{peopleLabel(row)}</dd>
        {row.provider ? (
          <>
            <dt className="text-text-muted">Dịch vụ ngoài</dt>
            <dd className="min-w-0 break-words text-text-secondary">{row.provider.name}</dd>
          </>
        ) : null}
        {row.completed_at ? (
          <>
            <dt className="text-text-muted">Hoàn thành</dt>
            <dd className="min-w-0 break-words text-text-secondary">
              {row.completed_person?.display_name ?? "—"} · {formatHanoiDateTime(row.completed_at)}
            </dd>
          </>
        ) : null}
        {row.note ? (
          <>
            <dt className="text-text-muted">Ghi chú</dt>
            <dd className="min-w-0">
              <LinkifiedText className="text-text-secondary" text={row.note} />
            </dd>
          </>
        ) : null}
      </dl>
      <RowActions row={row} actions={actions} />
    </li>
  );
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
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <DutyCard key={row.id} row={row} actions={actions} />
        ))}
      </ul>

      <div className="hidden min-w-0 overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Khu vực</TableHead>
              <TableHead>Nhiệm vụ</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Phụ trách</TableHead>
              <TableHead>Dịch vụ ngoài</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const status = effectiveDutyStatus(row);
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="block text-text-primary">{formatDutyDate(row.duty_date)}</span>
                    <span className="block text-caption text-text-muted">
                      {hhmm(row.start_time)}–{hhmm(row.end_time)} · Hạn {hhmm(row.due_time)}
                    </span>
                  </TableCell>
                  <TableCell>{dutyAreaLabel(row)}</TableCell>
                  <TableCell>{dutyJobLabel(row)}</TableCell>
                  <TableCell>{row.duty_team?.name ?? "—"}</TableCell>
                  <TableCell>{peopleLabel(row)}</TableCell>
                  <TableCell>{row.provider?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge label={DUTY_STATUS_LABEL[status]} tone={dutyStatusTone(status)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions row={row} actions={actions} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
