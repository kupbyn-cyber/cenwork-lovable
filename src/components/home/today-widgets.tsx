import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  FileText,
  Gauge,
  Sparkles,
  Users,
} from "lucide-react";
import type { LinkProps } from "@tanstack/react-router";

import { DashboardCard } from "@/components/home/today-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RecognitionRow } from "@/lib/recognition-data";
import { RECOGNITION_CATEGORY_META } from "@/lib/recognition-data";
import type { MarketingFocus } from "@/lib/today-insights";
import { formatPercent } from "@/lib/today-insights";
import type { TeamFocus } from "@/lib/today-insights";
import { OPS_ALERT_VISIBLE, type OpsAlert } from "@/lib/ops-alerts";
import type { TodayMetrics } from "@/lib/today-metrics";
import { RANGE_PHRASE, type TodayRange } from "@/lib/today-range";

/**
 * TODAY-RESET-01 — Hàng 4: ba widget theo vai trò, tối đa 4 chỉ số hoặc 4 dòng.
 * Mọi số liệu lấy từ lớp dữ liệu sẵn có; "Xem thêm" dẫn sang route gốc.
 */
function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption tracking-[0.1em] text-text-muted uppercase">{label}</span>
      <span
        className={
          danger
            ? "text-h3 font-semibold tabular-nums text-state-danger"
            : "text-h3 font-semibold tabular-nums text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function MyWorkWidget({ metrics }: { metrics: TodayMetrics }) {
  return (
    <DashboardCard size="compact" icon={Activity} title="Việc của tôi" to="/tasks" className="h-full">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Đang mở" value={metrics.open_count} />
        <Stat label="Quá hạn" value={metrics.overdue_count} danger={metrics.overdue_count > 0} />
        <Stat label="Đến hạn" value={metrics.due_in_range_count} />
        <Stat label="Cần xử lý" value={metrics.pending_action_count} />
      </div>
    </DashboardCard>
  );
}

export function PersonalProgressWidget({
  metrics,
  range,
}: {
  metrics: TodayMetrics;
  range: TodayRange;
}) {
  const total = metrics.completed_in_range_count + metrics.open_count;
  const percent = total === 0 ? 0 : Math.round((metrics.completed_in_range_count / total) * 100);
  return (
    <DashboardCard
      size="compact"
      icon={Gauge}
      title="Tiến độ cá nhân"
      to="/tasks"
      className="h-full"
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label={`Hoàn thành ${RANGE_PHRASE[range]}`} value={metrics.completed_in_range_count} />
        <Stat label="Tỷ lệ hoàn thành" value={`${percent}%`} />
        <Stat label="Còn lại" value={metrics.open_count} />
        <Stat label="Quá hạn" value={metrics.overdue_count} danger={metrics.overdue_count > 0} />
      </div>
      <div className="mt-auto h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div className="h-full bg-brand-primary" style={{ width: `${percent}%` }} />
      </div>
    </DashboardCard>
  );
}

export function RecognitionWidget({ rows }: { rows: RecognitionRow[] }) {
  const preview = rows.slice(0, 4);
  return (
    <DashboardCard
      size="compact"
      icon={Sparkles}
      title="Ghi nhận đồng đội"
      to="/recognitions"
      className="h-full"
    >
      {preview.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Chưa có ghi nhận mới"
          description="Hãy dành lời ghi nhận cho đồng đội của bạn."
        />
      ) : (
        preview.map((row) => (
          <div key={row.id} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true">{RECOGNITION_CATEGORY_META[row.category]?.emoji ?? "⭐"}</span>
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">
              {row.sender?.display_name ?? "Ai đó"} → {row.receiver?.display_name ?? "—"}
            </span>
          </div>
        ))
      )}
    </DashboardCard>
  );
}

export function TeamHealthWidget({ team }: { team: TeamFocus | null }) {
  return (
    <DashboardCard
      size="compact"
      icon={Users}
      title={team ? `Sức khỏe Team ${team.team_name}` : "Sức khỏe Team"}
      to="/organization"
      className="h-full"
    >
      {team ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Thành viên" value={team.member_count} />
            <Stat label="Việc đang mở" value={team.open_tasks} />
            <Stat label="Quá hạn" value={team.overdue_tasks} danger={team.overdue_tasks > 0} />
            <Stat label="Chờ kiểm tra" value={team.pending_reviews} />
          </div>
          {team.missing_daily.length > 0 ? (
            <span className="text-helper text-text-muted">
              {team.missing_daily.length} thành viên chưa gửi báo cáo ngày.
            </span>
          ) : null}
        </>
      ) : (
        <EmptyState
          variant="compact"
          title="Chưa có dữ liệu Team"
          description="Bạn chưa phụ trách Team nào."
        />
      )}
    </DashboardCard>
  );
}

