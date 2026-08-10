import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { DailyReportDrawer } from "@/components/report/daily-report-drawer";
import { DailyReportSections } from "@/components/report/daily-report-sections";
import { ReviewActions } from "@/components/report/review-actions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { parseDailyReportContent } from "@/lib/daily-report-content";
import { useOrgAccess } from "@/hooks/use-org-access";
import { useReviewerDirectory } from "@/hooks/use-reviewer-directory";
import { formatHanoiDate, formatHanoiDateTime } from "@/lib/datetime";
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TONE,
  canEditDaily,
  canReviewDaily,
  dailyReportQuery,
  dailyTaskRefsQuery,
  reportHistoryQuery,
  reviewDailyReport,
} from "@/lib/report-data";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, formatDateTime } from "@/lib/task-data";

export const Route = createFileRoute("/_authenticated/reports/daily/$reportId")({
  head: () => ({
    meta: [
      { title: "Chi tiết báo cáo ngày — CEN WORK" },
      {
        name: "description",
        content: "Nội dung báo cáo ngày, công việc tổng hợp, trạng thái duyệt và lịch sử xử lý.",
      },
      { property: "og:title", content: "Chi tiết báo cáo ngày — CEN WORK" },
      {
        property: "og:description",
        content: "Nội dung báo cáo ngày, công việc tổng hợp, trạng thái duyệt và lịch sử xử lý.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailyReportDetail,
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

function DailyReportDetail() {
  const { reportId } = Route.useParams();
  const access = useOrgAccess();
  const directory = useReviewerDirectory();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);

  const reportResult = useQuery(dailyReportQuery(reportId));
  const historyResult = useQuery(reportHistoryQuery("daily_report", reportId));
  const report = reportResult.data ?? null;
  const taskRefs = useQuery(
    dailyTaskRefsQuery(report?.author_id ?? null, report?.report_date ?? ""),
  );

  if (reportResult.isLoading) return <SkeletonCard lines={5} />;
  if (reportResult.isError || !report) {
    return (
      <ErrorState
        title="Không tải được báo cáo"
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
  const editable = canEditDaily(report, ctx);
  const reviewable = canReviewDaily(report, ctx, directory);
  const content = parseDailyReportContent(report);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Button variant="ghost" size="sm" className="self-start" onClick={() => void navigate({ to: "/reports" })}>
        <ArrowLeft />
        Danh sách báo cáo
      </Button>

      <PageHeader
        title={`Báo cáo ngày ${formatHanoiDate(report.report_date)}`}
        description={`${report.authorName ?? "—"} · ${report.teamName ?? "Chưa gắn Team"}`}
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
            <DailyReportSections
              items={content.items}
              rawResults={content.rawResults}
              counts={content.counts}
              rawSummary={content.rawSummary}
              note={content.note}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="cen-transition text-left text-body-sm text-text-secondary hover:text-text-primary">
                  Xem snapshot công việc trong ngày
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="flex flex-col gap-3">
                  {taskRefs.isLoading ? (
                <p className="text-helper text-text-muted">Đang tổng hợp…</p>
              ) : (taskRefs.data ?? []).length === 0 ? (
                <p className="text-helper text-text-muted">Không có công việc nào trong ngày này.</p>
              ) : (
                (taskRefs.data ?? []).map((task) => (
                  <div key={task.id} className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/tasks/$taskId"
                        params={{ taskId: task.id }}
                        className="cen-transition min-w-0 break-words text-body text-text-primary hover:text-brand-primary"
                      >
                        {task.name}
                      </Link>
                      <StatusBadge
                        label={TASK_STATUS_LABEL[task.status]}
                        tone={TASK_STATUS_TONE[task.status]}
                      />
                    </div>
                    <span className="text-helper text-text-muted">
                      {task.projectName ?? "Công việc độc lập"} · {formatDateTime(task.deadline)}
                    </span>
                  </div>
                ))
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Card>
            <CardHeader>
              <CardTitle>Duyệt báo cáo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Block title="Người duyệt" value={report.reviewerName} />
              <Block title="Nhận xét" value={report.review_note} />
              {reviewable ? (
                <ReviewActions
                  onReview={(decision, note) => reviewDailyReport(report.id, decision, note)}
                  invalidateKeys={[
                    ["daily-report", report.id],
                    ["daily-reports"],
                    ["report-history", "daily_report", report.id],
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

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
                {formatHanoiDateTime(entry.created_at)} · {entry.action} ·{" "}
                {entry.actor_email ?? "—"}
              </p>
            ))
          )}
        </CardContent>
      </Card>

      {access.userId ? (
        <DailyReportDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          report={report}
          authorId={report.author_id}
          teamId={report.team_id}
        />
      ) : null}
    </div>
  );
}
