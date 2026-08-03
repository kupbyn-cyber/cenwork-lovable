import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SkeletonCard } from "@/components/ui/skeleton";
import { ActionQueueCard } from "@/components/home/action-queue-card";
import { QuickActions } from "@/components/home/quick-actions";
import { TodayBanner } from "@/components/home/today-banner";
import { buildKpis, TodayKpiRow } from "@/components/home/today-kpis";
import {
  MarketingHealthWidget,
  MyWorkWidget,
  PersonalProgressWidget,
  RecognitionWidget,
  ReportStatusWidget,
  SystemAlertsWidget,
  TeamHealthWidget,
} from "@/components/home/today-widgets";
import { TodayRangeProvider, useTodayRange } from "@/hooks/use-today-range";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useTodayHub } from "@/hooks/use-today-hub";
import { useTodayInsights } from "@/hooks/use-today-insights";
import { membersQuery } from "@/lib/org-data";
import { projectsQuery } from "@/lib/project-data";
import { recognitionsQuery } from "@/lib/recognition-data";
import { dailyReportsQuery, hanoiToday, weeklyReportsQuery } from "@/lib/report-data";
import { tasksQuery } from "@/lib/task-data";
import {
  buildTodayMetrics,
  buildTodayPrompt,
  scopeActionItems,
  type TodayScope,
  type TodayViewRole,
} from "@/lib/today-metrics";
import { inRange } from "@/lib/today-range";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "CEN WORK — Marketing Command Center" },
      {
        name: "description",
        content:
          "CEN WORK là hệ thống Marketing Command Center: tổng quan dự án, công việc và tình trạng báo cáo.",
      },
      { property: "og:title", content: "CEN WORK — Marketing Command Center" },
      {
        property: "og:description",
        content:
          "CEN WORK là hệ thống Marketing Command Center: tổng quan dự án, công việc và tình trạng báo cáo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

/**
 * TODAY-RESET-01 — CEN Today gồm đúng 4 hàng:
 * banner → 4 KPI → (việc cần xử lý 2/3 + hành động nhanh 1/3) → 3 widget theo vai trò.
 * Một state phạm vi thời gian duy nhất điều khiển toàn bộ số liệu bên dưới.
 */
function Dashboard() {
  return (
    <TodayRangeProvider>
      <DashboardBody />
    </TodayRangeProvider>
  );
}

function DashboardBody() {
  const access = useOrgAccess();
  const { range, bounds } = useTodayRange();

  const hub = useTodayHub();
  const insights = useTodayInsights();
  const projectsResult = useQuery(projectsQuery());
  const tasksResult = useQuery(tasksQuery());
  const dailyResult = useQuery(dailyReportsQuery());
  const weeklyResult = useQuery(weeklyReportsQuery());
  const membersResult = useQuery(membersQuery());
  const recognitionsResult = useQuery(recognitionsQuery({ limit: 10 }));

  const today = hanoiToday();
  const viewRole: TodayViewRole = access.isSystemAdmin
    ? "admin"
    : access.isLeader
      ? "leader"
      : "member";
  const scope: TodayScope = {
    role: viewRole,
    userId: access.userId,
    leaderTeamId: access.leaderTeamId,
  };

  const actionItems = React.useMemo(
    () => scopeActionItems(hub.data?.items ?? [], bounds),
    [hub.data?.items, bounds],
  );

  const metrics = React.useMemo(
    () =>
      buildTodayMetrics({
        scope,
        bounds,
        tasks: tasksResult.data ?? [],
        projects: projectsResult.data ?? [],
        dailies: dailyResult.data ?? [],
        weeklies: weeklyResult.data ?? [],
        actionItems,
        todayDate: today,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      viewRole,
      access.userId,
      access.leaderTeamId,
      bounds,
      tasksResult.data,
      projectsResult.data,
      dailyResult.data,
      weeklyResult.data,
      actionItems,
      today,
    ],
  );

  const me = (membersResult.data ?? []).find((member) => member.id === access.userId);
  const prompt = buildTodayPrompt(metrics, range);

  const dailies = dailyResult.data ?? [];
  const weeklies = weeklyResult.data ?? [];
  const pendingDaily = dailies.filter(
    (row) => row.status === "submitted" && inRange(row.report_date, bounds),
  ).length;
  const pendingWeekly = weeklies.filter(
    (row) => row.status === "submitted" && inRange(row.submitted_at ?? null, bounds),
  ).length;
  const missingDaily = insights.data?.team?.missing_daily.length ?? 0;

  const recognitions = React.useMemo(
    () =>
      (recognitionsResult.data ?? []).filter(
        (row) => !row.revoked_at && inRange(row.created_at, bounds),
      ),
    [recognitionsResult.data, bounds],
  );

  if (access.loading || (hub.isLoading && insights.isLoading)) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <SkeletonCard lines={3} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={5} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Hàng 1 */}
      <TodayBanner name={me?.display_name ?? "bạn"} prompt={prompt} />

      {/* Hàng 2 */}
      <TodayKpiRow items={buildKpis(viewRole, metrics, range)} />

      {/* Hàng 3 */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <ActionQueueCard
          items={actionItems}
          total={actionItems.length}
          className="h-full lg:col-span-2"
        />
        <QuickActions className="h-full" />
      </div>

      {/* Hàng 4 */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {viewRole === "member" ? (
          <>
            <MyWorkWidget metrics={metrics} />
            <PersonalProgressWidget metrics={metrics} range={range} />
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <RecognitionWidget rows={recognitions} />
            </div>
          </>
        ) : viewRole === "leader" ? (
          <>
            <MyWorkWidget metrics={metrics} />
            <TeamHealthWidget team={insights.data?.team ?? null} />
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <ReportStatusWidget
                pendingDaily={pendingDaily}
                pendingWeekly={pendingWeekly}
                missingDaily={missingDaily}
                range={range}
              />
            </div>
          </>
        ) : (
          <>
            <SystemAlertsWidget system={insights.data?.system ?? null} />
            <MarketingHealthWidget marketing={insights.data?.marketing ?? null} />
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <ReportStatusWidget
                pendingDaily={pendingDaily}
                pendingWeekly={pendingWeekly}
                missingDaily={missingDaily}
                range={range}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
