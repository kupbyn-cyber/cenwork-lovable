/**
 * CEN 1.0 — M1.5 chốt quyền phía server.
 * Dùng chung ma trận permissions với UI; đọc vai trò thật qua RLS bằng phiên người gọi.
 */
import {
  hasPermission,
  PERMISSION_DENIED_MESSAGE,
  type AppRoleKey,
  type PermissionKey,
} from "@/lib/permissions";

export type RoleClient = {
  rpc: (
    fn: "has_role",
    args: { _user_id: string; _role: AppRoleKey },
  ) => PromiseLike<{ data: boolean | null }>;
};

export async function resolveCallerRole(
  supabase: RoleClient,
  userId: string,
): Promise<AppRoleKey | null> {
  const roles: AppRoleKey[] = ["admin", "cmo", "leader", "member"];
  const results = await Promise.all(
    roles.map((role) => supabase.rpc("has_role", { _user_id: userId, _role: role })),
  );
  const index = results.findIndex((result) => Boolean(result.data));
  return index === -1 ? null : (roles[index] as AppRoleKey);
}

export async function requirePermission(
  supabase: RoleClient,
  userId: string,
  permission: PermissionKey,
  message = PERMISSION_DENIED_MESSAGE,
): Promise<AppRoleKey> {
  const role = await resolveCallerRole(supabase, userId);
  if (!hasPermission(role, permission)) throw new Error(message);
  return role as AppRoleKey;
}
