import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import {
  REPORT_STATUS_LABEL,
  addDays,
  createWeeklyReport,
  dailyReportsQuery,
  formatWeekLabel,
  hanoiToday,
  updateWeeklyReport,
  weekStartOf,
  type WeeklyReportRow,
} from "@/lib/report-data";

/**
 * CEN 1.0 — M4 form báo cáo tuần của Team.
 * Phần tổng hợp báo cáo ngày lấy từ dữ liệu thật trong tuần, chỉ để tham chiếu.
 */
export interface WeeklyReportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: WeeklyReportRow | null;
  teamId: string;
  leaderId: string;
  onSaved?: (reportId: string) => void;
}

export function WeeklyReportDrawer({
  open,
  onOpenChange,
  report,
  teamId,
  leaderId,
  onSaved,
}: WeeklyReportDrawerProps) {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = React.useState(weekStartOf(hanoiToday()));
  const [highlights, setHighlights] = React.useState("");
  const [unfinished, setUnfinished] = React.useState("");
  const [blockers, setBlockers] = React.useState("");
  const [nextWeekPlan, setNextWeekPlan] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setWeekStart(report?.week_start ?? weekStartOf(hanoiToday()));
    setHighlights(report?.highlights ?? "");
    setUnfinished(report?.unfinished ?? "");
    setBlockers(report?.blockers ?? "");
    setNextWeekPlan(report?.next_week_plan ?? "");
  }, [open, report]);

  const dailyResult = useQuery(dailyReportsQuery());

  const weekDailies = React.useMemo(() => {
    const end = addDays(weekStart, 6);
    return (dailyResult.data ?? []).filter(
      (row) =>
        row.team_id === teamId && row.report_date >= weekStart && row.report_date <= end,
    );
  }, [dailyResult.data, teamId, weekStart]);

  const mutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const payload = {
        highlights: highlights.trim(),
        unfinished: unfinished.trim(),
        blockers: blockers.trim(),
        nextWeekPlan: nextWeekPlan.trim(),
        status,
      };
      if (report) {
        await updateWeeklyReport(report.id, payload);
        return report.id;
      }
      return createWeeklyReport({
        ...payload,
        teamId,
        weekStart: weekStartOf(weekStart),
        leaderId,
      });
    },
    onSuccess: (id, status) => {
      void queryClient.invalidateQueries({ queryKey: ["weekly-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["weekly-report", id] });
      cenToast.success(status === "submitted" ? "Đã gửi báo cáo tuần" : "Đã lưu bản nháp");
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (error: Error) =>
      cenToast.error("Không lưu được báo cáo tuần", { description: error.message }),
  });

  function submit(status: "draft" | "submitted") {
    const next: Record<string, string> = {};
    if (!weekStart) next["week"] = "Chọn tuần báo cáo";
    if (status === "submitted") {
      if (!highlights.trim()) next["highlights"] = "Nhập kết quả nổi bật";
      if (!nextWeekPlan.trim()) next["nextWeekPlan"] = "Nhập kế hoạch tuần tới";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(status);
  }

  return (
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={report ? "Sửa báo cáo tuần" : "Tạo báo cáo tuần"}
      description="Mỗi Team chỉ có một báo cáo cho mỗi tuần."
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
        <FormField
          id="weekly-week"
          label="Tuần báo cáo"
          required
          error={errors["week"]}
          helperText={weekStart ? formatWeekLabel(weekStartOf(weekStart)) : undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              value={weekStart}
              disabled={Boolean(report)}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          )}
        </FormField>

        <section className="rounded-card border border-border-default bg-surface-subtle p-3">
          <p className="text-label font-semibold text-text-primary">Báo cáo ngày của Team</p>
          <div className="mt-2 flex flex-col gap-1">
            {dailyResult.isLoading ? (
              <p className="text-helper text-text-muted">Đang tổng hợp…</p>
            ) : weekDailies.length === 0 ? (
              <p className="text-helper text-text-muted">
                Chưa có báo cáo ngày nào của Team trong tuần này.
              </p>
            ) : (
              weekDailies.map((row) => (
                <p key={row.id} className="text-helper text-text-secondary">
                  {row.report_date} · {row.authorName ?? "—"} ·{" "}
                  {REPORT_STATUS_LABEL[row.status]}
                </p>
              ))
            )}
          </div>
        </section>

        <FormField id="weekly-highlights" label="Kết quả nổi bật" required error={errors["highlights"]}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={highlights}
              onChange={(event) => setHighlights(event.target.value)}
            />
          )}
        </FormField>

        <FormField id="weekly-unfinished" label="Công việc chưa hoàn thành">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={unfinished}
              onChange={(event) => setUnfinished(event.target.value)}
            />
          )}
        </FormField>

        <FormField id="weekly-blockers" label="Vướng mắc / Blocker">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={blockers}
              onChange={(event) => setBlockers(event.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="weekly-next"
          label="Kế hoạch tuần tới"
          required
          error={errors["nextWeekPlan"]}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={nextWeekPlan}
              onChange={(event) => setNextWeekPlan(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </DrawerPanel>
  );
}
