import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatHanoiDateTime } from "@/lib/datetime";
import { REPORT_KIND_LABEL } from "@/lib/report-obligation-data";
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  reportDocsQuery,
  type ReportDocRow,
} from "@/lib/report-workflow-data";

/**
 * CEN 1.0 — REPORT-02: danh sách báo cáo theo kỳ mà người dùng được xem (RLS quyết định).
 */
export function ReportDocList() {
  const navigate = useNavigate();
  const docs = useQuery(reportDocsQuery());
  const rows = docs.data ?? [];

  const columns = [
    {
      id: "period",
      header: "Kỳ",
      cell: (row: ReportDocRow) => (
        <TableCellStack
          primary={`${REPORT_KIND_LABEL[row.report_type]} — ${row.period_key}`}
          secondary={row.projectName ?? row.teamName ?? undefined}
        />
      ),
    },
    {
      id: "author",
      header: "Người gửi",
      width: 160,
      cell: (row: ReportDocRow) => row.authorName ?? "—",
    },
    {
      id: "reviewer",
      header: "Người kiểm tra",
      width: 160,
      cell: (row: ReportDocRow) => row.reviewerName ?? "—",
    },
    {
      id: "due",
      header: "Hạn",
      width: 150,
      cell: (row: ReportDocRow) => (row.due_at ? formatHanoiDateTime(row.due_at) : "—"),
    },
    {
      id: "status",
      header: "Trạng thái",
      width: 140,
      cell: (row: ReportDocRow) => (
        <StatusBadge label={DOC_STATUS_LABEL[row.status]} tone={DOC_STATUS_TONE[row.status]} />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      density="compact"
      loading={docs.isLoading}
      error={docs.isError}
      onRetry={() => void docs.refetch()}
      errorTitle="Không tải được danh sách báo cáo"
      emptyTitle="Chưa có báo cáo theo kỳ"
      emptyDescription="Mở một nghĩa vụ ở tab Nghĩa vụ để bắt đầu soạn báo cáo."
      onRowClick={(row) => void navigate({ to: "/reports/doc/$reportId", params: { reportId: row.id } })}
    />
  );
}
