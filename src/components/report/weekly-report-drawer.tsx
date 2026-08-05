import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { useReviewerDirectory } from "@/hooks/use-reviewer-directory";
import { formatHanoiDate } from "@/lib/datetime";
import {
  WEEKLY_REVIEWER_MISSING_MESSAGE,
  createWeeklyReport,
  formatWeekTitle,
  hanoiToday,
  resolveWeeklyReviewerForLeader,
  updateWeeklyReport,
  weeklyReportTitle,
  weeklySnapshotQuery,
  weeklySnapshotSummary,
  weekStartOf,
  type WeeklySnapshot,
  type WeeklyReportRow,
} from "@/lib/report-data";

/**
 * REPORT-WEEKLY-FLOW-01 — Báo cáo tuần tự tổng hợp theo Team.
 * Bốn phần đầu do hệ thống tự tổng hợp từ Dự án, Task, nhân sự và báo cáo ngày;
 * Leader chỉ kiểm tra và nhập ba ô nhận xét quản lý ở phần 5.
 */
export interface WeeklyReportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: WeeklyReportRow | null;
  teamId: string;
  teamName?: string | null;
  leaderId: string;
  onSaved?: (reportId: string) => void;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border-default bg-surface-subtle px-3 py-2">
      <p className="text-helper text-text-muted">{label}</p>
      <p className="text-label font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border-default p-3">
      <p className="text-label font-semibold text-text-primary">
        Phần {index} — {title}
      </p>
      {children}
    </section>
  );
}

