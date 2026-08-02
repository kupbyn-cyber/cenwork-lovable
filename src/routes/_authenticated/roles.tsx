import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cenToast } from "@/components/ui/toast";
import { EffectivePermissionsPanel } from "@/components/permissions/effective-permissions-panel";
import { PermissionHistoryPanel } from "@/components/permissions/permission-history-panel";
import {
  PermissionSaveModal,
  describeState,
  type DiffLine,
} from "@/components/permissions/permission-save-modal";
import { RoleMatrixPanel, cellKey, type CellKey, type CellState } from "@/components/permissions/role-matrix-panel";
import {
  UserOverridePanel,
  overrideDraftFrom,
  type OverrideDraft,
} from "@/components/permissions/user-override-panel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgAccess } from "@/hooks/use-org-access";
import { setMemberRole } from "@/lib/org.functions";
import { ROLE_LABEL, membersQuery, type AppRole, type MemberRow } from "@/lib/org-data";
import {
  applyPermissionChanges,
  clearUserOverrides,
  effectivePermissionsOfQuery,
  permissionCatalogQuery,
  roleConfigQuery,
  systemOwnersQuery,
  userOverridesQuery,
  type CatalogRow,
  type PermissionChange,
} from "@/lib/permission-data";
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_ORDER,
  type AppRoleKey,
  type PermissionKey,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Vai trò và phân quyền động — CEN WORK" },
      {
        name: "description",
        content:
          "Cấu hình quyền và phạm vi dữ liệu cho Admin, CMO, Leader, Member; ngoại lệ cá nhân và lịch sử thay đổi.",
      },
      { property: "og:title", content: "Vai trò và phân quyền động — CEN WORK" },
      {
        property: "og:description",
        content:
          "Cấu hình quyền và phạm vi dữ liệu cho từng vai trò, ngoại lệ cá nhân và khôi phục cấu hình.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

/** Phạm vi mặc định theo vai trò — trùng với logic seed trong database. */
function defaultScope(role: AppRoleKey, catalog: CatalogRow): string {
  const preference =
    role === "leader"
      ? ["team", "related_projects", "assigned_or_participating", "own", "organization"]
      : role === "member"
        ? ["assigned_or_participating", "own", "team", "related_projects", "organization"]
        : ["organization", "team", "related_projects", "assigned_or_participating", "own"];
  return preference.find((scope) => catalog.allowed_scopes.includes(scope)) ?? catalog.allowed_scopes[0]!;
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
      void queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
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
      cell: (row: MemberRow) => <TableCellStack primary={row.display_name} secondary={row.email} />,
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
              ? "Không thể tự đổi vai trò của chính mình."
              : "Bạn chỉ có quyền xem. Việc đổi vai trò cần quyền gán vai trò hệ thống."}
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
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const catalogResult = useQuery(permissionCatalogQuery());
  const configResult = useQuery(roleConfigQuery());
  const owners = useQuery(systemOwnersQuery());
  const members = useQuery(membersQuery());

  const catalog = React.useMemo(() => catalogResult.data ?? [], [catalogResult.data]);
  const canManage = access.canManagePermissions;

  // ---------- tab: theo vai trò ----------
  const [editingRoles, setEditingRoles] = React.useState(false);
  const [roleDraft, setRoleDraft] = React.useState<Record<CellKey, CellState>>({});
  const [activeRole, setActiveRole] = React.useState<AppRoleKey>("member");

  const baseStates = React.useMemo(() => {
    const map: Record<CellKey, CellState> = {};
    for (const row of configResult.data ?? []) {
      map[cellKey(row.role, row.permission_key)] = {
        enabled: row.enabled,
        data_scope: row.data_scope,
      };
    }
    return map;
  }, [configResult.data]);

  const roleStates = React.useMemo(
    () => ({ ...baseStates, ...roleDraft }),
    [baseStates, roleDraft],
  );

  const roleChangedKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const [key, value] of Object.entries(roleDraft)) {
      const base = baseStates[key as CellKey];
      if (!base || base.enabled !== value.enabled || base.data_scope !== value.data_scope) {
        set.add(key);
      }
    }
    return set;
  }, [roleDraft, baseStates]);

  const roleChanges: PermissionChange[] = React.useMemo(
    () =>
      [...roleChangedKeys].map((key) => {
        const [role, permission] = key.split("|") as [AppRoleKey, string];
        const state = roleStates[key as CellKey]!;
        return {
          scope: "role" as const,
          role,
          permission_key: permission,
          enabled: state.enabled,
          data_scope: state.data_scope,
        };
      }),
    [roleChangedKeys, roleStates],
  );

  const roleDiff: DiffLine[] = React.useMemo(
    () =>
      [...roleChangedKeys].map((key) => {
        const [role, permission] = key.split("|") as [AppRoleKey, string];
        const info = catalog.find((row) => row.permission_key === permission);
        const before = baseStates[key as CellKey];
        const after = roleStates[key as CellKey]!;
        return {
          key,
          label: info?.label ?? permission,
          target: `Vai trò: ${ROLE_LABEL[role]}`,
          before: before ? describeState(before.enabled, before.data_scope) : "Không cho phép",
          after: describeState(after.enabled, after.data_scope),
          sensitive: Boolean(info?.is_sensitive),
        };
      }),
    [roleChangedKeys, baseStates, roleStates, catalog],
  );

  // ---------- tab: ngoại lệ cá nhân ----------
  const [overrideUserId, setOverrideUserId] = React.useState<string | null>(null);
  const [editingOverrides, setEditingOverrides] = React.useState(false);
  const [overrideDraft, setOverrideDraft] = React.useState<Record<string, OverrideDraft>>({});
  const overridesResult = useQuery(userOverridesQuery(overrideUserId));

  const overrideBase = React.useMemo(() => {
    const map: Record<string, OverrideDraft> = {};
    for (const row of overridesResult.data ?? []) map[row.permission_key] = overrideDraftFrom(row);
    return map;
  }, [overridesResult.data]);

  const overrideStates = React.useMemo(
    () => ({ ...overrideBase, ...overrideDraft }),
    [overrideBase, overrideDraft],
  );

  const overrideTargetRole = React.useMemo(() => {
    const member = (members.data ?? []).find((row) => row.id === overrideUserId);
    return (member?.role ?? "member") as AppRoleKey;
  }, [members.data, overrideUserId]);

  const overrideRoleStates = React.useMemo(() => {
    const map: Record<string, { enabled: boolean; data_scope: string }> = {};
    for (const row of catalog) {
      const state = roleStates[cellKey(overrideTargetRole, row.permission_key)];
      if (state) map[row.permission_key] = state;
    }
    return map;
  }, [catalog, roleStates, overrideTargetRole]);

  const overrideChangedKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const [key, draft] of Object.entries(overrideDraft)) {
      const base = overrideBase[key] ?? { choice: "inherit", data_scope: null, reason: "" };
      if (
        base.choice !== draft.choice ||
        base.data_scope !== draft.data_scope ||
        base.reason !== draft.reason
      ) {
        set.add(key);
      }
    }
    return set;
  }, [overrideDraft, overrideBase]);

  const overrideChanges: PermissionChange[] = React.useMemo(() => {
    if (!overrideUserId) return [];
    return [...overrideChangedKeys].map((key) => {
      const draft = overrideStates[key]!;
      return {
        scope: "user" as const,
        user_id: overrideUserId,
        permission_key: key,
        override_type: draft.choice === "inherit" ? null : draft.choice,
        data_scope: draft.choice === "allow" ? draft.data_scope : null,
        reason: draft.reason,
      };
    });
  }, [overrideChangedKeys, overrideStates, overrideUserId]);

  const overrideDiff: DiffLine[] = React.useMemo(() => {
    const member = (members.data ?? []).find((row) => row.id === overrideUserId);
    return [...overrideChangedKeys].map((key) => {
      const info = catalog.find((row) => row.permission_key === key);
      const before = overrideBase[key];
      const after = overrideStates[key]!;
      const describe = (draft: OverrideDraft | undefined) =>
        !draft || draft.choice === "inherit"
          ? "Theo vai trò"
          : draft.choice === "allow"
            ? describeState(true, draft.data_scope)
            : "Từ chối riêng";
      return {
        key,
        label: info?.label ?? key,
        target: `Người dùng: ${member?.display_name ?? overrideUserId}`,
        before: describe(before),
        after: describe(after),
        sensitive: Boolean(info?.is_sensitive),
      };
    });
  }, [overrideChangedKeys, overrideBase, overrideStates, catalog, members.data, overrideUserId]);

  // ---------- tab: quyền hiệu lực ----------
  const [inspectUserId, setInspectUserId] = React.useState<string | null>(null);
  const inspectPermissions = useQuery(effectivePermissionsOfQuery(inspectUserId));

  // ---------- lưu ----------
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [pendingChanges, setPendingChanges] = React.useState<PermissionChange[]>([]);
  const [pendingDiff, setPendingDiff] = React.useState<DiffLine[]>([]);

  const saveMutation = useMutation({
    mutationFn: (input: { changes: PermissionChange[]; reason: string }) =>
      applyPermissionChanges(input.changes, input.reason),
    onSuccess: () => {
      cenToast.success("Đã lưu cấu hình phân quyền.");
      setSaveOpen(false);
      setRoleDraft({});
      setOverrideDraft({});
      setEditingRoles(false);
      setEditingOverrides(false);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const clearMutation = useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      clearUserOverrides(input.userId, input.reason),
    onSuccess: () => {
      cenToast.success("Đã xóa toàn bộ ngoại lệ của người dùng.");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  function openSave(changes: PermissionChange[], diff: DiffLine[]) {
    if (changes.length === 0) {
      cenToast.error("Chưa có thay đổi nào.");
      return;
    }
    setPendingChanges(changes);
    setPendingDiff(diff);
    setSaveOpen(true);
  }

  function restoreRoleDefaults(role: AppRoleKey) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] as PermissionKey[];
    const changes: PermissionChange[] = [];
    const diff: DiffLine[] = [];
    for (const row of catalog) {
      if (!row.is_configurable) continue;
      const enabled = defaults.includes(row.permission_key as PermissionKey);
      const scope = defaultScope(role, row);
      const current = roleStates[cellKey(role, row.permission_key)];
      if (current && current.enabled === enabled && current.data_scope === scope) continue;
      changes.push({
        scope: "role",
        role,
        permission_key: row.permission_key,
        enabled,
        data_scope: scope,
      });
      diff.push({
        key: `${role}|${row.permission_key}`,
        label: row.label,
        target: `Vai trò: ${ROLE_LABEL[role]}`,
        before: current ? describeState(current.enabled, current.data_scope) : "Không cho phép",
        after: describeState(enabled, scope),
        sensitive: row.is_sensitive,
      });
    }
    openSave(changes, diff);
  }

  if (!access.loading && !access.can("roles.view") && !access.isSystemOwner) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="Vai trò và phân quyền" />
        <Card>
          <CardContent>
            <EmptyState
              title="Không có quyền truy cập"
              description="Trang phân quyền yêu cầu quyền xem vai trò."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const loading = access.loading || catalogResult.isLoading || configResult.isLoading;
  const memberOptions = members.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Vai trò và phân quyền"
        description="Bốn vai trò cố định. Quyền và phạm vi dữ liệu cấu hình trực tiếp tại đây, áp dụng đồng thời cho giao diện, server và cơ sở dữ liệu."
        actions={
          access.isSystemOwner ? (
            <Badge variant="brand-subtle" size="sm">
              <ShieldCheck className="size-3.5" /> Chủ hệ thống
            </Badge>
          ) : null
        }
      />

      {loading ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="roles">
          <TabsList className="flex-wrap">
            <TabsTrigger value="roles">Theo vai trò</TabsTrigger>
            <TabsTrigger value="overrides">Ngoại lệ cá nhân</TabsTrigger>
            <TabsTrigger value="effective">Quyền hiệu lực</TabsTrigger>
            <TabsTrigger value="history">Lịch sử</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle>Ma trận quyền</CardTitle>
                    <CardDescription>
                      {editingRoles
                        ? `Đang chỉnh sửa · ${roleChangedKeys.size} thay đổi chưa lưu`
                        : "Chế độ xem. Bấm “Chỉnh sửa quyền” để thay đổi."}
                    </CardDescription>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {editingRoles ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setRoleDraft({});
                              setEditingRoles(false);
                            }}
                          >
                            Hủy
                          </Button>
                          <Button onClick={() => openSave(roleChanges, roleDiff)}>
                            Lưu thay đổi ({roleChangedKeys.size})
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" onClick={() => restoreRoleDefaults(activeRole)}>
                            <RotateCcw className="size-4" /> Khôi phục mặc định{" "}
                            {ROLE_LABEL[activeRole]}
                          </Button>
                          <Button onClick={() => setEditingRoles(true)}>
                            <Pencil className="size-4" /> Chỉnh sửa quyền
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {!isMobile ? (
                  <Select
                    value={activeRole}
                    onValueChange={(value) => setActiveRole(value as AppRoleKey)}
                  >
                    <SelectTrigger aria-label="Vai trò để khôi phục mặc định" className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_ORDER.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <RoleMatrixPanel
                  catalog={catalog}
                  states={roleStates}
                  editing={editingRoles}
                  changedKeys={roleChangedKeys}
                  isMobile={isMobile}
                  activeRole={activeRole}
                  onActiveRoleChange={setActiveRole}
                  onChange={(role, permission, next) =>
                    setRoleDraft((prev) => ({ ...prev, [cellKey(role, permission)]: next }))
                  }
                />
              </CardContent>
            </Card>

            <RoleAssignment />
          </TabsContent>

          <TabsContent value="overrides">
            <Card>
              <CardHeader>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle>Ngoại lệ cá nhân</CardTitle>
                    <CardDescription>
                      Ngoại lệ ghi đè quyền của vai trò. Không thể tự cấu hình cho chính mình.
                    </CardDescription>
                  </div>
                  {canManage && overrideUserId ? (
                    <div className="flex flex-wrap gap-2">
                      {editingOverrides ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setOverrideDraft({});
                              setEditingOverrides(false);
                            }}
                          >
                            Hủy
                          </Button>
                          <Button onClick={() => openSave(overrideChanges, overrideDiff)}>
                            Lưu thay đổi ({overrideChangedKeys.size})
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            disabled={clearMutation.isPending}
                            onClick={() =>
                              clearMutation.mutate({
                                userId: overrideUserId,
                                reason: "Xóa toàn bộ ngoại lệ quyền của người dùng",
                              })
                            }
                          >
                            <Trash2 className="size-4" /> Xóa toàn bộ ngoại lệ
                          </Button>
                          <Button onClick={() => setEditingOverrides(true)}>
                            <Pencil className="size-4" /> Chỉnh sửa quyền
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select
                  value={overrideUserId ?? ""}
                  onValueChange={(value) => {
                    setOverrideUserId(value);
                    setOverrideDraft({});
                    setEditingOverrides(false);
                  }}
                >
                  <SelectTrigger aria-label="Chọn người dùng" className="w-full sm:w-80">
                    <SelectValue placeholder="Chọn người dùng" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.display_name} — {member.role ? ROLE_LABEL[member.role] : "Chưa gán"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {overrideUserId ? (
                  <UserOverridePanel
                    catalog={catalog}
                    drafts={overrideStates}
                    roleStates={overrideRoleStates}
                    editing={editingOverrides}
                    changedKeys={overrideChangedKeys}
                    onChange={(key, next) =>
                      setOverrideDraft((prev) => ({ ...prev, [key]: next }))
                    }
                  />
                ) : (
                  <EmptyState
                    title="Chọn một người dùng"
                    description="Ngoại lệ cá nhân áp dụng cho từng người dùng cụ thể."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="effective">
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Xem quyền hiệu lực</CardTitle>
                  <CardDescription>
                    Kết quả cuối cùng sau khi áp dụng system invariant, ngoại lệ cá nhân và quyền vai trò.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select value={inspectUserId ?? ""} onValueChange={setInspectUserId}>
                  <SelectTrigger aria-label="Chọn người dùng để xem quyền" className="w-full sm:w-80">
                    <SelectValue placeholder="Chọn người dùng" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {inspectUserId ? (
                  <>
                    <div className="flex flex-wrap gap-2 text-sm text-text-muted">
                      {(() => {
                        const member = memberOptions.find((row) => row.id === inspectUserId);
                        return (
                          <>
                            <Badge variant="brand-subtle" size="sm">
                              {member?.role ? ROLE_LABEL[member.role] : "Chưa gán vai trò"}
                            </Badge>
                            {(owners.data ?? []).includes(inspectUserId) ? (
                              <Badge variant="success" size="sm">
                                Chủ hệ thống
                              </Badge>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                    <EffectivePermissionsPanel
                      catalog={catalog}
                      permissions={inspectPermissions.data ?? {}}
                    />
                  </>
                ) : (
                  <EmptyState
                    title="Chọn một người dùng"
                    description="Không có chức năng đăng nhập thay người dùng."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Lịch sử phân quyền</CardTitle>
                  <CardDescription>
                    Mỗi lần lưu tạo một change set kèm ảnh chụp cấu hình trước và sau.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <PermissionHistoryPanel canManage={canManage} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <PermissionSaveModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        diff={pendingDiff}
        changes={pendingChanges}
        busy={saveMutation.isPending}
        onConfirm={(reason) => saveMutation.mutate({ changes: pendingChanges, reason })}
      />
    </div>
  );
}
