import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SkeletonCard } from "@/components/ui/skeleton";
import { ActionQueueCard } from "@/components/home/action-queue-card";
import { QuickActions } from "@/components/home/quick-actions";
import { RecognitionReceivedCard } from "@/components/recognition/recognition-received-card";
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
import { useAuth, getDisplayName } from "@/hooks/use-auth";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useOpsAlerts } from "@/hooks/use-ops-alerts";
import { useTodayHub } from "@/hooks/use-today-hub";
import { useTodayInsights } from "@/hooks/use-today-insights";
import { recognitionsQuery } from "@/lib/recognition-data";
import {
  buildTodayPrompt,
  scopeActionItems,
  type TodayMetrics,
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
  const { user } = useAuth();
  const { range, bounds } = useTodayRange();

  const hub = useTodayHub();
  // PERF-02: KPI/widget đọc số tổng hợp từ server, không tải full danh sách về trình duyệt.
  const insights = useTodayInsights(range, bounds);
  const opsAlerts = useOpsAlerts(access.isSystemAdmin);
  // PERF-02.1: cache/refetch chỉ áp cho lần dùng ở Trang chủ, không đổi query dùng chung.
  const recognitionsResult = useQuery({
    ...recognitionsQuery({ limit: 10 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const viewRole: TodayViewRole = access.isSystemAdmin
    ? "admin"
    : access.isLeader
      ? "leader"
      : "member";

  const actionItems = React.useMemo(
    () => scopeActionItems(hub.data?.items ?? [], bounds),
    [hub.data?.items, bounds],
  );

  const summary = insights.data?.metrics;
  const metrics: TodayMetrics = React.useMemo(
    () => ({
      open_count: summary?.open_count ?? 0,
      active_projects: summary?.active_projects ?? 0,
      due_in_range_count: summary?.due_in_range_count ?? 0,
      overdue_count: summary?.overdue_count ?? 0,
      completed_in_range_count: summary?.completed_in_range_count ?? 0,
      pending_report_count: summary?.pending_report_count ?? 0,
      pending_action_count: actionItems.length,
    }),
    [summary, actionItems.length],
  );

  const displayName = insights.data?.display_name ?? getDisplayName(user);
  const prompt = buildTodayPrompt(metrics, range);

  const pendingDaily = insights.data?.reports.pending_daily ?? 0;
  const pendingWeekly = insights.data?.reports.pending_weekly ?? 0;
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
      <RecognitionReceivedCard userId={access.userId} />
      {/* Hàng 1 */}
      <TodayBanner name={displayName || "bạn"} prompt={prompt} />

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
            <SystemAlertsWidget alerts={opsAlerts.data?.alerts ?? []} />
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
