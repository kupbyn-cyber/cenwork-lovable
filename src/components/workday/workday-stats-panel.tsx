import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EntityAvatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatHanoiTime } from "@/lib/datetime";
import { avatarUrlMapQuery } from "@/lib/avatar-data";
import { workShiftLabel, type WorkShift } from "@/lib/workday-data";
import {
  WORK_RANGE_LABEL,
  cenTodayISO,
  isWeekendISO,
  workDayOverviewQuery,
  workRangeBounds,
  type WorkDayOverviewRow,
  type WorkRangeKey,
} from "@/lib/workday-stats";
import {
  WorkdayHistoryDrawer,
  type WorkdayHistoryTarget,
} from "@/components/workday/workday-history-drawer";
import type { TeamRow } from "@/lib/org-data";

/**
 * WORKDAY-02 — thống kê ngày làm việc trong màn Thành viên.
 * Chỉ hiển thị dữ liệu thật từ `daily_work_records` qua RPC `work_day_overview`;
 * phạm vi Leader/CMO/Admin do RPC chốt, UI không tự nới quyền.
 * Không kết luận đi muộn / vắng mặt / chuyên cần.
 */
const ALL = "__all__";

type StatusFilter = "all" | "working" | "day_off" | "unconfirmed";

const SHIFT_FILTERS: { value: string; label: string }[] = [
  { value: ALL, label: "Tất cả ca" },
  { value: "full_day", label: "Cả ngày" },
  { value: "morning", label: "Ca sáng" },
  { value: "afternoon", label: "Ca chiều" },
  { value: "evening", label: "Ca tối" },
  { value: "custom", label: "Ca khác" },
];

function SummaryCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-3">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="text-h3 text-text-primary">{value}</p>
      {hint ? <p className="text-caption text-text-muted">{hint}</p> : null}
    </Card>
  );
}

function todayStatusOf(row: WorkDayOverviewRow): StatusFilter {
  if (row.today_status === "working") return "working";
  if (row.today_status === "day_off") return "day_off";
  return "unconfirmed";
}

