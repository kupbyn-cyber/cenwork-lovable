import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  setWorkDay,
  WORK_SHIFT_OPTIONS,
  workShiftLabel,
  type WorkShift,
} from "@/lib/workday-data";

/**
 * WORKDAY-01 — thẻ trạng thái ngày làm việc trên CEN Today.
 * Ba trạng thái: đang làm việc, ngày nghỉ, chưa xác nhận (không coi là nghỉ).
 */
export function WorkdayCard() {
  const today = useWorkDayToday();
  const queryClient = useQueryClient();
  const [shift, setShift] = React.useState<WorkShift>("full_day");

  const start = useMutation({
    mutationFn: () => setWorkDay({ status: "working", shift, source: "today" }),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["work-day-today"] });
      cenToast.success(
        `Đã ghi nhận ngày làm việc — ${workShiftLabel(row.shift_type)} · ${formatHanoiTime(row.started_at)}`,
      );
    },
    onError: () => cenToast.error("Không thể ghi nhận ngày làm việc. Vui lòng thử lại."),
  });

  if (!today.isSuccess) return null;
  const record = today.data.record;

  return (
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
                Bạn vẫn có thể xem thông báo và xử lý việc khi cần.
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

        {record?.day_status === "working" ? null : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select value={shift} onValueChange={(value) => setShift(value as WorkShift)}>
              <SelectTrigger className="w-40" aria-label="Chọn ca làm việc">
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
            <Button
              type="button"
              size="sm"
              loading={start.isPending}
              disabled={start.isPending}
              onClick={() => start.mutate()}
            >
              {record ? "Bắt đầu làm việc" : "Xác nhận ngay"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
