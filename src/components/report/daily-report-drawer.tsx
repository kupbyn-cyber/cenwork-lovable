import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";

import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  formatDateTime,
} from "@/lib/task-data";
import {
  createDailyReport,
  dailyTaskRefsQuery,
  hanoiToday,
  updateDailyReport,
  type DailyReportRow,
} from "@/lib/report-data";

/**
 * CEN 1.0 — M4 form báo cáo ngày.
 * Task trong ngày là dữ liệu tham chiếu tự tổng hợp, không cho sửa;
 * người gửi vẫn phải nhập kết quả, vướng mắc và kế hoạch ngày mai.
 */
export interface DailyReportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tạo báo cáo mới. */
  report: DailyReportRow | null;
  authorId: string;
  teamId: string | null;
  onSaved?: (reportId: string) => void;
}

export function DailyReportDrawer({
  open,
  onOpenChange,
  report,
  authorId,
  teamId,
  onSaved,
}: DailyReportDrawerProps) {
  const queryClient = useQueryClient();
  /** Id báo cáo vừa gửi thành công — chỉ dùng để hiện modal cảm ơn một lần. */
  const [thanksReportId, setThanksReportId] = React.useState<string | null>(null);
  const [reportDate, setReportDate] = React.useState(hanoiToday());

  const [results, setResults] = React.useState("");
  const [blockers, setBlockers] = React.useState("");
  const [nextPlan, setNextPlan] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setReportDate(report?.report_date ?? hanoiToday());
    setResults(report?.results ?? "");
    setBlockers(report?.blockers ?? "");
    setNextPlan(report?.next_plan ?? "");
  }, [open, report]);

  const taskRefs = useQuery(dailyTaskRefsQuery(open ? authorId : null, reportDate));

  const mutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const payload = {
        teamId: report?.team_id ?? teamId,
        results: results.trim(),
        blockers: blockers.trim(),
        nextPlan: nextPlan.trim(),
        status,
      };
      if (report) {
        await updateDailyReport(report.id, payload);
        return report.id;
      }
      return createDailyReport({ ...payload, reportDate, authorId });
    },
    onSuccess: (id, status) => {
      void queryClient.invalidateQueries({ queryKey: ["daily-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["daily-report", id] });
      cenToast.success(status === "submitted" ? "Đã gửi báo cáo ngày" : "Đã lưu bản nháp");
      onOpenChange(false);
      // Chỉ hành động "Gửi duyệt" thành công mới hiện lời cảm ơn; lưu nháp thì không.
      if (status === "submitted") {
        setThanksReportId(id);
        return;
      }
      onSaved?.(id);
    },

    onError: (error: Error) => cenToast.error("Không lưu được báo cáo", { description: error.message }),
  });

  function submit(status: "draft" | "submitted") {
    const next: Record<string, string> = {};
    if (!reportDate) next["date"] = "Chọn ngày báo cáo";
    if (status === "submitted") {
      if (!results.trim()) next["results"] = "Nhập kết quả đạt được";
      if (!nextPlan.trim()) next["nextPlan"] = "Nhập kế hoạch ngày mai";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(status);
  }

  const tasks = taskRefs.data ?? [];

  function closeThanks() {
    const id = thanksReportId;
    setThanksReportId(null);
    if (id) onSaved?.(id);
  }

  return (
    <>
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={report ? "Sửa báo cáo ngày" : "Tạo báo cáo ngày"}
      description="Mỗi người chỉ có một báo cáo cho mỗi ngày. Có thể lưu nháp rồi gửi sau."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit("draft")}
            loading={mutation.isPending && mutation.variables === "draft"}
          >
            Lưu nháp
          </Button>
          <Button
            onClick={() => submit("submitted")}
            loading={mutation.isPending && mutation.variables === "submitted"}
          >
            Gửi duyệt
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField id="report-date" label="Ngày báo cáo" required error={errors["date"]}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={reportDate}
              max={hanoiToday()}
              disabled={Boolean(report)}
              onChange={(event) => setReportDate(event.target.value)}
            />
          )}
        </FormField>

        <section className="rounded-card border border-border-default bg-surface-subtle p-3">
          <p className="text-label font-semibold text-text-primary">Công việc trong ngày</p>
          <p className="mt-1 text-helper text-text-muted">
            Tự động tổng hợp từ công việc bạn phụ trách hoặc tham gia.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {taskRefs.isLoading ? (
              <p className="text-helper text-text-muted">Đang tổng hợp…</p>
            ) : tasks.length === 0 ? (
              <p className="text-helper text-text-muted">Không có công việc nào trong ngày này.</p>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-body text-text-primary">
                      {task.name}
                    </span>
                    <StatusBadge
                      label={TASK_STATUS_LABEL[task.status]}
                      tone={TASK_STATUS_TONE[task.status]}
                    />
                  </div>
                  <span className="text-helper text-text-muted">
                    {task.projectName ?? "Công việc độc lập"} · {formatDateTime(task.deadline)} ·{" "}
                    {task.role === "assignee" ? "Phụ trách" : "Tham gia"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <FormField id="report-results" label="Kết quả đạt được" required error={errors["results"]}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={results}
              onChange={(event) => setResults(event.target.value)}
              placeholder="Việc đã hoàn thành và kết quả cụ thể trong ngày."
            />
          )}
        </FormField>

        <FormField id="report-blockers" label="Vướng mắc">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={blockers}
              onChange={(event) => setBlockers(event.target.value)}
              placeholder="Khó khăn cần hỗ trợ (nếu có)."
            />
          )}
        </FormField>

        <FormField id="report-next" label="Kế hoạch ngày mai" required error={errors["nextPlan"]}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={nextPlan}
              onChange={(event) => setNextPlan(event.target.value)}
              placeholder="Việc dự kiến làm trong ngày kế tiếp."
            />
          )}
        </FormField>
      </div>
    </DrawerPanel>
  );
}
