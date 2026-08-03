import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, ListChecks } from "lucide-react";

import { DashboardCard } from "@/components/home/today-layout";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ACTION_MODULE_LABEL, type ActionItem } from "@/lib/today-hub";

/**
 * TODAY-RESET-01 — Hàng 3 (2/3): "Việc cần xử lý", tối đa 4 dòng.
 * Dữ liệu đã sắp xếp sẵn theo mức ưu tiên ở server; component chỉ hiển thị.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function span(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} phút`;
  if (ms < DAY) return `${Math.max(1, Math.round(ms / HOUR))} giờ`;
  return `${Math.max(1, Math.floor(ms / DAY))} ngày`;
}

function deadlineLabel(deadline: string | null): { text: string; danger: boolean } {
  if (!deadline) return { text: "Không có hạn", danger: false };
  const time = new Date(deadline).getTime();
  if (Number.isNaN(time)) return { text: "Không có hạn", danger: false };
  const diff = time - Date.now();
  return diff < 0
    ? { text: `Quá hạn ${span(-diff)}`, danger: true }
    : { text: `Còn ${span(diff)}`, danger: false };
}

export function ActionQueueCard({
  items,
  total,
  className,
}: {
  items: ActionItem[];
  total: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const preview = items.slice(0, 4);
  const remaining = total - preview.length;

  return (
    <DashboardCard
      size="compact"
      icon={ListChecks}
      title={`Việc cần xử lý (${total})`}
      className={className}
      {...(remaining > 0
        ? { to: "/today" as const, actionLabel: `Xem tất cả (${remaining})` }
        : {})}
      contentClassName="gap-2"
    >
      {preview.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Không có việc cần xử lý"
          description="Bạn đã xử lý hết nội dung ưu tiên trong phạm vi này."
        />
      ) : (
        preview.map((item) => {
          const due = deadlineLabel(item.deadline);
          return (
            <div
              key={item.key}
              className="flex min-w-0 items-center gap-3 rounded-card border border-border-default bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="text-caption tracking-[0.1em] text-text-muted uppercase">
                  {ACTION_MODULE_LABEL[item.module]}
                </span>
                <p className="min-w-0 truncate text-body font-medium text-text-primary">
                  {item.title}
                </p>
                <span
                  className={
                    due.danger ? "text-helper text-state-danger" : "text-helper text-text-muted"
                  }
                >
                  {due.text}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => void navigate({ to: item.target_route as never })}
              >
                Mở
                <ChevronRight />
              </Button>
            </div>
          );
        })
      )}
    </DashboardCard>
  );
}