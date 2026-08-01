import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ListChecks, RefreshCw } from "lucide-react";

import { ActionItemRow } from "@/components/home/action-item-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTodayHub } from "@/hooks/use-today-hub";
import { PRIORITY_LABEL } from "@/lib/today-hub";

/**
 * CEN TODAY-01 — khối "Việc cần xử lý hôm nay" tại Trang chủ.
 * Dữ liệu tổng hợp phía server theo đúng phạm vi quyền của người dùng.
 */
export function DailyActionHub() {
  const { data, isLoading, isError, refetch, isFetching } = useTodayHub();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [allOpen, setAllOpen] = React.useState(false);

  const preview = React.useMemo(
    () => (data?.items ?? []).slice(0, isMobile ? 5 : 8),
    [data?.items, isMobile],
  );

  if (isLoading) return <SkeletonCard lines={4} />;

  if (isError || !data) {
    return (
      <Card>
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
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <ListChecks className="size-icon-sm shrink-0 text-state-warning" aria-hidden="true" />
            Việc cần xử lý ({data.total})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
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
              Làm mới
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-2">
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

          {remaining > 0 ? (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                if (isMobile) void navigate({ to: "/today" });
                else setAllOpen(true);
              }}
            >
              Xem tất cả ({data.total})
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <DrawerPanel
        open={allOpen}
        onOpenChange={setAllOpen}
        title={`Việc cần xử lý (${data.total})`}
        description="Sắp xếp theo mức ưu tiên, hạn xử lý và thời điểm phát sinh."
      >
        <div className="flex min-w-0 flex-col gap-2 p-4">
          {data.items.map((item) => (
            <ActionItemRow key={item.key} item={item} onDone={() => setAllOpen(false)} />
          ))}
        </div>
      </DrawerPanel>
    </>
  );
}
