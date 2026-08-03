import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LinkifiedText } from "@/components/ui/linkified-text";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReviewActions } from "@/components/report/review-actions";
import { WeeklyReportDrawer } from "@/components/report/weekly-report-drawer";
import { RecognitionStatsPanel } from "@/components/recognition/recognition-stats-panel";

import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate, formatHanoiDateTime } from "@/lib/datetime";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  addDays,
  canEditWeekly,
  canReviewWeekly,
  dailyReportsQuery,
  formatWeekLabel,
  reportHistoryQuery,
  reviewWeeklyReport,
  weeklyReportQuery,
} from "@/lib/report-data";

export const Route = createFileRoute("/_authenticated/reports/weekly/$reportId")({
  head: () => ({
    meta: [
      { title: "Chi tiết báo cáo tuần — CEN WORK" },
      {
        name: "description",
        content: "Báo cáo tuần của Team: kết quả nổi bật, việc chưa xong, blocker và kế hoạch tuần tới.",
      },
      { property: "og:title", content: "Chi tiết báo cáo tuần — CEN WORK" },
      {
        property: "og:description",
        content: "Báo cáo tuần của Team: kết quả nổi bật, việc chưa xong, blocker và kế hoạch tuần tới.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WeeklyReportDetail,
});

function Block({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label font-semibold text-text-primary">{title}</p>
      {value?.trim() ? (
        <LinkifiedText as="p" className="text-body text-text-secondary" text={value} />
      ) : (
        <p className="text-body text-text-secondary">—</p>
      )}
    </div>
  );
}

function WeeklyReportDetail() {
  const { reportId } = Route.useParams();
  const access = useOrgAccess();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);

  const reportResult = useQuery(weeklyReportQuery(reportId));
  const dailyResult = useQuery(dailyReportsQuery());
  const historyResult = useQuery(reportHistoryQuery("weekly_report", reportId));
  const report = reportResult.data ?? null;

  const teamDailies = React.useMemo(() => {
    if (!report) return [];
    const end = addDays(report.week_start, 6);
    return (dailyResult.data ?? []).filter(
      (row) =>
        row.team_id === report.team_id &&
        row.report_date >= report.week_start &&
        row.report_date <= end,
    );
  }, [dailyResult.data, report]);

  if (reportResult.isLoading) return <SkeletonCard lines={5} />;
  if (reportResult.isError || !report) {
    return (
      <ErrorState
        title="Không tải được báo cáo tuần"
        description="Báo cáo không tồn tại hoặc bạn không có quyền xem."
        onRetry={() => void reportResult.refetch()}
      />
    );
  }

  const ctx = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };
  const editable = canEditWeekly(report, ctx);
  const reviewable = canReviewWeekly(report, ctx);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => void navigate({ to: "/reports" })}
      >
        <ArrowLeft />
        Danh sách báo cáo
      </Button>

      <PageHeader
        title={`Báo cáo tuần ${formatWeekLabel(report.week_start)}`}
        description={`${report.teamName ?? "—"} · Leader: ${report.leaderName ?? "—"}`}
        actions={
          editable ? (
            <Button onClick={() => setEditOpen(true)}>
              {report.status === "changes_requested" ? "Chỉnh sửa và gửi lại" : "Sửa báo cáo"}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          label={REPORT_STATUS_LABEL[report.status]}
          tone={REPORT_STATUS_TONE[report.status]}
        />
        <span className="text-helper text-text-muted">
          Gửi: {report.submitted_at ? formatHanoiDateTime(report.submitted_at) : "—"} · Xử lý:{" "}
          {report.reviewed_at ? formatHanoiDateTime(report.reviewed_at) : "—"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Nội dung báo cáo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Block title="Kết quả nổi bật" value={report.highlights} />
            <Block title="Công việc chưa hoàn thành" value={report.unfinished} />
            <Block title="Vướng mắc / Blocker" value={report.blockers} />
            <Block title="Kế hoạch tuần tới" value={report.next_week_plan} />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Báo cáo ngày trong tuần</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {teamDailies.length === 0 ? (
                <p className="text-helper text-text-muted">
                  Chưa có báo cáo ngày nào của Team trong tuần này.
                </p>
              ) : (
                teamDailies.map((row) => (
                  <p key={row.id} className="text-helper text-text-secondary">
                    {formatHanoiDate(row.report_date)} · {row.authorName ?? "—"} ·{" "}
                    {REPORT_STATUS_LABEL[row.status]}
                  </p>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Duyệt báo cáo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Block title="Người duyệt" value={report.reviewerName} />
              <Block title="Nhận xét" value={report.review_note} />
              {reviewable ? (
                <ReviewActions
                  onReview={(decision, note) => reviewWeeklyReport(report.id, decision, note)}
                  invalidateKeys={[
                    ["weekly-report", report.id],
                    ["weekly-reports"],
                    ["report-history", "weekly_report", report.id],
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <RecognitionStatsPanel
        title="Ghi nhận trong tuần"
        fixedTeamId={report.team_id}
        fixedRange={{ from: report.week_start, to: addDays(report.week_start, 6) }}
        description="Số lời ghi nhận thành viên Team nhận được trong tuần báo cáo (không hiển thị nội dung hay người gửi)."
      />

      <Card>

        <CardHeader>
          <CardTitle>Lịch sử xử lý</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(historyResult.data ?? []).length === 0 ? (
            <p className="text-helper text-text-muted">Chưa có lịch sử.</p>
          ) : (
            (historyResult.data ?? []).map((entry) => (
              <p key={entry.id} className="text-helper text-text-secondary">
                {formatHanoiDateTime(entry.created_at)} · {entry.action} · {entry.actor_email ?? "—"}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      {access.userId ? (
        <WeeklyReportDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          report={report}
          teamId={report.team_id}
          leaderId={report.leader_id}
        />
      ) : null}
    </div>
  );
}
