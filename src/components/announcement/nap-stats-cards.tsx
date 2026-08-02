import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { napStatsQuery, type NapOperationStats } from "@/lib/nap-stats-data";
import { cn } from "@/lib/utils";

/**
 * NAP-06 — Thẻ thống kê vận hành (chỉ đếm số lượng, không có chỉ số hiệu suất
 * cá nhân). Mỗi số liệu bấm được để mở danh sách đã lọc tương ứng.
 */
export type NapStatsScope = "announcement" | "approval";

interface StatItem {
  key: string;
  label: string;
  value: number;
  tone?: "danger" | "default";
  onSelect?: () => void;
}

interface NapStatsCardsProps {
  scope: NapStatsScope;
  onSelect?: (filter: string) => void;
}

function buildItems(
  scope: NapStatsScope,
  stats: NapOperationStats,
  onSelect?: (filter: string) => void,
): StatItem[] {
  const pick = (filter: string) => (onSelect ? () => onSelect(filter) : undefined);
  if (scope === "announcement") {
    return [
      {
        key: "unconfirmed",
        label: "Tôi chưa xác nhận",
        value: stats.announcement_unconfirmed,
        onSelect: pick("unread"),
      },
      {
        key: "overdue",
        label: "Quá hạn xác nhận",
        value: stats.announcement_overdue,
        tone: "danger",
        onSelect: pick("overdue"),
      },
      ...(stats.is_admin
        ? [
            {
              key: "org_overdue",
              label: "Toàn hệ thống quá hạn",
              value: stats.org_announcement_overdue ?? 0,
              tone: "danger" as const,
            },
          ]
        : []),
    ];
  }
  return [
    {
      key: "pending_me",
      label: "Cần tôi phê duyệt",
      value: stats.approval_pending_me,
      onSelect: pick("pending"),
    },
    {
      key: "overdue_me",
      label: "Quá hạn xử lý",
      value: stats.approval_overdue_me,
      tone: "danger",
      onSelect: pick("overdue"),
    },
    {
      key: "sent_approved",
      label: "Tôi gửi — đã phê duyệt",
      value: stats.approval_sent_approved,
      onSelect: pick("approved"),
    },
    {
      key: "sent_rejected",
      label: "Tôi gửi — đã từ chối",
      value: stats.approval_sent_rejected,
      onSelect: pick("rejected"),
    },
    ...(stats.is_admin
      ? [
          {
            key: "org_pending",
            label: "Toàn hệ thống chờ xử lý",
            value: stats.org_approval_pending ?? 0,
          },
          {
            key: "org_overdue",
            label: "Toàn hệ thống quá hạn",
            value: stats.org_approval_overdue ?? 0,
            tone: "danger" as const,
          },
        ]
      : []),
  ];
}

export function NapStatsCards({ scope, onSelect }: NapStatsCardsProps) {
  const stats = useQuery(napStatsQuery());

  if (stats.isLoading) {
    return (
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[76px] w-full rounded-control" />
        ))}
      </div>
    );
  }

  if (stats.isError) {
    return (
      <ErrorState
        title="Không tải được thống kê"
        description="Thử lại để xem số liệu vận hành."
        onRetry={() => void stats.refetch()}
      />
    );
  }

  const items = buildItems(scope, stats.data, onSelect);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const content = (
          <CardContent className="flex min-w-0 flex-col gap-1 p-4">
            <span className="break-words text-helper text-text-muted">{item.label}</span>
            <span
              className={cn(
                "text-heading-md font-semibold",
                item.tone === "danger" && item.value > 0
                  ? "text-state-danger"
                  : "text-text-primary",
              )}
            >
              {item.value}
            </span>
          </CardContent>
        );
        if (!item.onSelect) {
          return <Card key={item.key}>{content}</Card>;
        }
        return (
          <Card
            key={item.key}
            asChild={false}
            className="cursor-pointer transition-colors duration-fast hover:bg-surface-raised"
          >
            <button
              type="button"
              aria-label={`${item.label}: ${item.value}`}
              className="w-full min-w-0 text-left"
              onClick={item.onSelect}
            >
              {content}
            </button>
          </Card>
        );
      })}
    </div>
  );
}
