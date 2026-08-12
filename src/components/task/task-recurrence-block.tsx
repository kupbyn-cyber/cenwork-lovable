import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { cenToast } from "@/components/ui/toast";
import { RecurrenceFields } from "@/components/task/recurrence-fields";
import {
  recurrenceSummary,
  setTaskRecurrenceStatus,
  shortTime,
  taskRecurrenceQuery,
  updateTaskRecurrence,
  type RecurrenceSchedule,
} from "@/lib/task-recurrence";

/**
 * TASK-RECUR-01 — Dấu hiệu nhẹ trong chi tiết Task được sinh từ lịch lặp,
 * kèm hành động chỉnh / dừng lịch cho người có quyền (database kiểm tra lại).
 */
export function TaskRecurrenceBlock({ ruleId }: { ruleId: string }) {
  const queryClient = useQueryClient();
  const ruleResult = useQuery(taskRecurrenceQuery(ruleId));
  const rule = ruleResult.data ?? null;

  const [editOpen, setEditOpen] = React.useState(false);
  const [stopOpen, setStopOpen] = React.useState(false);
  const [schedule, setSchedule] = React.useState<RecurrenceSchedule | null>(null);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["task-recurrence", ruleId] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  const saveMutation = useMutation({
    mutationFn: (next: RecurrenceSchedule) => updateTaskRecurrence(ruleId, next),
    onSuccess: () => {
      cenToast.success("Đã cập nhật lịch lặp.");
      setEditOpen(false);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const stopMutation = useMutation({
    mutationFn: () => setTaskRecurrenceStatus(ruleId, "stopped"),
    onSuccess: () => {
      cenToast.success("Đã dừng lịch lặp.");
      setStopOpen(false);
      invalidate();
    },
    onError: (err: Error) => cenToast.error(err.message),
  });

  if (!rule) return null;

  const openEdit = () => {
    setError(undefined);
    setSchedule({
      freq: rule.freq,
      startDate: rule.start_date,
      endDate: rule.end_date,
      deadlineTime: shortTime(rule.deadline_time),
      weekdays: rule.weekdays,
      monthDay: rule.month_day,
    });
    setEditOpen(true);
  };

  return (
    <div className="flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-subtle p-3">
      <p className="flex items-center gap-1.5 text-body-sm font-medium text-text-primary">
        <Repeat className="size-icon-sm" aria-hidden="true" />
        Công việc lặp
      </p>
      <p className="text-helper text-text-secondary">
        Lặp lại: {recurrenceSummary(rule)}
        {rule.status !== "active" ? " · Đã dừng" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={openEdit}>
          Xem lịch lặp
        </Button>
        {rule.status === "active" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStopOpen(true)}>
            Dừng lặp
          </Button>
        ) : null}
      </div>

      <Modal
        open={editOpen}
        onOpenChange={saveMutation.isPending ? () => undefined : setEditOpen}
        title="Chỉnh lịch lặp"
        description="Thay đổi này chỉ áp dụng cho các công việc được tạo từ những kỳ tiếp theo. Các công việc đã tạo không thay đổi."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Đóng
            </Button>
            <Button
              type="button"
              loading={saveMutation.isPending}
              onClick={() => {
                if (!schedule) return;
                setError(undefined);
                if (schedule.freq === "weekly" && schedule.weekdays.length === 0) {
                  setError("Chọn ít nhất một thứ trong tuần.");
                  return;
                }
                if (
                  schedule.freq === "monthly" &&
                  (schedule.monthDay === null || schedule.monthDay < 1 || schedule.monthDay > 31)
                ) {
                  setError("Chọn ngày lặp trong tháng (1–31).");
                  return;
                }
                saveMutation.mutate(schedule);
              }}
            >
              Lưu lịch lặp
            </Button>
          </div>
        }
      >
        {schedule ? (
          <RecurrenceFields
            idPrefix="recur-edit"
            value={schedule}
            onChange={setSchedule}
            error={error}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Dừng công việc lặp?"
        description="CEN sẽ không tạo thêm công việc mới. Các công việc đã được tạo vẫn được giữ nguyên."
        confirmLabel="Dừng lặp"
        tone="destructive"
        loading={stopMutation.isPending}
        onConfirm={() => stopMutation.mutate()}
      />
    </div>
  );
}
