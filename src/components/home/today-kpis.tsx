import { Card, CardContent } from "@/components/ui/card";
import type { TodayMetrics } from "@/lib/today-metrics";
import type { TodayViewRole } from "@/lib/today-metrics";
import { RANGE_DUE_LABEL, RANGE_PHRASE, type TodayRange } from "@/lib/today-range";

/**
 * TODAY-RESET-01 — Hàng 2: bốn KPI bằng nhau, đổi nội dung theo vai trò và phạm vi.
 * Chỉ trình bày lại số liệu đã tính ở lớp today-metrics.
 */
const TONE = {
  brand: "before:bg-brand-primary",
  yellow: "before:bg-accent-yellow",
  orange: "before:bg-accent-orange",
  danger: "before:bg-state-danger",
} as const;

interface Kpi {
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof TONE;
}

export function buildKpis(
  role: TodayViewRole,
  metrics: TodayMetrics,
  range: TodayRange,
): Kpi[] {
  const dueLabel = RANGE_DUE_LABEL[range];
  const phrase = RANGE_PHRASE[range];
  if (role === "member") {
    return [
      {
        label: "Việc đang mở của tôi",
        value: metrics.open_count,
        hint: "Công việc chưa hoàn thành",
        tone: "brand",
      },
      {
        label: "Việc tôi cần xử lý",
        value: metrics.pending_action_count,
        hint: `Nội dung cần bạn xử lý ${phrase}`,
        tone: "yellow",
      },
      { label: dueLabel, value: metrics.due_in_range_count, hint: "Việc của tôi", tone: "orange" },
      {
        label: "Việc của tôi quá hạn",
        value: metrics.overdue_count,
        hint: "Cần xử lý ngay",
        tone: "danger",
      },
    ];
  }
  if (role === "leader") {
    return [
      {
        label: "Dự án Team đang triển khai",
        value: metrics.active_projects,
        hint: "Dự án đã duyệt và đang chạy",
        tone: "brand",
      },
      {
        label: "Việc Team cần xử lý",
        value: metrics.pending_action_count,
        hint: `Nội dung cần xử lý ${phrase}`,
        tone: "yellow",
      },
      {
        label: dueLabel,
        value: metrics.due_in_range_count,
        hint: "Công việc của Team",
        tone: "orange",
      },
      {
        label: "Việc Team quá hạn",
        value: metrics.overdue_count,
        hint: "Đã trễ deadline",
        tone: "danger",
      },
    ];
  }
  return [
    {
      label: "Dự án đang triển khai",
      value: metrics.active_projects,
      hint: "Toàn hệ thống",
      tone: "brand",
    },
    {
      label: "Công việc cần xử lý",
      value: metrics.pending_action_count,
      hint: `Nội dung cần xử lý ${phrase}`,
      tone: "yellow",
    },
    { label: dueLabel, value: metrics.due_in_range_count, hint: "Toàn hệ thống", tone: "orange" },
    {
      label: "Công việc quá hạn",
      value: metrics.overdue_count,
      hint: "Toàn hệ thống",
      tone: "danger",
    },
  ];
}

export function TodayKpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.label}
          density="compact"
          className={`relative h-full overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${TONE[item.tone]}`}
        >
          <CardContent className="flex h-full flex-col gap-1 pt-(--card-pad) pl-4">
            <span className="text-caption tracking-[0.12em] text-text-muted uppercase">
              {item.label}
            </span>
            <span className="cen-kpi text-text-primary">{item.value}</span>
            <span className="min-w-0 text-helper text-text-muted">{item.hint}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}