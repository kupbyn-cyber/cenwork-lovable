import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { myAccessQuery, type MemberRow } from "@/lib/org-data";
import {
  hasPermission,
  isSystemAdminRole,
  PERMISSIONS,
  type AppRoleKey,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * CEN 1.0 — M1.4/M1.5 phạm vi thao tác theo vai trò.
 * UI chỉ ẩn/disable thao tác; ràng buộc thật nằm ở RLS và server function.
 * Ma trận quyền lấy từ src/lib/permissions.ts (dùng chung UI + backend).
 */
export function useOrgAccess() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery(myAccessQuery(user?.id));

  const role = (data?.role ?? null) as AppRoleKey | null;
  const leaderTeamId = data?.leaderTeamId ?? null;
  const isAdmin = role === "admin";
  const isCmo = role === "cmo";
  /** Admin và CMO: quản trị toàn hệ thống, không giới hạn theo Team. */
  const isSystemAdmin = isSystemAdminRole(role);
  const isLeader = role === "leader";
  const can = (permission: PermissionKey) => hasPermission(role, permission);

  return {
    userId: user?.id ?? null,
    role,
    leaderTeamId,
    isAdmin,
    isCmo,
    isSystemAdmin,
    isLeader,
    loading: isLoading,
    can,
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
    /** Chỉ Admin/CMO sửa hồ sơ người khác; ai cũng tự sửa hồ sơ của mình. */
    canEditMember(member: MemberRow) {
      if (isSystemAdmin) return true;
      return member.id === user?.id;
    },
  };
}
