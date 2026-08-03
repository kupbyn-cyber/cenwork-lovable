import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DailyReportPreviewModal } from "@/components/report/daily-report-preview-modal";
import { DailyActionHub } from "@/components/home/daily-action-hub";
import { QuickActions } from "@/components/home/quick-actions";
import { RoleInsights } from "@/components/home/role-insights";
import {
  DashboardCard,
  TodayDashboardLayout,
  TodayGrid,
  TodayKpiRow,
  TodaySlot,
} from "@/components/home/today-layout";

import { PendingAnnouncementsPanel } from "@/components/announcement/pending-announcements-panel";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useTodayHub } from "@/hooks/use-today-hub";
import { useTodayInsights } from "@/hooks/use-today-insights";
import { formatHanoiDate } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";

import { isProjectApproved, projectsQuery } from "@/lib/project-data";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  dailyReportsQuery,
  hanoiToday,
  mustSubmitDaily,
  weekStartOf,
  weeklyReportsQuery,
} from "@/lib/report-data";
import { isTaskOverdue, tasksQuery } from "@/lib/task-data";

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

const ACTIVE_PROJECT_STATUSES = ["planning", "in_progress", "pending_acceptance"] as const;
const PENDING_PROJECT_STATUSES = ["leader_review", "proposal"] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị hệ thống",
  cmo: "CMO",
  leader: "Leader",
  member: "Thành viên",
};

/** Lời chào theo giờ Hà Nội — chỉ hiển thị, không ảnh hưởng dữ liệu. */
function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

const METRIC_TONE = {
  brand: "before:bg-brand-primary",
  yellow: "before:bg-accent-yellow",
  orange: "before:bg-accent-orange",
  danger: "before:bg-state-danger",
} as const;

