import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { DailyReportSections } from "@/components/report/daily-report-sections";

import { useReviewerDirectory } from "@/hooks/use-reviewer-directory";
import {
  createDailyReport,
  dailySnapshotQuery,
  hanoiToday,
  isDailyNoteRequired,
  resolveDailyReviewerForAuthor,
  snapshotToReportContent,
  updateDailyReport,
  type DailyReportRow,
} from "@/lib/report-data";

/**
 * CEN WORK — REPORT-DAILY-FLOW-02.
 * Báo cáo ngày do CEN tự sinh từ Task của chính người gửi:
 * (1) Task đã hoàn thành hôm nay kèm kết quả, (2) tổng quan số lượng,
 * (3) ghi chú / vướng mắc. Người gửi chỉ kiểm tra và ghi chú khi cần.
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
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setReportDate(report?.report_date ?? hanoiToday());
    const previous = (report?.next_plan ?? "").trim();
    setNote(previous === "Không có ghi chú." ? "" : previous);
  }, [open, report]);

  const snapshotQuery = useQuery(dailySnapshotQuery(open ? authorId : null, reportDate));
  const snapshot = snapshotQuery.data ?? null;
  const directory = useReviewerDirectory();
  const reviewerId = resolveDailyReviewerForAuthor(
    authorId,
    report?.team_id ?? teamId,
    directory,
  );
  const noteRequired = snapshot ? isDailyNoteRequired(snapshot) : false;

  const mutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (!snapshot) throw new Error("Chưa tổng hợp xong dữ liệu công việc.");
      const content = snapshotToReportContent(snapshot, note);
      const payload = {
        teamId: report?.team_id ?? teamId,
        results: content.results,
        blockers: content.blockers,
        nextPlan: content.nextPlan,
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
      if (snapshot && snapshot.missingResult.length > 0) {
        next["tasks"] =
          "Có Task đã hoàn thành nhưng chưa cập nhật kết quả. Vui lòng cập nhật kết quả trước khi gửi báo cáo.";
      }
      if (noteRequired && !note.trim()) {
        next["note"] = "Bắt buộc ghi chú khi có Task quá hạn hoặc không hoàn thành Task nào.";
      }
      if (!reviewerId) next["reviewer"] = "Chưa xác định được người duyệt báo cáo.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate(status);
  }

  function closeThanks() {
    const id = thanksReportId;
    setThanksReportId(null);
    if (id) onSaved?.(id);
  }

  return (
    <>
    <Modal
      size="lg"
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
            disabled={Boolean(snapshot && snapshot.missingResult.length > 0)}
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

        <DailyReportSections
          loading={snapshotQuery.isLoading}
          items={(snapshot?.completed ?? []).map((task) => ({
            name: task.name,
            result: task.result,
            projectName: task.projectName,
            completedAt: task.completedAt,
          }))}
          counts={{
            open: snapshot?.openCount ?? 0,
            overdue: snapshot?.overdueCount ?? 0,
            review: snapshot?.reviewCount ?? 0,
          }}
          completedHint="Tự động lấy từ Task bạn là người phụ trách chính và đã hoàn thành trong ngày."
          completedFooter={
            snapshot && snapshot.missingResult.length > 0 ? (
              <div className="mt-3 rounded-card border border-state-error/40 bg-state-error/5 p-3">
                <p className="text-label font-semibold text-state-error">
                  Có Task đã hoàn thành nhưng chưa cập nhật kết quả. Vui lòng cập nhật kết quả
                  trước khi gửi báo cáo.
                </p>
                <ul className="mt-2 list-disc pl-5 text-helper text-text-secondary">
                  {snapshot.missingResult.map((task) => (
                    <li key={task.id}>{task.name}</li>
                  ))}
                </ul>
              </div>
            ) : null
          }
          noteSlot={
            <FormField
              id="report-note"
              label="Ghi chú / Ý kiến cá nhân"
              required={noteRequired}
              hint="Bạn có thể ghi thêm tình hình, vướng mắc, đề xuất hỗ trợ hoặc ý kiến cá nhân."
              error={errors["note"] ?? errors["tasks"] ?? errors["reviewer"]}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ví dụ: hôm nay còn vướng ở khâu..., cần Leader hỗ trợ..."
                />
              )}
            </FormField>
          }
        />
      </div>
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

