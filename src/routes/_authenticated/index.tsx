import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DailyReportDrawer } from "@/components/report/daily-report-drawer";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import { membersQuery } from "@/lib/org-data";

import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
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

const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "in_progress",
  "pending_acceptance",
];

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card density="compact">
      <CardContent className="flex flex-col gap-1 pt-(--card-pad)">
        <span className="text-caption tracking-[0.12em] text-text-muted uppercase">{label}</span>
        <span className="text-h2 font-semibold text-text-primary">{value}</span>
        {hint ? <span className="text-helper text-text-muted">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const [dailyOpen, setDailyOpen] = React.useState(false);

  const projectsResult = useQuery(projectsQuery());
  const tasksResult = useQuery(tasksQuery());
  const dailyResult = useQuery(dailyReportsQuery());
  const weeklyResult = useQuery(weeklyReportsQuery());
  const membersResult = useQuery(membersQuery());


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

  const activeProjects = projects.filter((project) =>
    ACTIVE_PROJECT_STATUSES.includes(project.status),
  );

  const projectByStatus = React.useMemo(() => {
    const map = new Map<ProjectStatus, number>();
    for (const project of projects) {
      map.set(project.status, (map.get(project.status) ?? 0) + 1);
    }
    return map;
  }, [projects]);

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
    myTodayReport && (myTodayReport.status === "draft" || myTodayReport.status === "changes_requested")
      ? myTodayReport
      : null;
  const dailySent = Boolean(myTodayReport && !dailyDraft);
  const dailyActionLabel = dailySent ? "Xem báo cáo hôm nay" : "Xem và gửi báo cáo";

  const me = (membersResult.data ?? []).find((member) => member.id === access.userId);

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

  const loading =
    projectsResult.isLoading || tasksResult.isLoading || dailyResult.isLoading || weeklyResult.isLoading;

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
      <PageHeader
        title="Bảng điều hành"
        description="Tổng quan dự án, công việc và tình trạng báo cáo trong phạm vi bạn được xem."
      />

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



      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Dự án đang chạy" value={activeProjects.length} hint={`${projects.length} dự án trong phạm vi`} />
        <Metric label="Công việc của tôi" value={myTasks.length} hint={`${myTasks.filter(isTaskOverdue).length} quá hạn`} />
        <Metric label="Đến hạn hôm nay" value={dueToday.length} hint={`${overdue.length} việc quá hạn`} />
        <Metric label="Chờ kiểm tra" value={inReview.length} hint="Công việc ở trạng thái chờ kiểm tra" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dự án theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {projects.length === 0 ? (
              <p className="text-helper text-text-muted">Chưa có dự án nào trong phạm vi.</p>
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
            {canSubmitDaily ? (
              <Button
                className="self-start"
                onClick={openDailyAction}
                loading={dailyResult.isLoading}
                disabled={dailyResult.isError}
              >
                <FileText />
                {dailyActionLabel}
              </Button>
            ) : null}
            <Link to="/reports" className="cen-transition text-label text-brand-primary hover:underline">
              Mở trang Báo cáo
            </Link>
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
          teamName={me?.teamName ?? "Chưa gắn Team"}
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
