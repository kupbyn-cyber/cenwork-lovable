import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgAccess } from "@/hooks/use-org-access";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  auditActionLabel,
  auditLogsQuery,
  formatAuditTime,
  summarizeChange,
  type AuditLogRow,
} from "@/lib/audit-data";

export const Route = createFileRoute("/_authenticated/audit-logs")({
  head: () => ({
    meta: [
      { title: "Nhật ký hoạt động — CEN WORK" },
      {
        name: "description",
        content:
          "Nhật ký hoạt động quản trị CEN WORK: tài khoản, vai trò, Team, Cơ sở và cấu hình hệ thống.",
      },
      { property: "og:title", content: "Nhật ký hoạt động — CEN WORK" },
      {
        property: "og:description",
        content:
          "Nhật ký hoạt động quản trị CEN WORK: tài khoản, vai trò, Team, Cơ sở và cấu hình hệ thống.",
      },
    ],
  }),
  component: AuditLogsPage,
});

const ALL = "__all__";

function AuditLogsPage() {
  const access = useOrgAccess();
  const [actor, setActor] = React.useState("");
  const [action, setAction] = React.useState(ALL);
  const [entityType, setEntityType] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const filters = React.useMemo(
    () => ({
      ...(actor.trim() ? { actor: actor.trim() } : {}),
      ...(action !== ALL ? { action } : {}),
      ...(entityType !== ALL ? { entityType } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [actor, action, entityType, from, to],
  );

  const result = useQuery({ ...auditLogsQuery(filters), enabled: access.canViewAudit });

  const columns = [
    {
      id: "time",
      header: "Thời gian",
      className: "min-w-[150px] whitespace-nowrap",
      cell: (row: AuditLogRow) => (
        <span className="text-text-secondary">{formatAuditTime(row.created_at)}</span>
      ),
    },
    {
      id: "actor",
      header: "Người thực hiện",
      className: "min-w-[180px]",
      cell: (row: AuditLogRow) => (
        <TableCellStack primary={row.actor_email ?? "Hệ thống"} secondary={row.user_id ?? "—"} />
      ),
    },
    {
      id: "action",
      header: "Hành động",
      className: "min-w-[180px]",
      cell: (row: AuditLogRow) => (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-text-primary">{auditActionLabel(row.action)}</span>
          <Badge variant={row.result === "success" ? "success" : "error"} size="sm">
            {row.result === "success" ? "Thành công" : "Thất bại"}
          </Badge>
        </div>
      ),
    },
    {
      id: "entity",
      header: "Đối tượng",
      className: "min-w-[170px]",
      cell: (row: AuditLogRow) => (
        <TableCellStack
          primary={AUDIT_ENTITY_LABEL[row.entity_type ?? ""] ?? row.entity_type ?? "—"}
          secondary={row.entity_id ?? "—"}
        />
      ),
    },
    {
      id: "change",
      header: "Thay đổi",
      className: "min-w-[260px]",
      cell: (row: AuditLogRow) => (
        <div className="min-w-0 text-helper text-text-muted">
          <p className="truncate">Trước: {summarizeChange(row.before_data)}</p>
          <p className="truncate">Sau: {summarizeChange(row.after_data)}</p>
        </div>
      ),
    },
  ];

  if (!access.loading && !access.canViewAudit) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Nhật ký hoạt động" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Nhật ký hoạt động quản trị chỉ dành cho Admin và CMO."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Nhật ký hoạt động"
        description="Ghi nhận tự động các thay đổi quan trọng. Bản ghi không thể sửa hoặc xóa."
      />

      <Card>
        <CardContent>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Input
              aria-label="Tìm theo người thực hiện"
              placeholder="Email người thực hiện"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            />
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger aria-label="Lọc theo hành động">
                <SelectValue placeholder="Hành động" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả hành động</SelectItem>
                {Object.keys(AUDIT_ACTION_LABEL).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AUDIT_ACTION_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger aria-label="Lọc theo đối tượng">
                <SelectValue placeholder="Đối tượng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả đối tượng</SelectItem>
                {Object.keys(AUDIT_ENTITY_LABEL).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AUDIT_ENTITY_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="Từ ngày"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Input
              type="date"
              aria-label="Đến ngày"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={result.data ?? []}
        getRowId={(row) => row.id}
        density="compact"
        loading={result.isLoading || access.loading}
        error={Boolean(result.error)}
        onRetry={() => void result.refetch()}
        errorTitle="Không tải được nhật ký hoạt động"
        emptyTitle="Chưa có bản ghi phù hợp"
        emptyDescription="Thay đổi bộ lọc để xem các hoạt động khác."
      />
    </div>
  );
}