export function ReportStatusWidget({
  pendingDaily,
  pendingWeekly,
  missingDaily,
  range,
}: {
  pendingDaily: number;
  pendingWeekly: number;
  missingDaily: number;
  range: TodayRange;
}) {
  return (
    <DashboardCard
      size="compact"
      icon={FileText}
      title="Tình trạng báo cáo"
      to="/reports"
      className="h-full"
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Báo cáo ngày chờ duyệt" value={pendingDaily} />
        <Stat label="Báo cáo tuần chờ duyệt" value={pendingWeekly} />
        <Stat label="Chưa gửi báo cáo" value={missingDaily} danger={missingDaily > 0} />
        <Stat label="Phạm vi" value={RANGE_PHRASE[range]} />
      </div>
    </DashboardCard>
  );
}

/** Sức khỏe Team ở góc nhìn toàn hệ thống (Admin/CMO). */
export function MarketingHealthWidget({ marketing }: { marketing: MarketingFocus | null }) {
  return (
    <DashboardCard
      size="compact"
      icon={Users}
      title="Sức khỏe Team"
      to="/organization"
      className="h-full"
    >
      {marketing ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Tổng số Team" value={marketing.total_teams} />
            <Stat
              label="Team cần chú ý"
              value={marketing.teams_attention.length}
              danger={marketing.teams_attention.length > 0}
            />
            <Stat
              label="Việc quá hạn"
              value={marketing.overdue_tasks}
              danger={marketing.overdue_tasks > 0}
            />
            <Stat label="Tỷ lệ báo cáo ngày" value={formatPercent(marketing.daily_report_rate)} />
          </div>
          {marketing.teams_attention.length > 0 ? (
            <span className="min-w-0 truncate text-helper text-text-muted">
              Cần chú ý: {marketing.teams_attention.slice(0, 3).map((t) => t.team_name).join(", ")}
            </span>
          ) : null}
        </>
      ) : (
        <EmptyState variant="compact" title="Chưa có dữ liệu Team" />
      )}
    </DashboardCard>
  );
}

/**
 * TODAY-ALERTS-01 — cảnh báo điều hành (Task/Dự án/Team/Nhân sự) cho Admin & CMO.
 * Cảnh báo kỹ thuật (Telegram, outbox, tài khoản chưa gắn Team) giữ tại Cài đặt → Tình trạng hệ thống.
 */
export function SystemAlertsWidget({ alerts }: { alerts: OpsAlert[] }) {
  const visible = alerts.slice(0, OPS_ALERT_VISIBLE);
  const rest = alerts.length - visible.length;

  return (
    <DashboardCard
      size="compact"
      icon={AlertTriangle}
      title="Cảnh báo cần chú ý"
      to="/performance"
      actionLabel="Mở Hiệu suất"
      className="h-full"
    >
      {visible.length === 0 ? (
        <p className="text-body text-text-secondary">
          Không có cảnh báo cần chú ý. Công việc và nhân sự đang vận hành ổn định.
        </p>
      ) : (
        <>
          {visible.map((alert) => {
            const linkProps = {
              to: alert.to,
              ...(alert.params ? { params: alert.params } : {}),
            } as unknown as LinkProps;
            return (
              <Link
                key={alert.id}
                {...linkProps}
                className="cen-transition flex min-w-0 items-start justify-between gap-2 rounded-card border border-border-default bg-surface px-3 py-2 hover:border-border-strong"
              >
                <span className="min-w-0 flex-1 text-body text-text-primary">
                  <span className="font-medium">{alert.subject}</span> {alert.detail}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {alert.current ? <StatusBadge label="Hiện tại" tone="neutral" /> : null}
                  {alert.magnitude > 0 ? (
                    <StatusBadge label={String(alert.magnitude)} tone="error" />
                  ) : null}
                </span>
              </Link>
            );
          })}
          {rest > 0 ? (
            <span className="text-helper text-text-muted">Còn {rest} cảnh báo khác</span>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}
