import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";

import { formatHanoiDate } from "@/lib/datetime";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  formatDateTime,
  tasksQuery,
  type TaskRow,
} from "@/lib/task-data";
import {
  createDailyReport,
  fetchMyDailyReport,
  updateDailyReport,
} from "@/lib/report-data";
import {
  GROUP_TITLE,
  buildDailySummary,
  summaryToReportContent,
} from "@/lib/daily-report-summary";

/**
 * CEN 1.0 — Báo cáo ngày tự động tổng hợp.
 * Người gửi không nhập lại danh sách công việc: hệ thống tổng hợp từ Task
 * của chính họ, hiển thị bản xem trước để kiểm tra rồi mới gửi.
 * Không đổi trạng thái Task và không tạo Task mới.
 */
export interface DailyReportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authorId: string;
  authorName: string;
  teamId: string | null;
  teamName: string;
  reportDate: string;
  /** Bản nháp hiện có (nếu đã bấm gửi dở trước đó). */
  existingReportId?: string | null;
  onSubmitted?: (reportId: string) => void;
}

function TaskLine({ task, index }: { task: TaskRow; index: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-body text-text-primary">
          {index + 1}. {task.name}
        </span>
        <StatusBadge
          label={TASK_PRIORITY_LABEL[task.priority]}
          tone={TASK_PRIORITY_TONE[task.priority]}
        />
      </div>
      <span className="text-helper text-text-muted">
        {task.projectName ?? "Công việc độc lập"} · Hạn {formatDateTime(task.deadline)}
      </span>
    </div>
  );
}

function Group({ title, tasks }: { title: string; tasks: TaskRow[] }) {
  return (
    <section className="rounded-card border border-border-default bg-surface-subtle p-3">
      <p className="text-label font-semibold text-text-primary">
        {title} ({tasks.length})
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-helper text-text-muted">Không có</p>
        ) : (
          tasks.map((task, index) => <TaskLine key={task.id} task={task} index={index} />)
        )}
      </div>
    </section>
  );
}

export function DailyReportPreviewModal({
  open,
  onOpenChange,
  authorId,
  authorName,
  teamId,
  teamName,
  reportDate,
  existingReportId = null,
  onSubmitted,
}: DailyReportPreviewModalProps) {
  const queryClient = useQueryClient();
  const [thanksReportId, setThanksReportId] = React.useState<string | null>(null);

  const tasksResult = useQuery({ ...tasksQuery(), enabled: open });

  const summary = React.useMemo(
    () =>
      buildDailySummary(tasksResult.data ?? [], {
        userId: authorId,
        reportDate,
        authorName,
        teamName,
      }),
    [tasksResult.data, authorId, reportDate, authorName, teamName],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const content = summaryToReportContent(summary);
      // Nguồn sự thật ở server: một người chỉ có một báo cáo cho mỗi ngày.
      const existing = await fetchMyDailyReport(authorId, reportDate);
      if (existing && existing.status !== "draft" && existing.status !== "changes_requested") {
        throw new Error("Bạn đã gửi báo cáo cho ngày này.");
      }
      const target = existing?.id ?? existingReportId;
      if (target) {
        await updateDailyReport(target, {
          teamId: existing?.team_id ?? teamId,
          results: content.results,
          blockers: content.blockers,
          nextPlan: content.nextPlan,
          status: "submitted",
        });
        return target;
      }
      return createDailyReport({
        authorId,
        reportDate,
        teamId,
        results: content.results,
        blockers: content.blockers,
        nextPlan: content.nextPlan,
        status: "submitted",
      });
    },
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["daily-report-mine"] });
      void queryClient.invalidateQueries({ queryKey: ["daily-report", id] });
      onOpenChange(false);
      setThanksReportId(id);
    },
    onError: (error: Error) =>
      cenToast.error("Không gửi được báo cáo", { description: friendlyReportError(error) }),

  });

  function closeThanks() {
    const id = thanksReportId;
    setThanksReportId(null);
    if (id) onSubmitted?.(id);
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) onOpenChange(next);
        }}
        size="lg"
        title={`Báo cáo ngày ${formatHanoiDate(reportDate)}`}
        description={`${authorName} · ${teamName} — Hệ thống tự tổng hợp từ công việc bạn phụ trách. Kiểm tra trước khi gửi.`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Hủy
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={tasksResult.isLoading || tasksResult.isError}
            >
              Gửi báo cáo
            </Button>
          </>
        }
      >
        {tasksResult.isLoading ? (
          <p className="text-body text-text-muted">Đang tổng hợp công việc…</p>
        ) : tasksResult.isError ? (
          <ErrorState
            title="Không tổng hợp được công việc"
            description="Không tải được danh sách công việc của bạn."
            onRetry={() => void tasksResult.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {summary.total === 0 ? (
              <p className="text-body text-text-secondary">
                Hôm nay bạn không có công việc nào được ghi nhận. Báo cáo vẫn gửi được với nội dung
                trống.
              </p>
            ) : null}
            <Group title={GROUP_TITLE.completed} tasks={summary.completed} />
            <Group title={GROUP_TITLE.overdue} tasks={summary.overdue} />
            <Group title={GROUP_TITLE.pending} tasks={summary.pending} />
          </div>
        )}
      </Modal>

      <Modal
        open={thanksReportId !== null}
        onOpenChange={(next) => {
          if (!next) closeThanks();
        }}
        size="sm"
        title="Cảm ơn bạn vì một ngày làm việc!"
        footer={<Button onClick={closeThanks}>Hoàn tất</Button>}
      >
        <p className="text-body text-text-secondary">
          Báo cáo ngày của bạn đã được gửi thành công. Chúc bạn có những phút giây thư giãn và tái
          tạo năng lượng sau giờ làm.
        </p>
      </Modal>
    </>
  );
}
