import * as React from "react";
import { ListChecks, RefreshCw } from "lucide-react";

import { ActionItemRow } from "@/components/home/action-item-row";
import { DashboardCard, todaySpan } from "@/components/home/today-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useTodayHub } from "@/hooks/use-today-hub";
import { PRIORITY_LABEL } from "@/lib/today-hub";

/**
 * CEN TODAY-01 — khối "Việc cần xử lý hôm nay" tại Trang chủ.
 * Dữ liệu tổng hợp phía server theo đúng phạm vi quyền của người dùng.
 * TODAY-LAYOUT-RESET-01: chỉ hiển thị tóm tắt tối đa 5 dòng, "Xem thêm" mở trang /today.
 */
export function DailyActionHub({
  limit = 6,
  title = "Việc cần xử lý ngay",
}: {
  limit?: number;
  title?: string;
} = {}) {
  const { data, isLoading, isError, refetch, isFetching } = useTodayHub();

  const preview = React.useMemo(() => (data?.items ?? []).slice(0, limit), [data?.items, limit]);

  if (isLoading) {
    return (
      <div className={todaySpan("wide")}>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className={todaySpan("wide")}>
        <CardContent className="pt-(--card-pad)">
          <ErrorState
            variant="compact"
            title="Không tải được việc cần xử lý"
            onRetry={() => void refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const remaining = data.total - preview.length;

  return (
    <DashboardCard
      size="wide"
      icon={ListChecks}
      title={`${title} (${data.total})`}
      to="/today"
      actionLabel={remaining > 0 ? `Xem thêm (${remaining})` : "Xem thêm"}
      headerExtra={
        <>
          {data.counts.critical > 0 ? (
            <StatusBadge
              label={`${PRIORITY_LABEL.critical}: ${data.counts.critical}`}
              tone="error"
            />
          ) : null}
          {data.counts.high > 0 ? (
            <StatusBadge label={`${PRIORITY_LABEL.high}: ${data.counts.high}`} tone="warning" />
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
            aria-label="Làm mới danh sách"
          >
            <RefreshCw />
          </Button>
        </>
      }
    >
      {data.failedSources.length > 0 ? (
        <div className="rounded-card border border-state-danger/40 bg-surface-subtle px-3 py-2 text-helper text-state-danger">
          Một số nguồn dữ liệu chưa tải được ({data.failedSources.join(", ")}). Danh sách có thể
          thiếu mục.
        </div>
      ) : null}

      {data.total === 0 ? (
        <EmptyState
          variant="compact"
          title="Không có việc nào cần xử lý"
          description="Bạn đã xử lý hết các nội dung ưu tiên trong phạm vi của mình."
        />
      ) : (
        preview.map((item) => <ActionItemRow key={item.key} item={item} />)
      )}
    </DashboardCard>
  );
}
