import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DailyReportPreviewModal } from "@/components/report/daily-report-preview-modal";
import { DailyActionHub } from "@/components/home/daily-action-hub";
import { QuickActions } from "@/components/home/quick-actions";
import { RoleInsights } from "@/components/home/role-insights";
import { ReportSummaryCards } from "@/components/home/report-summary-cards";

import { PendingAnnouncementsPanel } from "@/components/announcement/pending-announcements-panel";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import { membersQuery, teamsQuery } from "@/lib/org-data";

import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  isProjectApproved,
  projectsQuery,
  type ProjectStatus,
} from "@/lib/project-data";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  dailyReportsQuery,
  hanoiToday,
  mustSubmitDaily,
  weekStartOf,
  weeklyReportsQuery,
} from "@/lib/report-data";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_STATUS_TONE,
  formatDateTime,
  isTaskOverdue,
  tasksQuery,
  type TaskRow,
} from "@/lib/task-data";

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

const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = ["planning", "in_progress", "pending_acceptance"];

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
        {hint ? <span className="text-helper text-text-muted">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

const RANGE_OPTIONS = [
  { key: "today", label: "Hôm nay", days: 1 },
  { key: "week", label: "Tuần này", days: 7 },
  { key: "month", label: "Tháng này", days: 30 },
] as const;
type RangeKey = (typeof RANGE_OPTIONS)[number]["key"];


function Dashboard() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const [dailyOpen, setDailyOpen] = React.useState(false);
  const [range, setRange] = React.useState<RangeKey>("week");

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

  const myTasks = React.useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.assignee_id === access.userId ||
          (access.userId ? task.participantIds.includes(access.userId) : false),
      ),
    [tasks, access.userId],
  );

  const overdue = tasks.filter(isTaskOverdue);
  const dueToday = tasks.filter(
    (task) => task.status !== "done" && task.deadline.slice(0, 10) === today,
  );
  const inReview = tasks.filter((task) => task.status === "review");

  /** Bộ lọc thời gian chỉ ảnh hưởng hiển thị KPI, không đổi dữ liệu nguồn. */
  const rangeMeta = RANGE_OPTIONS.find((option) => option.key === range) ?? RANGE_OPTIONS[1];
  const rangeEnd = new Date(`${today}T00:00:00+07:00`);
  rangeEnd.setDate(rangeEnd.getDate() + rangeMeta.days);
  const dueInRange = tasks.filter(
    (task) =>
      task.status !== "done" &&
      task.deadline >= today &&
      new Date(task.deadline).getTime() < rangeEnd.getTime(),
  );


  const activeProjects = projects.filter((project) =>
    ACTIVE_PROJECT_STATUSES.includes(project.status),
  );
  /** Dự án chưa duyệt không được tính vào thống kê phạm vi. */
  const approvedProjects = projects.filter(isProjectApproved);

  const projectByStatus = React.useMemo(() => {
    const map = new Map<ProjectStatus, number>();
    for (const project of approvedProjects) {
      map.set(project.status, (map.get(project.status) ?? 0) + 1);
    }
    return map;
  }, [approvedProjects]);

  const taskByStatus = React.useMemo(() => {
    const map = new Map<TaskRow["status"], number>();
    for (const task of tasks) map.set(task.status, (map.get(task.status) ?? 0) + 1);
    return map;
  }, [tasks]);

  const myTodayReport = dailies.find(
    (row) => row.author_id === access.userId && row.report_date === today,
  );
  const todayReports = dailies.filter((row) => row.report_date === today);
  const pendingDaily = dailies.filter((row) => row.status === "submitted");
  const pendingWeekly = weeklies.filter((row) => row.status === "submitted");
  const myWeekly = weeklies.find(
    (row) => row.team_id === access.leaderTeamId && row.week_start === thisWeek,
  );

  /**
   * Hành động nhanh Báo cáo ngày: nhãn và đích đến bám theo trạng thái báo cáo
   * hôm nay của chính người dùng. Không tạo bản ghi khi chỉ mở bản xem trước.
   */
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

  const loading = projectsResult.isLoading || tasksResult.isLoading || weeklyResult.isLoading;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="cen-hero-surface cen-hairlines rounded-container border border-border-default shadow-level-2">
        <div className="relative z-10 flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <img src="/brand/logo-mark.svg" alt="" aria-hidden className="size-6 object-contain" />
              <span className="text-caption tracking-[0.24em] text-accent-yellow/80 uppercase">
                Marketing Command Center
              </span>
            </div>
            <h1 className="mt-2 text-h1 font-semibold text-text-primary">
              {greeting()}, {me?.display_name ?? "bạn"}
            </h1>
            <p className="mt-1 max-w-2xl text-body text-text-secondary">
              Hôm nay {formatHanoiDate(today)} · Tổng quan việc cần xử lý, dự án, công việc và báo
              cáo trong phạm vi bạn được xem.
            </p>
          </div>

          <div
            role="group"
            aria-label="Bộ lọc thời gian"
            className="flex shrink-0 gap-1 self-start rounded-control border border-border-default bg-background/60 p-1 backdrop-blur lg:self-auto"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={range === option.key}
                onClick={() => setRange(option.key)}
                className={
                  range === option.key
                    ? "cen-transition rounded-badge bg-brand-primary px-3 py-1.5 text-label font-medium text-brand-foreground"
                    : "cen-transition rounded-badge px-3 py-1.5 text-label text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Dự án đang triển khai"
          value={activeProjects.length}
          hint={`${approvedProjects.length} dự án đã duyệt trong phạm vi`}
        />
        <Metric
          label="Công việc cần xử lý"
          value={myTasks.filter((task) => task.status !== "done").length}
          tone="yellow"
          hint={`${dueToday.length} việc đến hạn hôm nay`}
        />
        <Metric
          label={`Đến hạn · ${rangeMeta.label}`}
          value={dueInRange.length}
          tone="orange"
          hint="Theo bộ lọc thời gian đang chọn"
        />
        <Metric
          label="Công việc quá hạn"
          value={overdue.length}
          tone="danger"
          hint={`${inReview.length} nội dung chờ duyệt`}
        />
      </div>

      <DailyActionHub />
      <QuickActions />
      <RoleInsights />
      <ReportSummaryCards />

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

      <PendingAnnouncementsPanel />




      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dự án theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {approvedProjects.length === 0 ? (
              <p className="text-helper text-text-muted">Chưa có dự án đã duyệt trong phạm vi.</p>
            ) : (
              [...projectByStatus.entries()].map(([status, count]) => (
                <span key={status} className="flex items-center gap-2">
                  <StatusBadge
                    label={`${PROJECT_STATUS_LABEL[status]}: ${count}`}
                    tone={PROJECT_STATUS_TONE[status]}
                  />
                </span>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tiến độ công việc</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {tasks.length === 0 ? (
              <p className="text-helper text-text-muted">Chưa có công việc nào trong phạm vi.</p>
            ) : (
              TASK_STATUS_ORDER.map((status) => (
                <StatusBadge
                  key={status}
                  label={`${TASK_STATUS_LABEL[status]}: ${taskByStatus.get(status) ?? 0}`}
                  tone={TASK_STATUS_TONE[status]}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Công việc của tôi cần xử lý</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {myTasks.filter((task) => task.status !== "done").length === 0 ? (
              <p className="text-helper text-text-muted">Không có công việc nào đang mở.</p>
            ) : (
              myTasks
                .filter((task) => task.status !== "done")
                .slice(0, 6)
                .map((task) => (
                  <Link
                    key={task.id}
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    className="cen-transition flex min-w-0 flex-col gap-1 rounded-control px-2 py-1.5 hover:bg-surface-subtle"
                  >
                    <span className="min-w-0 break-words text-body text-text-primary">
                      {task.name}
                    </span>
                    <span
                      className={
                        isTaskOverdue(task)
                          ? "text-helper text-state-danger"
                          : "text-helper text-text-muted"
                      }
                    >
                      {formatDateTime(task.deadline)} · {TASK_STATUS_LABEL[task.status]}
                    </span>
                  </Link>
                ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tình trạng báo cáo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {mustSubmitDaily({
              userId: access.userId,
              role: access.role,
              leaderTeamId: access.leaderTeamId,
            }) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body text-text-secondary">
                  Báo cáo ngày {formatHanoiDate(today)}:
                </span>
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

            <p className="text-body text-text-secondary">
              Báo cáo ngày hôm nay đã nộp: <strong>{todayReports.length}</strong>
            </p>
            <p className="text-body text-text-secondary">
              Báo cáo ngày chờ duyệt: <strong>{pendingDaily.length}</strong>
            </p>
            <p className="text-body text-text-secondary">
              Báo cáo tuần chờ duyệt: <strong>{pendingWeekly.length}</strong>
            </p>
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
            {access.loading || canSubmitDaily ? (
              <Button
                className="self-start"
                onClick={openDailyAction}
                loading={dailyResult.isLoading || access.loading}
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
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
