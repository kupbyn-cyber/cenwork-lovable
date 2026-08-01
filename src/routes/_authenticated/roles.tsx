import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cenToast } from "@/components/ui/toast";
import { useOrgAccess } from "@/hooks/use-org-access";
import { setMemberRole } from "@/lib/org.functions";
import { ROLE_LABEL, membersQuery, type AppRole, type MemberRow } from "@/lib/org-data";
import {
  PERMISSION_GROUP,
  PERMISSION_LABEL,
  ROLE_ORDER,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Vai trò và quyền — CEN WORK" },
      {
        name: "description",
        content: "Ma trận vai trò và quyền hệ thống CEN WORK, kèm gán vai trò cho từng thành viên.",
      },
      { property: "og:title", content: "Vai trò và quyền — CEN WORK" },
      {
        property: "og:description",
        content: "Ma trận vai trò và quyền hệ thống CEN WORK, kèm gán vai trò cho từng thành viên.",
      },
    ],
  }),
  component: RolesPage,
});

const PERMISSION_KEYS = Object.keys(PERMISSION_LABEL) as PermissionKey[];

function PermissionMatrix() {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Ma trận quyền</CardTitle>
          <CardDescription>
            Bốn vai trò cố định của hệ thống. Quyền được áp dụng đồng thời ở giao diện, server và
            cơ sở dữ liệu.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">Quyền</TableHead>
                {ROLE_ORDER.map((role) => (
                  <TableHead key={role} className="whitespace-nowrap text-center">
                    {ROLE_LABEL[role]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_KEYS.map((permission) => (
                <TableRow key={permission}>
                  <TableCell className="min-w-[240px]">
                    <TableCellStack
                      primary={PERMISSION_LABEL[permission]}
                      secondary={PERMISSION_GROUP[permission]}
                    />
                  </TableCell>
                  {ROLE_ORDER.map((role) => {
                    const allowed = ROLE_PERMISSIONS[role].includes(permission);
                    return (
                      <TableCell key={role} className="text-center">
                        {allowed ? (
                          <Check
                            aria-label="Được phép"
                            className="mx-auto size-4 text-state-success"
                          />
                        ) : (
                          <Minus aria-label="Không được phép" className="mx-auto size-4 text-text-muted" />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

function RoleAssignment() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const membersResult = useQuery(membersQuery());
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { userId: string; role: AppRole }) => setMemberRole({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success("Đã cập nhật vai trò hệ thống.");
      setPendingId(null);
    },
    onError: (error: Error) => {
      cenToast.error(error.message);
      setPendingId(null);
    },
  });

  const columns = [
    {
      id: "member",
      header: "Thành viên",
      className: "min-w-[220px]",
      cell: (row: MemberRow) => (
        <TableCellStack primary={row.display_name} secondary={row.email} />
      ),
    },
    {
      id: "current",
      header: "Vai trò hiện tại",
      className: "min-w-[140px]",
      cell: (row: MemberRow) =>
        row.role ? (
          <Badge variant="brand-subtle" size="sm">
            {ROLE_LABEL[row.role]}
          </Badge>
        ) : (
          <span className="text-text-muted">Chưa gán</span>
        ),
    },
    {
      id: "assign",
      header: "Gán vai trò",
      className: "min-w-[190px]",
      cell: (row: MemberRow) => {
        const isSelf = row.id === access.userId;
        const disabled = !access.canChangeRoleOrTeam || isSelf || pendingId === row.id;
        return (
          <Select
            {...(row.role ? { value: row.role } : {})}
            disabled={disabled}
            onValueChange={(value) => {
              setPendingId(row.id);
              mutation.mutate({ userId: row.id, role: value as AppRole });
            }}
          >
            <SelectTrigger aria-label={`Vai trò của ${row.display_name}`}>
              <SelectValue placeholder="Chọn vai trò" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_ORDER.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABEL[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Gán vai trò</CardTitle>
          <CardDescription>
            {access.canChangeRoleOrTeam
              ? "Chỉ Admin và CMO được đổi vai trò. Không thể tự đổi vai trò của chính mình."
              : "Bạn chỉ có quyền xem. Việc đổi vai trò dành cho Admin và CMO."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={membersResult.data ?? []}
          getRowId={(row) => row.id}
          density="compact"
          loading={membersResult.isLoading}
          error={Boolean(membersResult.error)}
          onRetry={() => void membersResult.refetch()}
          errorTitle="Không tải được danh sách thành viên"
          emptyTitle="Chưa có thành viên trong phạm vi của bạn"
        />
      </CardContent>
    </Card>
  );
}

function RolesPage() {
  const access = useOrgAccess();

  if (!access.loading && !access.can("roles.view")) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Vai trò và quyền" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Trang vai trò và quyền chỉ dành cho Admin, CMO và Leader."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Vai trò và quyền"
        description="Bốn vai trò cố định: Admin, CMO, Leader, Member. Không tạo vai trò tùy chỉnh."
      />
      <PermissionMatrix />
      <RoleAssignment />
    </div>
  );
}