export function WorkdayStatsPanel({
  teams,
  canFilterTeam,
  canAdjust,
  defaultTeamId,
}: {
  teams: TeamRow[];
  /** Chỉ CMO/Admin được xem nhiều Team; Leader bị RPC giới hạn Team mình. */
  canFilterTeam: boolean;
  canAdjust: boolean;
  defaultTeamId?: string | null;
}) {
  const [rangeKey, setRangeKey] = React.useState<WorkRangeKey>("today");
  const [customFrom, setCustomFrom] = React.useState(cenTodayISO());
  const [customTo, setCustomTo] = React.useState(cenTodayISO());
  const [teamFilter, setTeamFilter] = React.useState(
    canFilterTeam ? ALL : (defaultTeamId ?? ALL),
  );
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [shiftFilter, setShiftFilter] = React.useState(ALL);
  const [target, setTarget] = React.useState<WorkdayHistoryTarget | null>(null);

  const bounds = React.useMemo(
    () => workRangeBounds(rangeKey, { from: customFrom, to: customTo }),
    [rangeKey, customFrom, customTo],
  );
  const isToday = rangeKey === "today";

  const overview = useQuery(
    workDayOverviewQuery({
      from: bounds.from,
      to: bounds.to,
      teamId: teamFilter === ALL ? null : teamFilter,
      enabled: true,
    }),
  );

  const avatarPaths = React.useMemo(
    () =>
      (overview.data ?? [])
        .map((row) => row.avatar_path)
        .filter((path): path is string => Boolean(path)),
    [overview.data],
  );
  const avatarMap = useQuery(avatarUrlMapQuery(avatarPaths));

  const rows = React.useMemo(() => {
    const list = overview.data ?? [];
    if (!isToday) return list;
    return list.filter((row) => {
      if (statusFilter !== "all" && todayStatusOf(row) !== statusFilter) return false;
      if (shiftFilter !== ALL && row.today_shift !== shiftFilter) return false;
      return true;
    });
  }, [overview.data, isToday, statusFilter, shiftFilter]);

  const summary = React.useMemo(() => {
    const list = overview.data ?? [];
    return {
      working: list.filter((row) => row.today_status === "working").length,
      dayOff: list.filter((row) => row.today_status === "day_off").length,
      unconfirmed: list.filter((row) => row.today_status === null).length,
      totalWorking: list.reduce((sum, row) => sum + row.working_days, 0),
      weekend: list.reduce((sum, row) => sum + row.weekend_days, 0),
      dayOffRange: list.reduce((sum, row) => sum + row.day_off_days, 0),
      otherShift: list.reduce((sum, row) => sum + row.other_shift_days, 0),
    };
  }, [overview.data]);

  const memberCell = (row: WorkDayOverviewRow) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityAvatar
        name={row.display_name}
        size="sm"
        {...(row.avatar_path && avatarMap.data?.[row.avatar_path]
          ? { src: avatarMap.data[row.avatar_path] as string }
          : {})}
      />
      <TableCellStack primary={row.display_name} secondary={row.team_name ?? "Không có Team"} />
    </div>
  );

  const todayColumns = [
    { id: "member", header: "Thành viên", className: "min-w-[220px]", cell: memberCell },
    {
      id: "team",
      header: "Team",
      className: "hidden min-w-[140px] md:table-cell",
      cell: (row: WorkDayOverviewRow) => (
        <span className="text-text-secondary">{row.team_name ?? "—"}</span>
      ),
    },
    {
      id: "shift",
      header: "Ca",
      className: "min-w-[110px]",
      cell: (row: WorkDayOverviewRow) => (
        <span className="text-text-secondary">
          {row.today_status === "working" ? workShiftLabel(row.today_shift) : "—"}
        </span>
      ),
    },
    {
      id: "started",
      header: "Bắt đầu",
      className: "hidden min-w-[90px] sm:table-cell",
      cell: (row: WorkDayOverviewRow) => (
        <span className="text-text-secondary">
          {row.today_started_at ? formatHanoiTime(row.today_started_at) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row: WorkDayOverviewRow) => {
        const state = todayStatusOf(row);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              label={
                state === "working"
                  ? "Đang làm"
                  : state === "day_off"
                    ? "Ngày nghỉ"
                    : "Chưa xác nhận"
              }
              tone={state === "working" ? "success" : state === "day_off" ? "neutral" : "warning"}
            />
            {row.today_changed ? (
              <Badge variant="warning" size="sm">
                Đã thay đổi
              </Badge>
            ) : null}
          </div>
        );
      },
    },
  ];

  const rangeColumns = [
    { id: "member", header: "Thành viên", className: "min-w-[220px]", cell: memberCell },
    {
      id: "team",
      header: "Team",
      className: "hidden min-w-[140px] md:table-cell",
      cell: (row: WorkDayOverviewRow) => (
        <span className="text-text-secondary">{row.team_name ?? "—"}</span>
      ),
    },
    {
      id: "working",
      header: "Ngày làm",
      align: "center" as const,
      cell: (row: WorkDayOverviewRow) => row.working_days,
    },
    {
      id: "full",
      header: "Cả ngày",
      align: "center" as const,
      className: "hidden sm:table-cell",
      cell: (row: WorkDayOverviewRow) => row.full_days,
    },
    {
      id: "other",
      header: "Ca khác",
      align: "center" as const,
      className: "hidden sm:table-cell",
      cell: (row: WorkDayOverviewRow) => row.other_shift_days,
    },
    {
      id: "weekend",
      header: "T7/CN",
      align: "center" as const,
      className: "hidden md:table-cell",
      cell: (row: WorkDayOverviewRow) => row.weekend_days,
    },
    {
      id: "dayoff",
      header: "Ngày nghỉ",
      align: "center" as const,
      cell: (row: WorkDayOverviewRow) => row.day_off_days,
    },
    {
      id: "changes",
      header: "Lần đổi",
      align: "center" as const,
      className: "hidden lg:table-cell",
      cell: (row: WorkDayOverviewRow) => row.change_count,
    },
  ];

  const openTarget = (row: WorkDayOverviewRow) =>
    setTarget({
      userId: row.user_id,
      name: row.display_name,
      teamName: row.team_name,
      ...(row.avatar_path && avatarMap.data?.[row.avatar_path]
        ? { avatarUrl: avatarMap.data[row.avatar_path] as string }
        : {}),
    });

  const rangeLabel =
    rangeKey === "custom" ? `${bounds.from} → ${bounds.to}` : WORK_RANGE_LABEL[rangeKey];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={rangeKey} onValueChange={(value) => setRangeKey(value as WorkRangeKey)}>
          <SelectTrigger aria-label="Lọc theo thời gian">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["today", "week", "month", "custom"] as WorkRangeKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {WORK_RANGE_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canFilterTeam ? (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger aria-label="Lọc theo Team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả Team</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {isToday ? (
          <>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger aria-label="Lọc theo trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="working">Đang làm</SelectItem>
                <SelectItem value="day_off">Ngày nghỉ</SelectItem>
                <SelectItem value="unconfirmed">Chưa xác nhận</SelectItem>
              </SelectContent>
            </Select>
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger aria-label="Lọc theo ca">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {rangeKey === "custom" ? (
          <>
            <Input
              type="date"
              value={customFrom}
              aria-label="Từ ngày"
              max={cenTodayISO()}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <Input
              type="date"
              value={customTo}
              aria-label="Đến ngày"
              max={cenTodayISO()}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </>
        ) : null}
      </div>

      {overview.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isToday ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Đang làm" value={summary.working} />
          <SummaryCard label="Ngày nghỉ" value={summary.dayOff} />
          <SummaryCard label="Chưa xác nhận" value={summary.unconfirmed} />
          {isWeekendISO(bounds.from) ? (
            <SummaryCard label="Làm cuối tuần" value={summary.working} />
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Tổng ngày làm" value={summary.totalWorking} />
          <SummaryCard label="Ngày làm cuối tuần" value={summary.weekend} />
          <SummaryCard label="Ngày nghỉ đã khai báo" value={summary.dayOffRange} />
          <SummaryCard label="Ca ngoài Cả ngày" value={summary.otherShift} />
        </div>
      )}

      {/* Mobile: danh sách dạng thẻ, không ép bảng desktop gây scroll ngang. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {overview.isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : overview.isError ? (
          <Card className="space-y-2 p-3">
            <p className="text-state-danger">
              Không thể tải dữ liệu ngày làm việc. Vui lòng thử lại.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void overview.refetch()}>
              Thử lại
            </Button>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-3 text-text-secondary">
            Chưa có dữ liệu ngày làm việc trong khoảng thời gian này.
          </Card>
        ) : (
          rows.map((row) => (
            <Card
              key={row.user_id}
              className="cursor-pointer p-3"
              onClick={() => openTarget(row)}
            >
              <p className="text-body-strong text-text-primary">{row.display_name}</p>
              <p className="text-caption text-text-secondary">{row.team_name ?? "Không có Team"}</p>
              {isToday ? (
                <>
                  <p className="mt-1 text-caption text-text-secondary">
                    {row.today_status === "working"
                      ? `${workShiftLabel(row.today_shift)}${row.today_started_at ? ` · ${formatHanoiTime(row.today_started_at)}` : ""}`
                      : "—"}
                  </p>
                  <StatusBadge
                    className="mt-1"
                    label={
                      row.today_status === "working"
                        ? "Đang làm"
                        : row.today_status === "day_off"
                          ? "Ngày nghỉ"
                          : "Chưa xác nhận"
                    }
                    tone={
                      row.today_status === "working"
                        ? "success"
                        : row.today_status === "day_off"
                          ? "neutral"
                          : "warning"
                    }
                  />
                </>
              ) : (
                <p className="mt-1 text-caption text-text-secondary">
                  Ngày làm {row.working_days} · T7/CN {row.weekend_days} · Ngày nghỉ{" "}
                  {row.day_off_days}
                </p>
              )}
            </Card>
          ))
        )}
      </div>

      <div className="hidden min-w-0 sm:block">
        <DataTable
          columns={isToday ? todayColumns : rangeColumns}
          data={rows}
          getRowId={(row) => row.user_id}
          density="compact"
          onRowClick={openTarget}
          loading={overview.isLoading}
          error={overview.isError}
          onRetry={() => void overview.refetch()}
          errorTitle="Không thể tải dữ liệu ngày làm việc. Vui lòng thử lại."
          emptyTitle="Chưa có dữ liệu ngày làm việc trong khoảng thời gian này."
          emptyDescription="Điều chỉnh bộ lọc thời gian, Team hoặc trạng thái để xem kết quả khác."
          caption="Thống kê ngày làm việc"
        />
      </div>

      {!isToday ? (
        <p className="text-caption text-text-muted">
          Chưa đủ dữ liệu lịch làm việc chính thức để xác định số ngày “Chưa xác nhận” trong quá
          khứ, nên bảng thống kê chỉ đếm các ngày đã có xác nhận. Giờ bắt đầu là dữ liệu quan sát,
          không dùng để kết luận đi muộn hay chuyên cần.
        </p>
      ) : (
        <p className="text-caption text-text-muted">
          “Chưa xác nhận” nghĩa là hôm nay chưa có bản ghi ngày làm việc, không đồng nghĩa với nghỉ
          hay vắng mặt. “Ngày nghỉ” là trạng thái do người dùng tự xác nhận trên CEN.
        </p>
      )}

      <WorkdayHistoryDrawer
        target={target}
        from={bounds.from}
        to={bounds.to}
        rangeLabel={rangeLabel}
        canAdjust={canAdjust}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </div>
  );
}