function Metric({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: keyof typeof METRIC_TONE;
}) {
  return (
    <Card
      density="compact"
      className={`relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${METRIC_TONE[tone]}`}
    >
      <CardContent className="flex flex-col gap-1 pt-(--card-pad) pl-4">
        <span className="text-caption tracking-[0.12em] text-text-muted uppercase">{label}</span>
        <span className="cen-kpi text-text-primary">{value}</span>
        {hint ? <span className="min-w-0 text-helper text-text-muted">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

/**
 * TODAY-R01 — CEN Today theo vai trò.
 * Chỉ đổi cách hiển thị: dữ liệu vẫn lấy từ đúng các query/permission sẵn có.
 */
function Dashboard() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const [dailyOpen, setDailyOpen] = React.useState(false);

  const hub = useTodayHub();
  const insights = useTodayInsights();
  const projectsResult = useQuery(projectsQuery());
  const tasksResult = useQuery(tasksQuery());
  const dailyResult = useQuery(dailyReportsQuery());
  const weeklyResult = useQuery(weeklyReportsQuery());
  const membersResult = useQuery(membersQuery());
  const teamsResult = useQuery(teamsQuery());

  const today = hanoiToday();
  const thisWeek = weekStartOf(today);

  const projects = projectsResult.data ?? [];
  const tasks = (tasksResult.data ?? []).filter((task) => !task.is_archived);
  const dailies = dailyResult.data ?? [];
  const weeklies = weeklyResult.data ?? [];

  const overdue = tasks.filter(isTaskOverdue);
  const inReview = tasks.filter((task) => task.status === "review");
  const activeProjects = projects.filter((project) =>
    ACTIVE_PROJECT_STATUSES.includes(project.status as (typeof ACTIVE_PROJECT_STATUSES)[number]),
  );
  const approvedProjects = projects.filter(isProjectApproved);
  const pendingProjects = projects.filter((project) =>
    PENDING_PROJECT_STATUSES.includes(project.status as (typeof PENDING_PROJECT_STATUSES)[number]),
  );

  const myTodayReport = dailies.find(
    (row) => row.author_id === access.userId && row.report_date === today,
  );
  const pendingDaily = dailies.filter((row) => row.status === "submitted");
  const pendingWeekly = weeklies.filter((row) => row.status === "submitted");
  const myWeekly = weeklies.find(
    (row) => row.team_id === access.leaderTeamId && row.week_start === thisWeek,
  );

  const canSubmitDaily = access.can("reports.submit_daily");
  const dailyDraft =
    myTodayReport &&
    (myTodayReport.status === "draft" || myTodayReport.status === "changes_requested")
      ? myTodayReport
      : null;
  const dailySent = Boolean(myTodayReport && !dailyDraft);
  const dailyActionLabel = dailyResult.isLoading
    ? "Đang kiểm tra báo cáo…"
    : dailySent
      ? "Xem báo cáo hôm nay"
      : dailyDraft
        ? "Xem và gửi báo cáo"
        : "Gửi báo cáo ngày";

  const me = (membersResult.data ?? []).find((member) => member.id === access.userId);
  const myTeamName =
    (teamsResult.data ?? []).find((team) => team.id === me?.primary_team_id)?.name ??
    "Chưa gắn Team";

  function openDailyAction() {
    if (myTodayReport && !dailyDraft) {
      void navigate({
        to: "/reports/daily/$reportId",
        params: { reportId: myTodayReport.id },
      });
      return;
    }
    setDailyOpen(true);
  }

  const hubTotal = hub.data?.total ?? 0;
  const criticalCount = hub.data?.counts.critical ?? 0;
  const teamFocus = insights.data?.team ?? null;
  const myFocus = insights.data?.me ?? null;
  const roleLabel = access.role ? (ROLE_LABEL[access.role] ?? access.role) : "—";

  /** Dải ưu tiên: tối đa 4 thẻ, nội dung theo vai trò. */
  const metrics: React.ComponentProps<typeof Metric>[] = access.isSystemAdmin
    ? [
        {
          label: "Việc cần xử lý",
          value: hubTotal,
          tone: "brand",
          hint: `${criticalCount} mục khẩn cấp`,
        },
        {
          label: "Quá hạn toàn hệ thống",
          value: overdue.length,
          tone: "danger",
          hint: "Công việc đã trễ deadline",
        },
        {
          label: "Chờ duyệt",
          value: inReview.length + pendingProjects.length + pendingDaily.length + pendingWeekly.length,
          tone: "yellow",
          hint: `${pendingProjects.length} dự án · ${pendingDaily.length + pendingWeekly.length} báo cáo`,
        },
        {
          label: "Dự án đang triển khai",
          value: activeProjects.length,
          tone: "orange",
          hint: `${approvedProjects.length} dự án đã duyệt`,
        },
      ]
    : access.isLeader
      ? [
          {
            label: "Việc cần xử lý",
            value: hubTotal,
            tone: "brand",
            hint: `${criticalCount} mục khẩn cấp`,
          },
          {
            label: "Quá hạn của Team",
            value: teamFocus?.overdue_tasks ?? 0,
            tone: "danger",
            hint: teamFocus ? `Team ${teamFocus.team_name}` : "Chưa gắn Team",
          },
          {
            label: "Chờ bạn kiểm tra",
            value: teamFocus?.pending_reviews ?? 0,
            tone: "yellow",
            hint: "Công việc ở trạng thái kiểm tra",
          },
          {
            label: "Chưa gửi báo cáo ngày",
            value: teamFocus?.missing_daily.length ?? 0,
            tone: "orange",
            hint: "Thành viên trong Team",
          },
        ]
      : [
          {
            label: "Việc cần xử lý",
            value: hubTotal,
            tone: "brand",
            hint: `${criticalCount} mục khẩn cấp`,
          },
          {
            label: "Việc của tôi quá hạn",
            value: myFocus?.overdue_tasks ?? 0,
            tone: "danger",
            hint: "Cần xử lý ngay",
          },
          {
            label: "Đến hạn hôm nay",
            value: myFocus?.due_today ?? 0,
            tone: "yellow",
            hint: `${myFocus?.open_tasks ?? 0} việc đang mở`,
          },
          {
            label: "Hoàn thành tuần này",
            value: myFocus?.done_this_week ?? 0,
            tone: "orange",
            hint: "Công việc đã xong",
          },
        ];

  const initialLoading = access.loading || (hub.isLoading && insights.isLoading);

  if (initialLoading) {
    return (
      <TodayDashboardLayout>
        <TodayKpiRow>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </TodayKpiRow>
        <SkeletonCard lines={5} />
      </TodayDashboardLayout>
    );
  }

  return (
    <TodayDashboardLayout>
      {/* Header gọn: lời chào, ngày, vai trò */}
      <section className="cen-hero-surface cen-hairlines rounded-container border border-border-default px-4 py-4 shadow-level-2 sm:px-5">
        <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-h2 font-semibold text-text-primary">
              {greeting()}, {me?.display_name ?? "bạn"}
            </h1>
            <p className="mt-0.5 truncate text-helper text-text-secondary">
              Hôm nay {formatHanoiDate(today)}
            </p>
          </div>
          <StatusBadge label={roleLabel} tone="neutral" />
        </div>
      </section>

      <TodayKpiRow>
        {metrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </TodayKpiRow>

      {canSubmitDaily && dailyResult.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-state-danger/40 bg-surface-subtle p-3">
          <span className="text-body text-state-danger">
            Không kiểm tra được báo cáo hôm nay của bạn.
          </span>
          <Button variant="secondary" size="sm" onClick={() => void dailyResult.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : null}

      <TodayGrid>
        {/* Khối chính: việc cần xử lý ngay, đã sắp theo mức khẩn cấp */}
        <DailyActionHub limit={8} />

        <QuickActions />

        {/* Khối phụ theo vai trò: Member → việc của tôi, Leader → Team, Admin/CMO → hệ thống */}
        <RoleInsights flow />

        <DashboardCard size="compact" icon={FileText} title="Báo cáo của tôi" to="/reports">
          {mustSubmitDaily({
            userId: access.userId,
            role: access.role,
            leaderTeamId: access.leaderTeamId,
          }) ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body text-text-secondary">Báo cáo ngày:</span>
              {myTodayReport ? (
                <StatusBadge
                  label={REPORT_STATUS_LABEL[myTodayReport.status]}
                  tone={REPORT_STATUS_TONE[myTodayReport.status]}
                />
              ) : (
                <StatusBadge label="Chưa gửi" tone="warning" />
              )}
            </div>
          ) : null}

          {access.leaderTeamId ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body text-text-secondary">Báo cáo tuần của Team:</span>
              {myWeekly ? (
                <StatusBadge
                  label={REPORT_STATUS_LABEL[myWeekly.status]}
                  tone={REPORT_STATUS_TONE[myWeekly.status]}
                />
              ) : (
                <StatusBadge label="Chưa gửi" tone="warning" />
              )}
            </div>
          ) : null}

          {access.isSystemAdmin ? (
            <p className="text-helper text-text-muted">
              Chờ duyệt: {pendingDaily.length} báo cáo ngày · {pendingWeekly.length} báo cáo tuần.
            </p>
          ) : null}

          {canSubmitDaily ? (
            <Button
              className="mt-auto self-start"
              onClick={openDailyAction}
              loading={dailyResult.isLoading}
              disabled={
                dailyResult.isError || membersResult.isError || (!membersResult.isLoading && !me)
              }
            >
              <FileText />
              {dailyActionLabel}
            </Button>
          ) : null}
          {!membersResult.isLoading && !membersResult.isError && !me ? (
            <p className="text-helper text-state-danger">
              Tài khoản chưa được liên kết với hồ sơ thành viên.
            </p>
          ) : null}
        </DashboardCard>

        <TodaySlot size="full">
          <PendingAnnouncementsPanel />
        </TodaySlot>
      </TodayGrid>

      {canSubmitDaily && access.userId ? (
        <DailyReportPreviewModal
          open={dailyOpen}
          onOpenChange={setDailyOpen}
          authorId={access.userId}
          authorName={me?.display_name ?? "—"}
          teamId={me?.primary_team_id ?? null}
          teamName={myTeamName}
          reportDate={today}
          existingReportId={dailyDraft?.id ?? null}
          onSubmitted={(id) =>
            void navigate({ to: "/reports/daily/$reportId", params: { reportId: id } })
          }
        />
      ) : null}
    </TodayDashboardLayout>
  );
}
