import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PERMISSION_SOURCE_LABEL,
  SCOPE_LABEL,
  type CatalogRow,
  type DataScope,
  type PermissionMap,
} from "@/lib/permission-data";

/** ROLE-01 — xem quyền hiệu lực thực tế của một người dùng (không impersonation). */
export function EffectivePermissionsPanel({
  catalog,
  permissions,
}: {
  catalog: CatalogRow[];
  permissions: PermissionMap;
}) {
  const rows = catalog.filter((row) => permissions[row.permission_key]);
  if (rows.length === 0) {
    return <EmptyState title="Chưa có dữ liệu quyền" description="Chọn một người dùng để xem." />;
  }

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Quyền</TableHead>
            <TableHead className="min-w-[130px]">Kết quả</TableHead>
            <TableHead className="min-w-[150px]">Phạm vi dữ liệu</TableHead>
            <TableHead className="min-w-[150px]">Nguồn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const effective = permissions[row.permission_key]!;
            return (
              <TableRow key={row.permission_key}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-xs text-text-muted">{row.module}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={effective.enabled ? "success" : "neutral"} size="sm">
                    {effective.enabled ? "Được phép" : "Bị từ chối"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {effective.enabled
                    ? (SCOPE_LABEL[effective.data_scope as DataScope] ?? effective.data_scope)
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    {effective.locked ? <Lock className="size-3.5 text-text-muted" /> : null}
                    {PERMISSION_SOURCE_LABEL[effective.source] ?? effective.source}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
