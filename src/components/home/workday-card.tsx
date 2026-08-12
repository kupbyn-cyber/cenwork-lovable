import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Leaf, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useWorkDayToday } from "@/hooks/use-work-day";
import { formatHanoiTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  setWorkDay,
  WORK_SHIFT_OPTIONS,
  workShiftLabel,
  type WorkDayStatus,
  type WorkShift,
} from "@/lib/workday-data";

/**
 * WORKDAY-01 / WORKDAY-UI-FIX-01 — thẻ trạng thái ngày làm việc (block cuối CEN Today).
 * Ba trạng thái: đang làm việc, ngày nghỉ, chưa xác nhận (không coi là nghỉ).
 * Mọi thay đổi đi qua RPC work_day_set: cập nhật đúng bản ghi trong ngày, giữ audit.
 */
export function WorkdayCard() {
  const today = useWorkDayToday();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<WorkDayStatus>("working");
  const [shift, setShift] = React.useState<WorkShift>("full_day");

  const record = today.data?.record ?? null;

  const save = useMutation({
    mutationFn: () => setWorkDay({ status: mode, shift, source: "today" }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["work-day-today"] });
      setOpen(false);
      if (row.day_status === "working") {
        cenToast.success(
          `Đã cập nhật ngày làm việc — ${workShiftLabel(row.shift_type)} · ${formatHanoiTime(row.started_at)}`,
        );
      } else {
        cenToast.success("Đã ghi nhận hôm nay là ngày nghỉ.");
      }
    },
    onError: () => cenToast.error("Không thể cập nhật ngày làm việc. Vui lòng thử lại."),
  });

  // Mở popup với đúng trạng thái hiện tại để người dùng chỉ chỉnh phần cần đổi.
  const openDialog = React.useCallback(
    (preset?: WorkDayStatus) => {
      const nextMode = preset ?? (record?.day_status === "day_off" ? "day_off" : "working");
      setMode(nextMode);
      setShift(record?.shift_type ?? "full_day");
      setOpen(true);
    },
    [record],
  );

  if (!today.isSuccess) return null;

  return (
    <>
      <Card>
        <CardContent className="flex min-w-0 flex-col gap-3 pt-(--card-pad) sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {record?.day_status === "working" ? (
              <>
                <p className="text-label font-semibold text-text-primary">
                  🟢 Hôm nay: {workShiftLabel(record.shift_type)}
                </p>
                <p className="text-caption text-text-muted">
                  Bắt đầu lúc {formatHanoiTime(record.started_at)}
                </p>
              </>
            ) : record?.day_status === "day_off" ? (
              <>
                <p className="text-label font-semibold text-text-primary">🌿 Hôm nay: Ngày nghỉ</p>
                <p className="text-caption text-text-muted">
                  Bạn vẫn có thể sử dụng CEN bình thường.
                </p>
              </>
            ) : (
              <>
                <p className="text-label font-semibold text-text-primary">
                  ⚪ Chưa xác nhận ngày làm việc
                </p>
                <p className="text-caption text-text-muted">
                  Xác nhận để CEN ghi nhận đúng ngày làm việc của bạn.
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {record?.day_status === "day_off" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => openDialog("working")}>
                Bắt đầu làm việc
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={record ? "ghost" : "default"}
              onClick={() => openDialog()}
            >
              {record ? "Thay đổi" : "Xác nhận ngay"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => (!save.isPending ? setOpen(next) : undefined)}
      >
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Ngày làm việc hôm nay</DialogTitle>
            <DialogDescription>
              {record
                ? record.day_status === "working"
                  ? `Hiện tại: ${workShiftLabel(record.shift_type)}`
                  : "Hiện tại: Ngày nghỉ"
                : "Hiện tại: Chưa xác nhận"}
            </DialogDescription>
          </DialogHeader>

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
                Đây là ghi nhận trạng thái, không phải nghỉ phép đã duyệt.
              </p>
            </button>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              loading={save.isPending}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
