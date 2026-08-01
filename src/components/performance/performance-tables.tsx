import * as React from "react";
import { Lock } from "lucide-react";

import { DataTable, TableCellStack, type DataTableColumn } from "@/components/ui/data-table";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MetricLabel,
  PanelCard,
} from "@/components/performance/performance-primitives";
import {
  METRIC_TOOLTIP,
  formatHours,
  formatPercent,
  type PersonPerformance,
  type TeamPerformance,
} from "@/lib/performance";

/**
 * PERFORMANCE — bảng nhân sự, chi tiết Team và chi tiết nhân sự.
 * Không đánh số thứ hạng; sắp xếp theo tên để tránh hàm ý xếp loại.
 */
export function PeopleTable({ people }: { people: PersonPerformance[] }) {
  const [selected, setSelected] = React.useState<PersonPerformance | null>(null);
  const rows = React.useMemo(
    () => [...people].sort((a, b) => a.display_name.localeCompare(b.display_name, "vi")),
    [people],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-(--card-pad)">
          <EmptyState
            title="Không có nhân sự trong phạm vi"
            description="Chọn Team khác hoặc kiểm tra Team chính của nhân sự."
          />
        </CardContent>
      </Card>
    );
  }

  const columns: DataTableColumn<PersonPerformance>[] = [
    {
      id: "person",
      header: "Nhân sự",
      cell: (row) => (
        <TableCellStack
          primary={row.is_self ? `${row.display_name} (bạn)` : row.display_name}
          secondary={row.team_name ?? "Chưa có Team chính"}
        />
      ),
    },
    {
      id: "primary",
      header: <MetricLabel label="Phụ trách" hint={METRIC_TOOLTIP.primary} />,
      className: "w-[104px]",
      cell: (row) => row.workload.primary,
    },
    {
      id: "collab",
      header: <MetricLabel label="Phối hợp" hint={METRIC_TOOLTIP.collaborating} />,
      className: "w-[100px]",
      cell: (row) => row.workload.collaborating,
    },
    {
      id: "done",
      header: <MetricLabel label="Hoàn thành" hint={METRIC_TOOLTIP.done} />,
      className: "w-[110px]",
      cell: (row) => row.workload.done,
    },
    {
      id: "overdue",
      header: <MetricLabel label="Quá hạn" hint={METRIC_TOOLTIP.overdue} />,
      className: "w-[96px]",
      cell: (row) => (
        <span className={row.workload.overdue > 0 ? "text-state-danger" : undefined}>
          {row.workload.overdue}
        </span>
      ),
    },
    {
      id: "late",
      header: <MetricLabel label="Hoàn thành trễ" hint={METRIC_TOOLTIP.late_done} />,
      className: "w-[128px]",
      cell: (row) => row.workload.late_done,
    },
    {
      id: "completion",
      header: <MetricLabel label="Tỷ lệ hoàn thành" hint={METRIC_TOOLTIP.completion_rate} />,
      className: "w-[136px]",
      cell: (row) => formatPercent(row.efficiency.completion_rate),
    },
    {
      id: "ontime",
      header: <MetricLabel label="Đúng hạn" hint={METRIC_TOOLTIP.on_time_rate} />,
      className: "w-[104px]",
      cell: (row) => formatPercent(row.efficiency.on_time_rate),
    },
    {
      id: "action",
      header: "",
      className: "w-[92px]",
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Nhân sự trong phạm vi</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 pt-0">
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <DataTable
              data={rows}
              columns={columns}
              getRowId={(row) => row.user_id}
              density="compact"
            />
          </div>
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <button
                key={row.user_id}
                type="button"
                onClick={() => setSelected(row)}
                className="w-full rounded-control border border-border-default p-3 text-left"
              >
                <p className="font-medium">
                  {row.is_self ? `${row.display_name} (bạn)` : row.display_name}
                </p>
                <p className="text-xs text-text-muted">{row.team_name ?? "Chưa có Team chính"}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Phụ trách {row.workload.primary} · Phối hợp {row.workload.collaborating} · Hoàn
                  thành {row.workload.done} · Quá hạn {row.workload.overdue}
                </p>
                <p className="text-xs text-text-muted">
                  Hoàn thành {formatPercent(row.efficiency.completion_rate)} · Đúng hạn{" "}
                  {formatPercent(row.efficiency.on_time_rate)}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <PersonDetailDrawer person={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function DetailRow({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default py-1.5 text-sm last:border-b-0">
      <span className="text-text-secondary">
        <MetricLabel label={label} hint={hint} />
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function PersonDetailDrawer({
  person,
  onClose,
}: {
  person: PersonPerformance | null;
  onClose: () => void;
}) {
  return (
    <DrawerPanel
      open={person !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={person?.display_name ?? "Chi tiết nhân sự"}
      description={person?.team_name ?? undefined}
    >
      {person ? (
        <div className="space-y-5">
          <section>
            <h3 className="mb-1 text-sm font-semibold">Khối lượng</h3>
            <DetailRow
              label="Task phụ trách chính"
              hint={METRIC_TOOLTIP.primary}
              value={String(person.workload.primary)}
            />
            <DetailRow
              label="Task phối hợp"
              hint={METRIC_TOOLTIP.collaborating}
              value={String(person.workload.collaborating)}
            />
            <DetailRow
              label="Chưa bắt đầu"
              hint={METRIC_TOOLTIP.not_started}
              value={String(person.workload.not_started)}
            />
            <DetailRow
              label="Đang thực hiện"
              hint={METRIC_TOOLTIP.in_progress}
              value={String(person.workload.in_progress)}
            />
            <DetailRow
              label="Chờ kiểm tra"
              hint={METRIC_TOOLTIP.review}
              value={String(person.workload.review)}
            />
            <DetailRow
              label="Hoàn thành"
              hint={METRIC_TOOLTIP.done}
              value={String(person.workload.done)}
            />
            <DetailRow
              label="Quá hạn"
              hint={METRIC_TOOLTIP.overdue}
              value={String(person.workload.overdue)}
            />
            <DetailRow
              label="Hoàn thành trễ"
              hint={METRIC_TOOLTIP.late_done}
              value={String(person.workload.late_done)}
            />
            <DetailRow
              label="Task tồn từ kỳ trước"
              hint={METRIC_TOOLTIP.carried_over}
              value={String(person.workload.carried_over)}
            />
            <DetailRow
              label="Project tham gia"
              hint={METRIC_TOOLTIP.projects}
              value={String(person.workload.projects)}
            />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Hiệu suất</h3>
            <DetailRow
              label="Tỷ lệ hoàn thành"
              hint={METRIC_TOOLTIP.completion_rate}
              value={formatPercent(person.efficiency.completion_rate)}
            />
            <DetailRow
              label="Tỷ lệ đúng hạn"
              hint={METRIC_TOOLTIP.on_time_rate}
              value={formatPercent(person.efficiency.on_time_rate)}
            />
            <DetailRow
              label="Tỷ lệ quá hạn"
              hint={METRIC_TOOLTIP.overdue_rate}
              value={formatPercent(person.efficiency.overdue_rate)}
            />
            <DetailRow
              label="Thời gian hoàn thành trung bình"
              hint={METRIC_TOOLTIP.avg_completion_hours}
              value={formatHours(person.efficiency.avg_completion_hours)}
            />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Chất lượng</h3>
            {person.quality ? (
              <>
                <DetailRow
                  label="Task được duyệt ngay"
                  hint={METRIC_TOOLTIP.approved_direct}
                  value={String(person.quality.approved_direct)}
                />
                <DetailRow
                  label="Task bị yêu cầu sửa"
                  hint={METRIC_TOOLTIP.reworked_tasks}
                  value={String(person.quality.reworked_tasks)}
                />
                <DetailRow
                  label="Số lần yêu cầu sửa"
                  hint={METRIC_TOOLTIP.rework_events}
                  value={String(person.quality.rework_events)}
                />
                <DetailRow
                  label="Tỷ lệ bị yêu cầu sửa"
                  hint={METRIC_TOOLTIP.rework_rate}
                  value={formatPercent(person.quality.rework_rate)}
                />
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Lock className="size-3.5" aria-hidden="true" />
                Bạn không có quyền xem chỉ số chất lượng chi tiết của nhân sự này.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Báo cáo</h3>
            {person.reports ? (
              <>
                <DetailRow
                  label="Báo cáo phải gửi"
                  hint={METRIC_TOOLTIP.reports_required}
                  value={String(person.reports.required)}
                />
                <DetailRow
                  label="Đã gửi"
                  hint={METRIC_TOOLTIP.reports_submitted}
                  value={String(person.reports.submitted)}
                />
                <DetailRow
                  label="Đúng hạn"
                  hint={METRIC_TOOLTIP.reports_on_time}
                  value={String(person.reports.on_time)}
                />
                <DetailRow
                  label="Muộn hoặc thiếu"
                  hint={METRIC_TOOLTIP.reports_late}
                  value={String(person.reports.late_or_missing)}
                />
                <DetailRow
                  label="Bị yêu cầu chỉnh sửa"
                  hint={METRIC_TOOLTIP.reports_revision}
                  value={String(person.reports.revision_required)}
                />
                <DetailRow
                  label="Báo cáo tuần của Team"
                  hint={METRIC_TOOLTIP.reports_weekly}
                  value={String(person.reports.weekly_team)}
                />
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Lock className="size-3.5" aria-hidden="true" />
                Bạn không có quyền xem tình trạng báo cáo muộn hoặc thiếu của nhân sự này.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Ghi nhận</h3>
            <DetailRow
              label="Số lần được ghi nhận"
              hint={METRIC_TOOLTIP.recognition_received}
              value={String(person.recognition.received)}
            />
            <DetailRow
              label="Lượt bình chọn đồng đội"
              hint={METRIC_TOOLTIP.votes_received}
              value={String(person.recognition.votes_received)}
            />
            {person.recognition.categories.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.recognition.categories.map((category) => (
                  <Badge key={category.key} variant="secondary">
                    {category.label}: {category.count}
                  </Badge>
                ))}
              </div>
            ) : null}
            {person.recognition.awards.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.recognition.awards.map((award) => (
                  <Badge key={award}>{award}</Badge>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </DrawerPanel>
  );
}

export function TeamDetails({ teams }: { teams: TeamPerformance[] }) {
  if (teams.length === 0) {
    return <PanelCard title="Chi tiết Team" empty="Chưa có dữ liệu Team trong phạm vi." children={null} />;
  }
  return (
    <PanelCard title="Chi tiết Team" hint="Tổng hợp từ nhân sự có Team chính thuộc Team đó. Team phối hợp không được cộng vào.">
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <div key={team.team_id} className="rounded-control border border-border-default p-3">
            <p className="font-medium">{team.team_name}</p>
            <p className="text-xs text-text-muted">
              {team.members} nhân sự{team.leader_name ? ` · Leader ${team.leader_name}` : ""}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm">
              <span className="text-text-secondary">Task phụ trách</span>
              <span className="text-right font-medium">{team.workload.primary}</span>
              <span className="text-text-secondary">Hoàn thành</span>
              <span className="text-right font-medium">{team.workload.done}</span>
              <span className="text-text-secondary">Quá hạn</span>
              <span className="text-right font-medium">{team.workload.overdue}</span>
              <span className="text-text-secondary">Hoàn thành trễ</span>
              <span className="text-right font-medium">{team.workload.late_done}</span>
              <span className="text-text-secondary">Tỷ lệ đúng hạn</span>
              <span className="text-right font-medium">
                {formatPercent(team.efficiency.on_time_rate)}
              </span>
              {team.reports ? (
                <>
                  <span className="text-text-secondary">Báo cáo muộn/thiếu</span>
                  <span className="text-right font-medium">{team.reports.late_or_missing}</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
