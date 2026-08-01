import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusDistributionChart, TrendChart } from "@/components/performance/performance-charts";
import {
  DeltaText,
  MetricCard,
  PanelCard,
} from "@/components/performance/performance-primitives";
import { PeopleTable, TeamDetails } from "@/components/performance/performance-tables";
import { getPerformanceDashboard } from "@/lib/performance.functions";
import {
  METRIC_TOOLTIP,
  formatHours,
  formatPercent,
  hanoiToday,
  presetRange,
  type PerfPreset,
} from "@/lib/performance";

/**
 * PERFORMANCE — Dashboard hiệu suất nhân sự và Team.
 * Dữ liệu thật từ Task, Report, Recognition và MVP; phạm vi do server + RLS quyết định.
 * Không có điểm tổng hợp và không xếp hạng nhân sự.
 */
const ALL = "__all__";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Dashboard hiệu suất — CEN WORK" },
      {
        name: "description",
        content:
          "Theo dõi khối lượng, tiến độ, đúng hạn, chất lượng và tình trạng báo cáo của nhân sự và Team bằng dữ liệu thật trong CEN WORK.",
      },
      { property: "og:title", content: "Dashboard hiệu suất — CEN WORK" },
      {
        property: "og:description",
        content:
          "Theo dõi khối lượng, tiến độ, đúng hạn, chất lượng và tình trạng báo cáo của nhân sự và Team bằng dữ liệu thật.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const fetchDashboard = useServerFn(getPerformanceDashboard);
  const [preset, setPreset] = React.useState<PerfPreset>("week");
  const initial = presetRange("week");
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [teamId, setTeamId] = React.useState<string>(ALL);
  const [userId, setUserId] = React.useState<string>(ALL);

  function applyPreset(next: PerfPreset) {
    setPreset(next);
    if (next !== "custom") {
      const range = presetRange(next);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const query = useQuery({
    queryKey: ["performance", from, to, teamId, userId],
    queryFn: () =>
      fetchDashboard({
        data: {
          from,
          to,
          teamId: teamId === ALL ? null : teamId,
          userId: userId === ALL ? null : userId,
        },
      }),
  });

  const data = query.data;
  const canFilterTeam = data ? data.scope === "org" : false;
  const totals = data?.totals;
  const previous = data?.previous_totals;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Dashboard hiệu suất"
        description="Theo dõi khối lượng, tiến độ, đúng hạn, chất lượng và tình trạng báo cáo bằng dữ liệu thật. Không có điểm tổng hợp và không xếp hạng nhân sự."
      />

      <Card className="min-w-0">
        <CardContent className="flex min-w-0 flex-wrap items-end gap-3 pt-(--card-pad)">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", "Hôm nay"],
                ["week", "Tuần này"],
                ["month", "Tháng này"],
                ["custom", "Tùy chọn"],
              ] as Array<[PerfPreset, string]>
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => applyPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <label className="text-xs text-text-muted">
              Từ ngày
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(event) => {
                  setPreset("custom");
                  setFrom(event.target.value || hanoiToday());
                }}
                className="mt-1 w-[150px]"
              />
            </label>
            <label className="text-xs text-text-muted">
              Đến ngày
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(event) => {
                  setPreset("custom");
                  setTo(event.target.value || hanoiToday());
                }}
                className="mt-1 w-[150px]"
              />
            </label>
          </div>

          {canFilterTeam ? (
            <label className="text-xs text-text-muted">
              Team
              <Select
                value={teamId}
                onValueChange={(value) => {
                  setTeamId(value);
                  setUserId(ALL);
                }}
              >
                <SelectTrigger className="mt-1 w-[180px]">
                  <SelectValue placeholder="Tất cả Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả Team</SelectItem>
                  {(data?.teams ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <label className="text-xs text-text-muted">
            Nhân sự
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="mt-1 w-[200px]">
                <SelectValue placeholder="Tất cả nhân sự" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả nhân sự</SelectItem>
                {(data?.people ?? []).map((person) => (
                  <SelectItem key={person.user_id} value={person.user_id}>
                    {person.is_self ? `${person.display_name} (bạn)` : person.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Không tải được dữ liệu hiệu suất"
          description="Kiểm tra kết nối hoặc thử lại. Nếu vẫn lỗi, liên hệ quản trị hệ thống."
          onRetry={() => void query.refetch()}
        />
      ) : !data || data.people.length === 0 ? (
        <EmptyState
          title="Chưa có nhân sự trong phạm vi được xem"
          description="Dashboard chỉ hiển thị nhân sự có Team chính thuộc phạm vi bạn được phép xem."
        />
      ) : (
        <>
          <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Task phụ trách chính"
              hint={METRIC_TOOLTIP.primary}
              value={String(totals?.workload.primary ?? 0)}
              sub={`Phối hợp riêng: ${totals?.workload.collaborating ?? 0}`}
              delta={
                <DeltaText
                  current={totals?.workload.primary ?? null}
                  previous={previous?.workload.primary ?? null}
                />
              }
            />
            <MetricCard
              label="Hoàn thành"
              hint={METRIC_TOOLTIP.done}
              value={String(totals?.workload.done ?? 0)}
              sub={`Hoàn thành trễ: ${totals?.workload.late_done ?? 0}`}
              tone="success"
              delta={
                <DeltaText
                  current={totals?.workload.done ?? null}
                  previous={previous?.workload.done ?? null}
                />
              }
            />
            <MetricCard
              label="Quá hạn"
              hint={METRIC_TOOLTIP.overdue}
              value={String(totals?.workload.overdue ?? 0)}
              sub={`Tồn từ kỳ trước: ${totals?.workload.carried_over ?? 0}`}
              tone={totals && totals.workload.overdue > 0 ? "error" : "default"}
              delta={
                <DeltaText
                  current={totals?.workload.overdue ?? null}
                  previous={previous?.workload.overdue ?? null}
                  invert
                />
              }
            />
            <MetricCard
              label="Project tham gia"
              hint={METRIC_TOOLTIP.projects}
              value={String(totals?.workload.projects ?? 0)}
            />
            <MetricCard
              label="Tỷ lệ hoàn thành"
              hint={METRIC_TOOLTIP.completion_rate}
              value={formatPercent(totals?.efficiency.completion_rate ?? null)}
              delta={
                <span className="text-text-muted">
                  Kỳ trước {formatPercent(previous?.efficiency.completion_rate ?? null)}
                </span>
              }
            />
            <MetricCard
              label="Tỷ lệ đúng hạn"
              hint={METRIC_TOOLTIP.on_time_rate}
              value={formatPercent(totals?.efficiency.on_time_rate ?? null)}
              delta={
                <span className="text-text-muted">
                  Kỳ trước {formatPercent(previous?.efficiency.on_time_rate ?? null)}
                </span>
              }
            />
            <MetricCard
              label="Tỷ lệ quá hạn"
              hint={METRIC_TOOLTIP.overdue_rate}
              value={formatPercent(totals?.efficiency.overdue_rate ?? null)}
              delta={
                <span className="text-text-muted">
                  Kỳ trước {formatPercent(previous?.efficiency.overdue_rate ?? null)}
                </span>
              }
            />
            <MetricCard
              label="Thời gian hoàn thành TB"
              hint={METRIC_TOOLTIP.avg_completion_hours}
              value={formatHours(totals?.efficiency.avg_completion_hours ?? null)}
              delta={
                <span className="text-text-muted">
                  Kỳ trước {formatHours(previous?.efficiency.avg_completion_hours ?? null)}
                </span>
              }
            />
          </section>

          {totals?.reports ? (
            <PanelCard
              title="Tình trạng báo cáo"
              hint="Tính từ nghĩa vụ báo cáo có hạn nộp trong kỳ; chỉ gồm nhân sự bạn được phép xem dữ liệu này."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  label="Phải gửi"
                  hint={METRIC_TOOLTIP.reports_required}
                  value={String(totals.reports.required)}
                />
                <MetricCard
                  label="Đã gửi"
                  hint={METRIC_TOOLTIP.reports_submitted}
                  value={String(totals.reports.submitted)}
                />
                <MetricCard
                  label="Đúng hạn"
                  hint={METRIC_TOOLTIP.reports_on_time}
                  value={String(totals.reports.on_time)}
                  tone="success"
                />
                <MetricCard
                  label="Muộn hoặc thiếu"
                  hint={METRIC_TOOLTIP.reports_late}
                  value={String(totals.reports.late_or_missing)}
                  tone={totals.reports.late_or_missing > 0 ? "warning" : "default"}
                />
                <MetricCard
                  label="Bị yêu cầu chỉnh sửa"
                  hint={METRIC_TOOLTIP.reports_revision}
                  value={String(totals.reports.revision_required)}
                />
              </div>
            </PanelCard>
          ) : null}

          <section className="grid min-w-0 gap-4 xl:grid-cols-2">
            <TrendChart trend={data.trend} />
            <StatusDistributionChart workload={data.totals.workload} />
          </section>

          {data.alerts.length > 0 ? (
            <PanelCard
              title="Cảnh báo cần chú ý"
              hint="Mô tả tình trạng dữ liệu trong kỳ (quá hạn, khối lượng cao, thiếu báo cáo). Không phải đánh giá nhân sự."
            >
              <ul className="space-y-2">
                {data.alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex items-start gap-2 rounded-control border border-border-default p-2.5 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-state-warning" aria-hidden />
                    <span>
                      <span className="font-medium">{alert.title}</span>
                      <span className="block text-xs text-text-muted">{alert.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </PanelCard>
          ) : null}

          <TeamDetails teams={data.team_details} />

          <PeopleTable people={data.people} />

          {data.unavailable.length > 0 ? (
            <p className="text-xs text-text-muted">
              Một số nguồn dữ liệu không đọc được trong phạm vi hiện tại: {data.unavailable.join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
