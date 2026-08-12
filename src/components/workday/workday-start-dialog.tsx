import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Leaf, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cenToast } from "@/components/ui/toast";
import { getDisplayName, useAuth } from "@/hooks/use-auth";
import { useWorkDayToday } from "@/hooks/use-work-day";
import { formatHanoiTime } from "@/lib/datetime";
import {
  greetingByHour,
  pickGreetingLine,
  setWorkDay,
  WORK_SHIFT_OPTIONS,
  workShiftLabel,
  type WorkDayStatus,
  type WorkShift,
} from "@/lib/workday-data";
import { cn } from "@/lib/utils";

/**
 * WORKDAY-01 — popup lần đầu mở CEN trong ngày.
 * "Để sau" KHÔNG tạo bản ghi và KHÔNG được coi là ngày nghỉ (trạng thái: chưa xác nhận).
 */
export function WorkdayStartDialog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = useWorkDayToday();
  const [postponed, setPostponed] = React.useState(false);
  const [mode, setMode] = React.useState<WorkDayStatus>("working");
  const [shift, setShift] = React.useState<WorkShift>("full_day");

  const record = today.data?.record ?? null;
  // Chỉ mở khi database đã trả lời rõ là chưa có bản ghi hôm nay (không flash popup).
  const open = Boolean(user?.id) && today.isSuccess && !today.data?.confirmed && !postponed;

  const submit = useMutation({
    mutationFn: () => setWorkDay({ status: mode, shift, source: "popup" }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["work-day-today"] });
      if (row.day_status === "working") {
        cenToast.success(
          `Đã ghi nhận ngày làm việc — ${workShiftLabel(row.shift_type)} · ${formatHanoiTime(row.started_at)}`,
        );
      } else {
        cenToast.success("Đã ghi nhận hôm nay là ngày nghỉ.");
      }
    },
    onError: () => cenToast.error("Không thể ghi nhận ngày làm việc. Vui lòng thử lại."),
  });

  if (!open) return null;
  const name = getDisplayName(user) || "bạn";
  const line = pickGreetingLine(`${user?.id ?? ""}${today.data?.work_date ?? ""}`);

  return (
    <Dialog open onOpenChange={(next) => (!next && !submit.isPending ? setPostponed(true) : null)}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>
            {greetingByHour()}, {name} 👋
          </DialogTitle>
          <DialogDescription>{line}</DialogDescription>
        </DialogHeader>

        <p className="text-label font-semibold text-text-primary">
          Hôm nay bạn làm việc như thế nào?
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("working")}
            aria-pressed={mode === "working"}
            className={cn(
              "rounded-card border p-3 text-left transition-colors",
              mode === "working"
                ? "border-state-success/45 bg-state-success-surface"
                : "border-border-default bg-surface hover:bg-surface-subtle",
            )}
          >
            <span className="flex items-center gap-2 text-label font-semibold text-text-primary">
              <Sun className="size-4 text-state-success" /> Làm việc
            </span>
            <div className="mt-2" onClick={(event) => event.stopPropagation()}>
              <Select
                value={shift}
                onValueChange={(value) => {
                  setMode("working");
                  setShift(value as WorkShift);
                }}
              >
                <SelectTrigger className="w-full sm:w-56" aria-label="Chọn ca làm việc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_SHIFT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-2 text-caption text-text-muted">
              Chọn ca phù hợp với lịch làm việc hôm nay.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("day_off")}
            aria-pressed={mode === "day_off"}
            className={cn(
              "rounded-card border p-3 text-left transition-colors",
              mode === "day_off"
                ? "border-brand-secondary bg-brand-subtle"
                : "border-border-default bg-surface hover:bg-surface-subtle",
            )}
          >
            <span className="flex items-center gap-2 text-label font-semibold text-text-primary">
              <Leaf className="size-4 text-state-success" /> Hôm nay là ngày nghỉ
            </span>
            <p className="mt-1 text-caption text-text-muted">
              Bạn vẫn có thể sử dụng CEN bình thường.
            </p>
          </button>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            type="button"
            disabled={submit.isPending}
            onClick={() => setPostponed(true)}
          >
            Để sau
          </Button>
          <Button
            type="button"
            loading={submit.isPending}
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {mode === "working" ? "Bắt đầu ngày làm việc" : "Vào CEN ở chế độ ngày nghỉ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
