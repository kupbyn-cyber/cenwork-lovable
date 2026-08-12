import * as React from "react";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  RECURRENCE_FREQ_LABEL,
  WEEKDAYS,
  recurrenceSummary,
  type RecurrenceSchedule,
  type TaskRecurrenceFreq,
} from "@/lib/task-recurrence";

/**
 * TASK-RECUR-01 — Nhóm trường "Cài đặt lịch lặp" dùng chung cho form tạo Task
 * và modal chỉnh lịch lặp. Không đổi bố cục các trường Task hiện có.
 */
export interface RecurrenceFieldsProps {
  value: RecurrenceSchedule;
  onChange: (next: RecurrenceSchedule) => void;
  error?: string | undefined;
  idPrefix?: string;
}

export function RecurrenceFields({
  value,
  onChange,
  error,
  idPrefix = "recur",
}: RecurrenceFieldsProps) {
  const patch = (next: Partial<RecurrenceSchedule>) => onChange({ ...value, ...next });
  const [limited, setLimited] = React.useState(Boolean(value.endDate));

  const toggleDay = (day: number) => {
    const has = value.weekdays.includes(day);
    patch({
      weekdays: has
        ? value.weekdays.filter((item) => item !== day)
        : [...value.weekdays, day].sort((a, b) => a - b),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface-subtle p-4">
      <p className="text-body-sm font-semibold text-text-primary">Cài đặt lịch lặp</p>

      {value.freq === "weekly" ? (
        <div className="flex flex-col gap-2">
          <span className="text-helper text-text-secondary">Lặp vào</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = value.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={day.label}
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    "min-h-11 min-w-11 rounded-badge border px-3 text-body-sm transition-colors",
                    active
                      ? "border-transparent bg-brand-primary text-text-on-brand"
                      : "border-border-subtle bg-surface-card text-text-secondary",
                  )}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {value.freq === "monthly" ? (
        <FormField id={`${idPrefix}-month-day`} label="Ngày lặp trong tháng" required>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={1}
              max={31}
              value={value.monthDay ?? ""}
              onChange={(event) =>
                patch({ monthDay: event.target.value ? Number(event.target.value) : null })
              }
            />
          )}
        </FormField>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-start`} label="Ngày bắt đầu" required>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={value.startDate}
              onChange={(event) => patch({ startDate: event.target.value })}
            />
          )}
        </FormField>
        <FormField id={`${idPrefix}-time`} label="Giờ deadline mỗi kỳ" required>
          {(control) => (
            <Input
              {...control}
              type="time"
              step={60}
              value={value.deadlineTime}
              onChange={(event) => patch({ deadlineTime: event.target.value })}
            />
          )}
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-helper text-text-secondary">Kết thúc</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-h-11 items-center gap-2 text-body-sm">
            <input
              type="radio"
              name={`${idPrefix}-end`}
              checked={!limited}
              onChange={() => {
                setLimited(false);
                patch({ endDate: null });
              }}
            />
            Không giới hạn
          </label>
          <label className="flex min-h-11 items-center gap-2 text-body-sm">
            <input
              type="radio"
              name={`${idPrefix}-end`}
              checked={limited}
              onChange={() => setLimited(true)}
            />
            Chọn ngày kết thúc
          </label>
          {limited ? (
            <Input
              type="date"
              aria-label="Ngày kết thúc"
              className="sm:w-[180px]"
              value={value.endDate ?? ""}
              onChange={(event) => patch({ endDate: event.target.value || null })}
            />
          ) : null}
        </div>
      </div>

      <p className="text-helper text-text-secondary">
        ↻{" "}
        {recurrenceSummary({
          freq: value.freq,
          weekdays: value.weekdays,
          month_day: value.monthDay,
          deadline_time: value.deadlineTime,
        })}
      </p>
      {error ? <p className="text-helper text-state-error">{error}</p> : null}
    </div>
  );
}

export function defaultSchedule(
  freq: TaskRecurrenceFreq,
  startDate: string,
  deadlineTime: string,
): RecurrenceSchedule {
  return {
    freq,
    startDate,
    endDate: null,
    deadlineTime: deadlineTime || "17:00",
    weekdays: [],
    monthDay: null,
  };
}

export const FREQ_LABEL = RECURRENCE_FREQ_LABEL;
