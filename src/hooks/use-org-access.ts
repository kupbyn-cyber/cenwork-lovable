import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { myAccessQuery, type MemberRow } from "@/lib/org-data";
import {
  hasPermission,
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
  const isLeader = role === "leader";
  const can = (permission: PermissionKey) => hasPermission(role, permission);

  return {
    userId: user?.id ?? null,
    role,
    leaderTeamId,
    isAdmin,
    isCmo,
    isLeader,
    loading: isLoading,
    can,
    /** Admin và CMO được tạo tài khoản. */
    canCreateMember: can(PERMISSIONS.MEMBERS_CREATE),
    /** Chỉ Admin được khóa/mở khóa. */
    canLockMember: can(PERMISSIONS.MEMBERS_LOCK),
    /** Chỉ Admin và CMO được đổi vai trò và Team chính. */
    canChangeRoleOrTeam: can(PERMISSIONS.ROLES_ASSIGN),
    /** Admin quản lý Team và Cơ sở. */
    canManageOrg: can(PERMISSIONS.ORG_MANAGE),
    canViewAudit: can(PERMISSIONS.AUDIT_VIEW),
    canManageSettings: can(PERMISSIONS.SETTINGS_ADMIN),
    canEditMember(member: MemberRow) {
      if (isAdmin || isCmo) return true;
      if (isLeader && leaderTeamId && member.primary_team_id === leaderTeamId) return true;
      return member.id === user?.id;
    },
  };
}
