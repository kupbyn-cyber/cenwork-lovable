import { createFileRoute } from "@tanstack/react-router";

import { ActionItemRow } from "@/components/home/action-item-row";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useTodayHub } from "@/hooks/use-today-hub";

/**
 * CEN TODAY-01 — trang danh sách đầy đủ việc cần xử lý (đích của "Xem tất cả" trên mobile).
 * Dùng chung cache và thứ tự ưu tiên với khối trên Trang chủ.
 */
export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Việc cần xử lý hôm nay — CEN WORK" },
      {
        name: "description",
        content:
          "Danh sách đầy đủ công việc, dự án, báo cáo và thông báo cần bạn xử lý trong CEN WORK.",
      },
      { property: "og:title", content: "Việc cần xử lý hôm nay — CEN WORK" },
      {
        property: "og:description",
        content:
          "Danh sách đầy đủ công việc, dự án, báo cáo và thông báo cần bạn xử lý trong CEN WORK.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const { data, isLoading, isError, refetch } = useTodayHub();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title="Việc cần xử lý"
        description="Sắp xếp theo mức ưu tiên, hạn xử lý và thời điểm phát sinh."
      />
      {isLoading ? (
        <SkeletonCard lines={5} />
      ) : isError || !data ? (
        <Card>
          <CardContent className="pt-(--card-pad)">
            <ErrorState onRetry={() => void refetch()} />
          </CardContent>
        </Card>
      ) : data.total === 0 ? (
        <Card>
          <CardContent className="pt-(--card-pad)">
            <EmptyState
              title="Không có việc nào cần xử lý"
              description="Bạn đã xử lý hết các nội dung ưu tiên trong phạm vi của mình."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {data.items.map((item) => (
            <ActionItemRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
