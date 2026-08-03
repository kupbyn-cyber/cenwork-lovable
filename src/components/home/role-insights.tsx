import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ServerCog, Sparkles, Users } from "lucide-react";

import { DashboardCard, todaySpan, type TodaySize } from "@/components/home/today-layout";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTodayInsights } from "@/hooks/use-today-insights";
import { formatHanoiDateTime } from "@/lib/datetime";
import {
  formatPercent,
  type MarketingFocus,
  type MyFocus,
  type SystemFocus,
  type TeamFocus,
} from "@/lib/today-insights";

/**
 * CEN TODAY-03 — các khối cá nhân hóa Trang chủ theo vai trò.
 * Chỉ trình bày lại dữ liệu module gốc, không tạo Business Rule mới.
 */
export function RoleInsights({ flow = false }: { flow?: boolean } = {}) {
  const { data, isLoading, isError, refetch } = useTodayInsights();

  if (isLoading) {
    if (flow) {
      return (
        <>
          <div className={todaySpan("compact")}>
            <SkeletonCard lines={4} />
          </div>
          <div className={todaySpan("wide")}>
            <SkeletonCard lines={4} />
          </div>
        </>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className={flow ? todaySpan("full") : undefined}>
        <CardContent className="pt-(--card-pad)">
          <ErrorState
            variant="compact"
            title="Không tải được tổng quan theo vai trò"
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (flow) {
    return (
      <>
        {data.failedSources.length > 0 ? (
          <div className="col-span-full rounded-card border border-state-danger/40 bg-surface-subtle px-3 py-2 text-helper text-state-danger">
            Một số nguồn dữ liệu chưa tải được ({data.failedSources.join(", ")}). Số liệu bên dưới
            có thể thiếu.
          </div>
        ) : null}
        <MyFocusCard focus={data.me} />
        {data.team ? <TeamFocusCard focus={data.team} size="wide" /> : null}
        {data.marketing ? <MarketingFocusCard focus={data.marketing} size="wide" /> : null}
        {data.system ? <SystemFocusCard focus={data.system} size="wide" /> : null}
      </>
    );
  }

  return (
    <div className="flex min-w-0 animate-in flex-col gap-4 duration-200 fade-in">
      {data.failedSources.length > 0 ? (
        <div className="rounded-card border border-state-danger/40 bg-surface-subtle px-3 py-2 text-helper text-state-danger">
          Một số nguồn dữ liệu chưa tải được ({data.failedSources.join(", ")}). Số liệu bên dưới có
          thể thiếu.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MyFocusCard focus={data.me} />
        {data.team ? <TeamFocusCard focus={data.team} /> : null}
        {data.marketing ? <MarketingFocusCard focus={data.marketing} /> : null}
        {data.system ? <SystemFocusCard focus={data.system} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption tracking-[0.1em] text-text-muted uppercase">{label}</span>
      <span
        className={
          tone === "danger"
            ? "text-h3 font-semibold tabular-nums text-state-danger"
            : "text-h3 font-semibold tabular-nums text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}

function MyFocusCard({ focus, size = "compact" }: { focus: MyFocus; size?: TodaySize }) {
  return (
    <DashboardCard size={size} icon={Activity} title="Việc của tôi" to="/tasks">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Đang mở" value={focus.open_tasks} />
        <Stat
          label="Quá hạn"
          value={focus.overdue_tasks}
          {...(focus.overdue_tasks > 0 ? { tone: "danger" as const } : {})}
        />
        <Stat label="Hạn hôm nay" value={focus.due_today} />
        <Stat label="Hoàn thành tuần này" value={focus.done_this_week} />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border-default pt-2">
        <span className="text-caption tracking-[0.1em] text-text-muted uppercase">
          Ghi nhận nhận được
        </span>
        <Link
          to="/recognitions"
          className="flex items-center gap-1.5 text-h4 font-semibold tabular-nums text-text-primary hover:underline"
        >
          <Sparkles className="size-icon-sm text-state-success" aria-hidden="true" />
          {focus.recognitions_received_week}
        </Link>
      </div>
    </DashboardCard>
  );
}

function TeamFocusCard({ focus, size = "compact" }: { focus: TeamFocus; size?: TodaySize }) {
  const missing = focus.missing_daily.slice(0, 5);
  const overdue = focus.top_overdue.slice(0, 4);
  return (
    <DashboardCard
      size={size}
      icon={Users}
      title={`Team ${focus.team_name}`}
      to="/tasks"
      headerExtra={<StatusBadge label={`${focus.member_count} thành viên`} tone="neutral" />}
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Việc đang mở" value={focus.open_tasks} />
        <Stat
          label="Quá hạn"
          value={focus.overdue_tasks}
          {...(focus.overdue_tasks > 0 ? { tone: "danger" as const } : {})}
        />
        <Stat label="Chờ kiểm tra" value={focus.pending_reviews} />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-label font-semibold text-text-primary">
          Chưa gửi báo cáo ngày ({focus.missing_daily.length})
        </span>
        {focus.missing_daily.length === 0 ? (
          <span className="text-helper text-text-muted">Cả Team đã gửi báo cáo hôm nay.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((person) => (
              <StatusBadge key={person.id} label={person.name} tone="warning" />
            ))}
            {focus.missing_daily.length > missing.length ? (
              <span className="text-helper text-text-muted">
                +{focus.missing_daily.length - missing.length}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {overdue.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-label font-semibold text-text-primary">Việc quá hạn cần xử lý</span>
          {overdue.map((task) => (
            <Link
              key={task.id}
              to="/tasks/$taskId"
              params={{ taskId: task.id }}
              className="cen-transition flex min-w-0 flex-col rounded-control px-2 py-1 hover:bg-surface-subtle"
            >
              <span className="line-clamp-2 min-w-0 text-body text-text-primary">{task.name}</span>
              <span className="text-helper text-state-danger">
                {task.assignee} · {formatHanoiDateTime(task.deadline)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </DashboardCard>
  );
}

function MarketingFocusCard({
  focus,
  size = "compact",
}: {
  focus: MarketingFocus;
  size?: TodaySize;
}) {
  const teams = focus.teams_attention.slice(0, 4);
  return (
    <DashboardCard
      size={size}
      icon={Activity}
      title="Sức khỏe Marketing"
      to="/tasks"
      actionLabel="Mở Công việc"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Việc quá hạn"
          value={focus.overdue_tasks}
          {...(focus.overdue_tasks > 0 ? { tone: "danger" as const } : {})}
        />
        <Stat label="Dự án chờ duyệt" value={focus.projects_awaiting_decision} />
        <Stat label="Dự án trễ hạn" value={focus.projects_overdue} />
        <Stat label="Tỷ lệ báo cáo ngày" value={formatPercent(focus.daily_report_rate)} />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-label font-semibold text-text-primary">
          Team cần chú ý ({focus.teams_attention.length}/{focus.total_teams})
        </span>
        {focus.teams_attention.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Không có Team nào vượt ngưỡng cảnh báo"
            description="Ngưỡng: từ 3 việc quá hạn hoặc từ 20% việc đang mở bị quá hạn."
          />
        ) : (
          <>
            {teams.map((team) => (
              <div
                key={team.team_id}
                className="flex min-w-0 flex-col gap-1 rounded-card border border-border-default bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="min-w-0 truncate text-body font-medium text-text-primary">
                    {team.team_name}
                  </span>
                  <span className="text-helper text-text-muted">
                    Leader: {team.leader_name ?? "Chưa gán"} · {team.open_tasks} việc đang mở ·{" "}
                    {team.missing_daily} người chưa báo cáo
                  </span>
                </div>
                <StatusBadge label={team.reason} tone="error" />
              </div>
            ))}
            {focus.teams_attention.length > teams.length ? (
              <Link to="/organization" className="text-helper text-text-link hover:underline">
                Xem thêm {focus.teams_attention.length - teams.length} Team
              </Link>
            ) : null}
          </>
        )}
      </div>
    </DashboardCard>
  );
}

function SystemFocusCard({ focus, size = "compact" }: { focus: SystemFocus; size?: TodaySize }) {
  const items: { label: string; value: number; danger?: boolean }[] = [
    { label: "Tài khoản bị khóa", value: focus.locked_accounts },
    { label: "Chưa gắn Team", value: focus.members_without_team },
    { label: "Chưa nối Telegram", value: focus.telegram_unlinked },
    { label: "Telegram lỗi", value: focus.telegram_failed, danger: true },
    { label: "Tin chờ gửi", value: focus.outbox_pending },
    { label: "Tin gửi lỗi", value: focus.outbox_failed, danger: true },
    { label: "Thông báo quá hạn", value: focus.announcements_overdue, danger: true },
  ];
  return (
    <DashboardCard
      size={size}
      icon={ServerCog}
      title="Tình trạng hệ thống"
      to="/settings"
      actionLabel="Mở Cài đặt"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <Stat
            key={item.label}
            label={item.label}
            value={item.value}
            {...(item.danger && item.value > 0 ? { tone: "danger" as const } : {})}
          />
        ))}
      </div>
    </DashboardCard>
  );
}
