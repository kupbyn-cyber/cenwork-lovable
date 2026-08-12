import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { EntityAvatar } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import { formatHanoiDateTime, formatHanoiTime } from "@/lib/datetime";
import {
  isWeekendISO,
  workDayChangesQuery,
  workDayHistoryQuery,
  type WorkDayHistoryRow,
} from "@/lib/workday-stats";
import {
  WORK_SHIFT_OPTIONS,
  setWorkDay,
  workShiftLabel,
  type WorkDayStatus,
  type WorkShift,
} from "@/lib/workday-data";

/** WORKDAY-02 — lịch sử ngày làm việc của một nhân sự (chỉ đọc + điều chỉnh theo quyền sẵn có). */
export interface WorkdayHistoryTarget {
  userId: string;
  name: string;
  teamName: string | null;
  avatarUrl?: string | undefined;
}

const weekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function dayLabel(iso: string): string {
  return weekdayFormatter.format(new Date(`${iso}T00:00:00Z`));
}

function statusLabel(status: string | null): string {
  if (status === "working") return "Đang làm";
  if (status === "day_off") return "Ngày nghỉ";
  return "Chưa xác nhận";
}

function ChangeHistory({ recordId }: { recordId: string }) {
  const changes = useQuery(workDayChangesQuery(recordId));
  if (changes.isLoading) return <Skeleton className="h-10 w-full" />;
  if (changes.isError)
    return <p className="text-caption text-state-danger">Không tải được lịch sử thay đổi.</p>;
  const rows = changes.data ?? [];
  if (rows.length === 0)
    return <p className="text-caption text-text-muted">Chưa ghi nhận thay đổi nào.</p>;
  return (
    <ul className="mt-1 space-y-1 text-caption text-text-secondary">
      {rows.map((row, index) => (
        <li key={`${row.changed_at}-${index}`} className="rounded-md bg-surface-subtle px-2 py-1">
          <span className="text-text-primary">
            {statusLabel(row.before_status)}
            {row.before_shift ? ` · ${workShiftLabel(row.before_shift as WorkShift)}` : ""} →{" "}
            {statusLabel(row.after_status)}
            {row.after_shift ? ` · ${workShiftLabel(row.after_shift as WorkShift)}` : ""}
          </span>
          <br />
          {row.actor_name} · {formatHanoiDateTime(row.changed_at)}
        </li>
      ))}
    </ul>
  );
}

function HistoryItem({
  row,
  canAdjust,
  userId,
}: {
  row: WorkDayHistoryRow;
  canAdjust: boolean;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [showChanges, setShowChanges] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState<WorkDayStatus>(row.day_status);
  const [shift, setShift] = React.useState<WorkShift>(row.shift_type ?? "full_day");

  const adjust = useMutation({
    mutationFn: () =>
      setWorkDay({
        status,
        shift: status === "working" ? shift : null,
        userId,
        day: row.work_date,
        source: "members_dashboard",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["work-day-history"] });
      void queryClient.invalidateQueries({ queryKey: ["work-day-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["work-day-today"] });
      void queryClient.invalidateQueries({ queryKey: ["work-day-changes", row.id] });
      setEditing(false);
      cenToast.success("Đã cập nhật ngày làm việc.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  return (
    <li className="rounded-lg border border-border-default p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-strong text-text-primary">{dayLabel(row.work_date)}</span>
        <div className="flex items-center gap-1.5">
          {row.change_count > 0 ? (
            <Badge variant="warning" size="sm">
              Đã thay đổi
            </Badge>
          ) : null}
          {isWeekendISO(row.work_date) && row.day_status === "working" ? (
            <Badge variant="info" size="sm">
              Làm cuối tuần
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <StatusBadge
          label={
            row.day_status === "working" ? workShiftLabel(row.shift_type) : "Ngày nghỉ"
          }
          tone={row.day_status === "working" ? "success" : "neutral"}
        />
        {row.started_at ? (
          <span className="text-caption text-text-secondary">
            Bắt đầu {formatHanoiTime(row.started_at)}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {row.change_count > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowChanges((value) => !value)}
          >
            <History /> Xem lịch sử thay đổi
          </Button>
        ) : null}
        {canAdjust ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil /> Điều chỉnh
          </Button>
        ) : null}
      </div>

      {showChanges ? <ChangeHistory recordId={row.id} /> : null}

      {editing ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={status} onValueChange={(value) => setStatus(value as WorkDayStatus)}>
            <SelectTrigger aria-label="Trạng thái ngày">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="working">Đang làm</SelectItem>
              <SelectItem value="day_off">Ngày nghỉ</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={shift}
            onValueChange={(value) => setShift(value as WorkShift)}
            disabled={status !== "working"}
          >
            <SelectTrigger aria-label="Ca làm việc">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_SHIFT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            loading={adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            Lưu
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function WorkdayHistoryDrawer({
  target,
  from,
  to,
  rangeLabel,
  canAdjust,
  onOpenChange,
}: {
  target: WorkdayHistoryTarget | null;
  from: string;
  to: string;
  rangeLabel: string;
  canAdjust: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const history = useQuery(
    workDayHistoryQuery({ userId: target?.userId ?? null, from, to }),
  );
  const rows = history.data ?? [];

  return (
    <DrawerPanel
      open={target !== null}
      onOpenChange={onOpenChange}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <EntityAvatar
            name={target?.name ?? ""}
            size="sm"
            {...(target?.avatarUrl ? { src: target.avatarUrl } : {})}
          />
          <span className="truncate">{target?.name ?? ""}</span>
        </span>
      }
      description={`${target?.teamName ?? "Không có Team"} · ${rangeLabel}`}
    >
      {history.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : history.isError ? (
        <div className="space-y-2">
          <p className="text-state-danger">
            Không thể tải dữ liệu ngày làm việc. Vui lòng thử lại.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void history.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p>Chưa có dữ liệu ngày làm việc trong khoảng thời gian này.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <HistoryItem
              key={row.id}
              row={row}
              canAdjust={canAdjust}
              userId={target?.userId ?? ""}
            />
          ))}
        </ul>
      )}
    </DrawerPanel>
  );
}
