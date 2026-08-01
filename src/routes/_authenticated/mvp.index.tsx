import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDate } from "@/lib/datetime";
import { mvpCyclesQuery, type MvpCycleRow } from "@/lib/mvp-data";
import { createMvpCycle } from "@/lib/mvp.functions";
import {
  MVP_CYCLE_STATUS_LABEL,
  MVP_CYCLE_STATUS_TONE,
  MVP_TOTAL_MAX,
} from "@/lib/mvp-scoring";
import { hanoiToday, weekStartOf } from "@/lib/report-data";
import { PERMISSIONS } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/mvp/")({
  head: () => ({
    meta: [
      { title: "MVP và danh hiệu — CEN WORK" },
      {
        name: "description",
        content:
          "Ghi nhận thành tích hằng tuần của CEN WORK: bảng điểm minh bạch, phiếu bầu đồng đội và sáu danh hiệu.",
      },
      { property: "og:title", content: "MVP và danh hiệu — CEN WORK" },
      {
        property: "og:description",
        content:
          "Ghi nhận thành tích hằng tuần của CEN WORK: bảng điểm minh bạch, phiếu bầu đồng đội và sáu danh hiệu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MvpCyclesPage,
});

function MvpCyclesPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cycles = useQuery({ ...mvpCyclesQuery(), enabled: access.can(PERMISSIONS.MVP_VIEW) });

  const [open, setOpen] = React.useState(false);
  const [weekStart, setWeekStart] = React.useState(() => weekStartOf(hanoiToday()));
  const [error, setError] = React.useState<string | undefined>(undefined);

  const create = useServerFn(createMvpCycle);
  const mutation = useMutation({
    mutationFn: () => create({ data: { weekStart } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["mvp-cycles"] });
      setOpen(false);
      cenToast.success("Đã mở kỳ MVP mới");
      void navigate({ to: "/mvp/$cycleId", params: { cycleId: result.cycleId } });
    },
    onError: (err: Error) => cenToast.error("Không tạo được kỳ", { description: err.message }),
  });

  const columns = [
    {
      id: "week",
      header: "Tuần",
      className: "min-w-[200px]",
      cell: (row: MvpCycleRow) => (
        <TableCellStack
          primary={`${formatHanoiDate(row.week_start)} – ${formatHanoiDate(row.week_end)}`}
          secondary={row.published_at ? `Công bố ${formatHanoiDate(row.published_at)}` : "Chưa công bố"}
        />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[170px]",
      cell: (row: MvpCycleRow) => (
        <StatusBadge
          label={MVP_CYCLE_STATUS_LABEL[row.status]}
          tone={MVP_CYCLE_STATUS_TONE[row.status]}
        />
      ),
    },
    {
      id: "vote",
      header: "Thời gian vote",
      className: "min-w-[200px]",
      cell: (row: MvpCycleRow) => (
        <span className="text-text-secondary">
          {row.vote_opens_at
            ? `${formatHanoiDate(row.vote_opens_at)} – ${formatHanoiDate(row.vote_closes_at)}`
            : "Chưa mở"}
        </span>
      ),
    },
  ];

  if (!access.loading && !access.can(PERMISSIONS.MVP_VIEW)) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="MVP và danh hiệu" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Bạn chưa được cấp quyền xem MVP và danh hiệu."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="MVP và danh hiệu"
        description={`Mỗi kỳ chấm trên thang ${MVP_TOTAL_MAX} điểm: 75 điểm từ dữ liệu hệ thống và 25 điểm đánh giá thực tế.`}
        actions={
          access.can(PERMISSIONS.MVP_MANAGE) ? (
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Mở kỳ MVP
            </Button>

          ) : null
        }
      />

      <DataTable
        columns={columns}
        data={cycles.data ?? []}
        getRowId={(row) => row.id}
        onRowClick={(row) => void navigate({ to: "/mvp/$cycleId", params: { cycleId: row.id } })}
        loading={cycles.isLoading || access.loading}
        error={Boolean(cycles.error)}
        onRetry={() => void cycles.refetch()}
        errorTitle="Không tải được danh sách kỳ MVP"
        emptyTitle="Chưa có kỳ MVP nào"
        emptyDescription="Mở kỳ đầu tiên để hệ thống bắt đầu thu thập dữ liệu chấm điểm."
      />

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Mở kỳ MVP mới"
        description="Kỳ chạy theo tuần, bắt đầu từ thứ Hai."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={() => {
                const normalized = weekStartOf(weekStart);
                if (normalized !== weekStart) {
                  setWeekStart(normalized);
                  setError("Đã tự chuyển về thứ Hai của tuần đã chọn. Xác nhận lại để tạo kỳ.");
                  return;
                }
                setError(undefined);
                mutation.mutate();
              }}
            >
              Tạo kỳ
            </Button>
          </>
        }
      >
        <FormField id="mvp-week-start" label="Tuần bắt đầu" required error={error}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          )}
        </FormField>
      </Modal>
    </div>
  );
}
