import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { myAccessQuery, type MemberRow } from "@/lib/org-data";

/**
 * CEN 1.0 — M1.4 phạm vi thao tác theo vai trò.
 * UI chỉ ẩn/hiện thao tác; ràng buộc thật nằm ở RLS và server function.
 */
export function useOrgAccess() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery(myAccessQuery(user?.id));

  const role = data?.role ?? null;
  const leaderTeamId = data?.leaderTeamId ?? null;
  const isAdmin = role === "admin";
  const isCmo = role === "cmo";
  const isLeader = role === "leader";

  return {
    userId: user?.id ?? null,
    role,
    leaderTeamId,
    isAdmin,
    isCmo,
    isLeader,
    loading: isLoading,
    /** Admin và CMO được tạo tài khoản. */
    canCreateMember: isAdmin || isCmo,
    /** Chỉ Admin được khóa/mở khóa. */
    canLockMember: isAdmin,
    /** Chỉ Admin và CMO được đổi vai trò và Team chính. */
    canChangeRoleOrTeam: isAdmin || isCmo,
    /** Admin quản lý Team và Cơ sở. */
    canManageOrg: isAdmin,
    canEditMember(member: MemberRow) {
      if (isAdmin || isCmo) return true;
      if (isLeader && leaderTeamId && member.primary_team_id === leaderTeamId) return true;
      return member.id === user?.id;
    },
  };
}
