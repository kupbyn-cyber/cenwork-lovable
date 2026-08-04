import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { StatusBadge } from "@/components/ui/status-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ReviewActions } from "@/components/report/review-actions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate, formatHanoiDateTime } from "@/lib/datetime";
import { membersQuery } from "@/lib/org-data";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, formatDateTime } from "@/lib/task-data";
import {
  canReviewDaily,
  canReviewWeekly,
  dailyReportQuery,
  dailyTaskRefsQuery,
  formatWeekLabel,
  reportHistoryQuery,
  reportStatusView,
  reviewDailyReport,
  reviewWeeklyReport,
  weeklyReportQuery,
} from "@/lib/report-data";

/**
 * REPORT-REVIEW-UI-01 — xem nhanh và duyệt báo cáo ngay trong danh sách.
 * Quyền thật do RLS/trigger database quyết định; UI chỉ ẩn nút cho đúng.
 */
export interface ReportReviewDrawerProps {
  kind: "daily" | "weekly";
  reportId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ title, value }: { title: string; value: string | null | undefined }) {
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

export function ReportReviewDrawer({ kind, reportId, open, onOpenChange }: ReportReviewDrawerProps) {
  const access = useOrgAccess();
  const isMobile = useIsMobile();
  const membersResult = useQuery(membersQuery());

  const daily = useQuery({
    ...dailyReportQuery(reportId ?? ""),
    enabled: open && kind === "daily" && Boolean(reportId),
  });
  const weekly = useQuery({
    ...weeklyReportQuery(reportId ?? ""),
    enabled: open && kind === "weekly" && Boolean(reportId),
  });

  const dailyRow = kind === "daily" ? (daily.data ?? null) : null;
  const weeklyRow = kind === "weekly" ? (weekly.data ?? null) : null;
  const loading = kind === "daily" ? daily.isLoading : weekly.isLoading;

  const history = useQuery({
    ...reportHistoryQuery(kind === "daily" ? "daily_report" : "weekly_report", reportId ?? ""),
    enabled: open && Boolean(reportId),
  });

  const taskRefs = useQuery({
    ...dailyTaskRefsQuery(dailyRow?.author_id ?? null, dailyRow?.report_date ?? ""),
    enabled: open && Boolean(dailyRow),
  });

  const ctx = {
    userId: access.userId,
    role: access.role,
    leaderTeamId: access.leaderTeamId,
  };
  const author = (membersResult.data ?? []).find(
    (member) => member.id === (dailyRow?.author_id ?? ""),
  );
  const reviewable = dailyRow
    ? canReviewDaily(dailyRow, ctx, author?.role === "leader")
    : weeklyRow
      ? canReviewWeekly(weeklyRow, ctx)
      : false;

  const status = dailyRow?.status ?? weeklyRow?.status ?? null;
  const view = status ? reportStatusView(status, reviewable) : null;

  const title = dailyRow
    ? `Báo cáo ngày ${formatHanoiDate(dailyRow.report_date)}`
    : weeklyRow
      ? `Báo cáo tuần ${formatWeekLabel(weeklyRow.week_start)}`
      : "Chi tiết báo cáo";
  const sender = dailyRow?.authorName ?? weeklyRow?.leaderName ?? "—";
  const teamName = dailyRow?.teamName ?? weeklyRow?.teamName ?? "Chưa gắn Team";

  const invalidateKeys: unknown[][] = React.useMemo(() => {
    if (!reportId) return [];
    return kind === "daily"
      ? [["daily-report", reportId], ["daily-reports"], ["report-history", "daily_report", reportId]]
      : [
          ["weekly-report", reportId],
          ["weekly-reports"],
          ["report-history", "weekly_report", reportId],
        ];
  }, [kind, reportId]);

  return (
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      side={isMobile ? "bottom" : "right"}
      title={title}
      description={`${sender} · ${teamName}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {reportId ? (
            <Button variant="secondary" asChild>
              <Link
                to={kind === "daily" ? "/reports/daily/$reportId" : "/reports/weekly/$reportId"}
                params={{ reportId }}
              >
                Mở báo cáo đầy đủ
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      {loading || (!dailyRow && !weeklyRow) ? (
        <SkeletonCard lines={5} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {view ? <StatusBadge label={view.label} tone={view.tone} /> : null}
            <span className="text-helper text-text-muted">
              Gửi:{" "}
              {(dailyRow ?? weeklyRow)?.submitted_at
                ? formatHanoiDateTime((dailyRow ?? weeklyRow)!.submitted_at!)
                : "—"}{" "}
              · Xử lý:{" "}
              {(dailyRow ?? weeklyRow)?.reviewed_at
                ? formatHanoiDateTime((dailyRow ?? weeklyRow)!.reviewed_at!)
                : "—"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field title="Người gửi" value={sender} />
            <Field title="Team" value={teamName} />
            <Field
              title={dailyRow ? "Ngày báo cáo" : "Tuần báo cáo"}
              value={
                dailyRow
                  ? formatHanoiDate(dailyRow.report_date)
                  : weeklyRow
                    ? formatWeekLabel(weeklyRow.week_start)
                    : "—"
              }
            />
            <Field title="Người duyệt" value={(dailyRow ?? weeklyRow)?.reviewerName ?? null} />
          </div>

          {dailyRow ? (
            <>
              <Field title="Kết quả đạt được" value={dailyRow.results} />
              <Field title="Vướng mắc" value={dailyRow.blockers} />
              <Field title="Kế hoạch ngày mai" value={dailyRow.next_plan} />
            </>
          ) : weeklyRow ? (
            <>
              <Field title="Kết quả nổi bật" value={weeklyRow.highlights} />
              <Field title="Việc chưa hoàn thành" value={weeklyRow.unfinished} />
              <Field title="Vướng mắc" value={weeklyRow.blockers} />
              <Field title="Kế hoạch tuần tới" value={weeklyRow.next_week_plan} />
            </>
          ) : null}

          {dailyRow ? (
            <div className="flex flex-col gap-2">
              <p className="text-label font-semibold text-text-primary">Công việc trong ngày</p>
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
            </div>
          ) : null}

          <Field title="Nhận xét gần nhất" value={(dailyRow ?? weeklyRow)?.review_note ?? null} />

          {reviewable && reportId ? (
            <div className="rounded-lg border border-border-default p-3">
              <p className="mb-2 text-label font-semibold text-text-primary">Duyệt báo cáo</p>
              <ReviewActions
                onReview={async (decision, note) => {
                  if (kind === "daily") await reviewDailyReport(reportId, decision, note);
                  else await reviewWeeklyReport(reportId, decision, note);
                }}
                invalidateKeys={invalidateKeys}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <p className="text-label font-semibold text-text-primary">Lịch sử xử lý</p>
            {(history.data ?? []).length === 0 ? (
              <p className="text-helper text-text-muted">Chưa có lịch sử.</p>
            ) : (
              (history.data ?? []).map((entry) => (
                <p key={entry.id} className="text-helper text-text-secondary">
                  {formatHanoiDateTime(entry.created_at)} · {entry.action} ·{" "}
                  {entry.actor_email ?? "—"}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </DrawerPanel>
  );
}
