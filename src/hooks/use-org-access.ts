import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { myAccessQuery, type MemberRow } from "@/lib/org-data";
import {
  effectivePermissionsQuery,
  systemOwnersQuery,
  type DataScope,
  type PermissionMap,
} from "@/lib/permission-data";
import {
  isSystemAdminRole,
  PERMISSIONS,
  type AppRoleKey,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * ROLE-01 — quyền hiệu lực đọc động từ database (role config + user override + system invariant).
 * Không còn ma trận hardcode ở UI. Khi chưa tải xong quyền, mọi thao tác đều fail closed.
 */
export function useOrgAccess() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery(myAccessQuery(user?.id));
  const permissions = useQuery(effectivePermissionsQuery(user?.id));
  const owners = useQuery(systemOwnersQuery());

  const role = (data?.role ?? null) as AppRoleKey | null;
  const leaderTeamId = data?.leaderTeamId ?? null;
  const map: PermissionMap = permissions.data ?? {};
  const permissionsReady = permissions.isSuccess;

  const isAdmin = role === "admin";
  const isCmo = role === "cmo";
  /** Admin và CMO: quản trị toàn hệ thống, không giới hạn theo Team. */
  const isSystemAdmin = isSystemAdminRole(role);
  const isLeader = role === "leader";
  const isSystemOwner = Boolean(user?.id && (owners.data ?? []).includes(user.id));

  const can = (permission: PermissionKey | string) =>
    permissionsReady ? Boolean(map[permission]?.enabled) : false;
  const scopeOf = (permission: PermissionKey | string): DataScope | "none" =>
    can(permission) ? ((map[permission]?.data_scope ?? "own") as DataScope) : "none";

  return {
    userId: user?.id ?? null,
    role,
    leaderTeamId,
    isAdmin,
    isCmo,
    isSystemAdmin,
    isSystemOwner,
    isLeader,
    loading: isLoading || permissions.isLoading,
    permissionsReady,
    permissionMap: map,
    can,
    scopeOf,
    /** Admin và CMO được tạo tài khoản. */
    canCreateMember: can(PERMISSIONS.MEMBERS_CREATE),
    /** Admin và CMO được khóa/mở khóa. */
    canLockMember: can(PERMISSIONS.MEMBERS_LOCK),
    /** Admin và CMO được cấp mật khẩu tạm cho Leader/Member. */
    canIssueTempPassword: can(PERMISSIONS.MEMBERS_RESET_PASSWORD),
    /** Admin và CMO được đổi vai trò và Team chính. */
    canChangeRoleOrTeam: can(PERMISSIONS.ROLES_ASSIGN),
    /** Admin và CMO quản lý Team và Cơ sở. */
    canManageOrg: can(PERMISSIONS.ORG_MANAGE),
    canViewAudit: can(PERMISSIONS.AUDIT_VIEW),
    canManageSettings: can(PERMISSIONS.SETTINGS_ADMIN),
    canManagePermissions: can(PERMISSIONS.PERMISSIONS_MANAGE) || isSystemOwner,
    /** Sửa hồ sơ người khác theo quyền members.edit_scoped; ai cũng tự sửa hồ sơ của mình. */
    canEditMember(member: MemberRow) {
      if (member.id === user?.id) return true;
      if (!can(PERMISSIONS.MEMBERS_EDIT_SCOPED)) return false;
      const scope = scopeOf(PERMISSIONS.MEMBERS_EDIT_SCOPED);
      if (scope === "organization") return true;
      if (scope === "team") return Boolean(leaderTeamId && member.primary_team_id === leaderTeamId);
      return false;
    },
  };
}