function AutoSummary({ snapshot }: { snapshot: WeeklySnapshot }) {
  const c = snapshot.tasks.counts;
  return (
    <div className="flex flex-col gap-3">
      <Section index={1} title="Tổng quan dự án">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Đang triển khai" value={snapshot.projects.active} />
          <Stat label="Hoàn thành trong tuần" value={snapshot.projects.completed} />
          <Stat label="Chậm tiến độ" value={snapshot.projects.delayed} />
          <Stat label="Không cập nhật" value={snapshot.projects.noUpdate} />
          <Stat label="Cần CMO/Admin chú ý" value={snapshot.projects.attention} />
        </div>
        {snapshot.projects.items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {snapshot.projects.items.map((item) => (
              <li key={item.id} className="text-helper text-text-secondary">
                {item.name} · {item.status} · {item.note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-helper text-text-muted">Không có dự án nổi bật hoặc có vấn đề.</p>
        )}
      </Section>

      <Section index={2} title="Tổng quan Task">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Hoàn thành" value={c.completed} />
          <Stat label="Đúng hạn" value={c.onTime} />
          <Stat label="Quá hạn" value={c.overdue} />
          <Stat label="Còn mở" value={c.open} />
          <Stat label="Chờ kiểm tra" value={c.review} />
          <Stat label="Yêu cầu sửa" value={c.changesRequested} />
        </div>
        <p className="text-helper font-semibold text-text-primary">Task hoàn thành trong tuần</p>
        {snapshot.tasks.completed.length === 0 ? (
          <p className="text-helper text-text-muted">Không có Task hoàn thành trong tuần.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshot.tasks.completed.map((task) => (
              <li key={task.id} className="text-helper text-text-secondary">
                {task.name} · {task.assigneeName ?? "—"}
                {task.projectName ? ` · ${task.projectName}` : ""}
                {task.result ? ` — ${task.result}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-helper font-semibold text-text-primary">Task quá hạn / cần chú ý</p>
        {snapshot.tasks.attention.length === 0 ? (
          <p className="text-helper text-text-muted">Không có Task cần chú ý.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshot.tasks.attention.map((task) => (
              <li key={task.id} className="text-helper text-text-secondary">
                {task.name} · {task.assigneeName ?? "—"}
                {task.projectName ? ` · ${task.projectName}` : ""} · hạn{" "}
                {formatHanoiDate(task.deadline)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section index={3} title="Nhân sự trong Team">
        {snapshot.people.length === 0 ? (
          <p className="text-helper text-text-muted">Team chưa có thành viên đang hoạt động.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {snapshot.people.map((person) => (
              <p key={person.id} className="text-helper text-text-secondary">
                {person.name}: hoàn thành {person.done} · đang mở {person.open} · quá hạn{" "}
                {person.overdue} · báo cáo ngày {person.dailySent} · thiếu/muộn{" "}
                {person.dailyMissing}
                {person.needsSupport ? " · cần hỗ trợ" : ""}
              </p>
            ))}
          </div>
        )}
      </Section>

      <Section index={4} title="Báo cáo ngày trong tuần">
        <p className="text-helper text-text-secondary">
          Gửi đủ: {snapshot.daily.complete.length > 0 ? snapshot.daily.complete.join(", ") : "—"}
        </p>
        <p className="text-helper text-text-secondary">
          Chưa gửi hoặc gửi muộn:{" "}
          {snapshot.daily.missing.length > 0 ? snapshot.daily.missing.join(", ") : "—"}
        </p>
        <p className="text-helper font-semibold text-text-primary">
          Nội dung nổi bật (báo cáo ngày đã duyệt)
        </p>
        {snapshot.daily.highlights.length === 0 ? (
          <p className="text-helper text-text-muted">Chưa có báo cáo ngày được duyệt trong tuần.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshot.daily.highlights.map((line, index) => (
              <li key={index} className="text-helper text-text-secondary">
                {line}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export function WeeklyReportDrawer({
  open,
  onOpenChange,
  report,
  teamId,
  teamName,
  leaderId,
  onSaved,
}: WeeklyReportDrawerProps) {
  const queryClient = useQueryClient();
  const directory = useReviewerDirectory();
  const [weekStart, setWeekStart] = React.useState(() => weekStartOf(hanoiToday()));
  const [highlights, setHighlights] = React.useState("");
  const [blockers, setBlockers] = React.useState("");
  const [nextWeekPlan, setNextWeekPlan] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setWeekStart(report?.week_start ?? weekStartOf(hanoiToday()));
    setHighlights(report?.highlights ?? "");
    setBlockers(report?.blockers ?? "");
    setNextWeekPlan(report?.next_week_plan ?? "");
  }, [open, report]);

  const snapshotResult = useQuery({
    ...weeklySnapshotQuery(teamId, weekStart),
    enabled: open && Boolean(teamId && weekStart),
  });
  const snapshot = snapshotResult.data ?? null;
  const reviewerId =
    report?.reviewer_id ?? resolveWeeklyReviewerForLeader(leaderId, directory);

  const mutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      const payload = {
        highlights: highlights.trim(),
        unfinished: snapshot ? weeklySnapshotSummary(snapshot) : (report?.unfinished ?? ""),
        blockers: blockers.trim(),
        nextWeekPlan: nextWeekPlan.trim(),
        status,
        snapshot: snapshot ?? report?.snapshot ?? null,
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
      cenToast.success(
        status === "submitted" ? "Đã gửi báo cáo tuần chờ duyệt" : "Đã lưu bản nháp",
      );
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (error: Error) =>
      cenToast.error("Không lưu được báo cáo tuần", { description: error.message }),
  });

  function submit(status: "draft" | "submitted") {
    const next: Record<string, string> = {};
    if (status === "submitted") {
      if (!highlights.trim()) next["highlights"] = "Nhập đánh giá chung tuần này";
      if (!nextWeekPlan.trim()) next["nextWeekPlan"] = "Nhập kế hoạch ưu tiên tuần tới";
      if (!reviewerId) next["reviewer"] = WEEKLY_REVIEWER_MISSING_MESSAGE;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(status);
  }

  return (
    <Modal
      size="xl"
      open={open}
      onOpenChange={onOpenChange}
      title={weeklyReportTitle(weekStart, teamName ?? report?.teamName ?? null)}
      description={`${formatWeekTitle(weekStart)} · CEN tự tổng hợp, Leader chỉ nhập nhận xét quản lý.`}
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
        {errors["reviewer"] ? (
          <StatusBadge label={WEEKLY_REVIEWER_MISSING_MESSAGE} tone="error" />
        ) : null}

        {snapshotResult.isLoading ? (
          <p className="text-helper text-text-muted">Đang tổng hợp dữ liệu tuần…</p>
        ) : snapshot ? (
          <AutoSummary snapshot={snapshot} />
        ) : (
          <p className="text-helper text-text-muted">Chưa tổng hợp được dữ liệu tuần.</p>
        )}

        <p className="text-label font-semibold text-text-primary">Phần 5 — Nhận xét của Leader</p>

        <FormField
          id="weekly-highlights"
          label="Đánh giá chung tuần này"
          required
          error={errors["highlights"]}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={highlights}
              onChange={(event) => setHighlights(event.target.value)}
            />
          )}
        </FormField>

        <FormField id="weekly-blockers" label="Vấn đề / rủi ro cần CMO hỗ trợ">
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
          label="Kế hoạch ưu tiên tuần tới"
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
    </Modal>
  );
}
