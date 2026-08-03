import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiRow } from "@/components/dashboard/dashboard-shell";
import {
  AttentionPanel,
  MembersPanel,
  OpsAlertsPanel,
  PersonalProgressPanel,
  ProjectsPanel,
  QualityPanel,
  ReportsPanel,
  TeamAveragePanel,
  TeamComparePanel,
  TeamProjectsPanel,
  TrendPanel,
  WorkloadPanel,
} from "@/components/dashboard/dashboard-widgets";
import { getDashboard } from "@/lib/dashboard.functions";
import { DASH_PRESET_LABEL, type DashPreset } from "@/lib/dashboard";
import { hanoiToday, presetRange } from "@/lib/performance";

/**
 * DASH-CORE-01 — Dashboard hiệu suất dùng chung cho Admin/CMO, Leader và Member.
 * Cùng một khung: Header → 4 KPI → Xu hướng → Phân tích → Cần chú ý.
 * Khác biệt giữa vai trò chỉ nằm ở phạm vi dữ liệu và bộ KPI.
 * Dashboard chỉ để xem và điều hướng: mọi thao tác nằm ở trang chức năng.
 */
const TITLE = "Dashboard hiệu suất — CEN WORK";
const DESCRIPTION =
  "Theo dõi tiến độ, đúng hạn, chất lượng và tình trạng báo cáo theo đúng phạm vi vai trò, với bộ lọc thời gian giờ Hà Nội.";
const ALL_TEAMS = "__all__";
const PRESETS: DashPreset[] = ["today", "week", "month", "custom"];

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboard);
  const [preset, setPreset] = React.useState<DashPreset>("week");
  const initial = presetRange("week");
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [teamId, setTeamId] = React.useState<string>(ALL_TEAMS);

  function applyPreset(next: DashPreset) {
    setPreset(next);
    if (next !== "custom") {
      const range = presetRange(next);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const query = useQuery({
    queryKey: ["dashboard", from, to, teamId],
    queryFn: () =>
      fetchDashboard({
        data: { from, to, teamId: teamId === ALL_TEAMS ? null : teamId },
      }),
  });

  const data = query.data ?? null;
  const scope = data?.scope ?? null;
  const scopeLabel =
    scope === "org" ? "Toàn hệ thống" : scope === "team" ? "Team phụ trách" : "Cá nhân";

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Dashboard hiệu suất"
        description={DESCRIPTION}
        meta={
          data ? (
            <>
              <Badge variant="brand-subtle">Phạm vi: {scopeLabel}</Badge>
              <span className="text-xs text-text-muted">
                {data.period.from} → {data.period.to} (giờ Hà Nội)
              </span>
              {data.unavailable.length > 0 ? (
                <Badge variant="warning">
                  {data.unavailable.length} khối dữ liệu chưa sẵn sàng
                </Badge>
              ) : null}
            </>
          ) : null
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Làm mới
          </Button>
        }
      >
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {PRESETS.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={preset === item ? "primary" : "secondary"}
                onClick={() => applyPreset(item)}
              >
                {DASH_PRESET_LABEL[item]}
              </Button>
            ))}
            {preset === "custom" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  max={to}
                  aria-label="Từ ngày"
                  className="w-40"
                  onChange={(event) => setFrom(event.target.value || hanoiToday())}
                />
                <span className="text-text-muted">→</span>
                <Input
                  type="date"
                  value={to}
                  min={from}
                  aria-label="Đến ngày"
                  className="w-40"
                  onChange={(event) => setTo(event.target.value || hanoiToday())}
                />
              </div>
            ) : null}
          </div>
          {data && data.scope === "org" && data.teams.length > 0 ? (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-full lg:w-56" aria-label="Lọc theo Team">
                <SelectValue placeholder="Tất cả Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TEAMS}>Tất cả Team</SelectItem>
                {data.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </PageHeader>

      {query.isError ? (
        <ErrorState
          title="Không tải được Dashboard"
          description={(query.error as Error).message}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <KpiRow kpis={data?.kpis ?? []} loading={query.isPending} />

      {data ? (
        <>
          <TrendPanel
            points={data.trend}
            granularity={data.granularity}
            title={
              data.scope === "member" ? "Xu hướng công việc của bạn" : "Xu hướng hoàn thành và đúng hạn"
            }
          />

          {data.scope === "org" ? (
            <>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.team_rows ? <TeamComparePanel rows={data.team_rows} from={from} to={to} /> : null}
                {data.workload ? <WorkloadPanel slices={data.workload} /> : null}
              </div>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.projects ? <ProjectsPanel projects={data.projects} /> : null}
                {data.quality ? <QualityPanel quality={data.quality} /> : null}
              </div>
              {data.reports ? (
                <ReportsPanel
                  reports={data.reports}
                  from={from}
                  to={to}
                  teamId={teamId === ALL_TEAMS ? null : teamId}
                />
              ) : null}
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.ops_alerts ? <OpsAlertsPanel alerts={data.ops_alerts} /> : null}
                <AttentionPanel items={data.attention} title="Công việc cần chú ý" />
              </div>
            </>
          ) : null}

          {data.scope === "team" ? (
            <>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.member_rows ? <MembersPanel rows={data.member_rows} /> : null}
                {data.projects ? <TeamProjectsPanel projects={data.projects} /> : null}
              </div>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.quality ? <QualityPanel quality={data.quality} /> : null}
                {data.reports ? (
                  <ReportsPanel
                    reports={data.reports}
                    from={from}
                    to={to}
                    teamId={data.selected_team_id}
                  />
                ) : null}
              </div>
              <AttentionPanel items={data.attention} title="Công việc của Team cần chú ý" />
            </>
          ) : null}

          {data.scope === "member" ? (
            <>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {data.personal ? <PersonalProgressPanel personal={data.personal} /> : null}
                {data.personal ? (
                  <TeamAveragePanel average={data.team_average} personal={data.personal} />
                ) : null}
              </div>
              {data.quality ? <QualityPanel quality={data.quality} /> : null}
              <AttentionPanel items={data.attention} title="Việc của bạn cần chú ý" />
            </>
          ) : null}

          <p className="text-xs text-text-muted">
            Số liệu tính theo giờ Hà Nội, cập nhật lúc{" "}
            {new Date(data.generated_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.
            Dashboard chỉ hiển thị và điều hướng; mọi thao tác thực hiện tại trang chức năng.
          </p>
        </>
      ) : null}
    </div>
  );
}
