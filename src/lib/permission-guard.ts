/**
 * CEN 1.0 — M1.5 / ROLE-01 chốt quyền phía server.
 * Quyền hiệu lực do database quyết định (role config + user override + system invariant),
 * đọc bằng phiên của người gọi qua hàm has_perm / perm_scope.
 * Không còn ma trận hardcode song song ở server.
 */
import {
  PERMISSION_DENIED_MESSAGE,
  type AppRoleKey,
  type PermissionKey,
} from "@/lib/permissions";

export type RoleClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }>;
};

export async function resolveCallerRole(
  supabase: RoleClient,
  userId: string,
): Promise<AppRoleKey | null> {
  const result = await supabase.rpc("perm_role_of", { _user: userId });
  return (result.data as AppRoleKey | null) ?? null;
}

/** Quyền hiệu lực của một người dùng cho một permission cụ thể. */
export async function hasEffectivePermission(
  supabase: RoleClient,
  userId: string,
  permission: PermissionKey | string,
): Promise<boolean> {
  const result = await supabase.rpc("has_perm", { _user: userId, _key: permission });
  return result.data === true;
}

/** Phạm vi dữ liệu hiệu lực; trả "none" khi không có quyền. */
export async function effectiveScope(
  supabase: RoleClient,
  userId: string,
  permission: PermissionKey | string,
): Promise<string> {
  const result = await supabase.rpc("perm_scope", { _user: userId, _key: permission });
  return (result.data as string | null) ?? "none";
}

/** Fail closed: mọi lỗi khi tải quyền đều coi như không có quyền. */
export async function requirePermission(
  supabase: RoleClient,
  userId: string,
  permission: PermissionKey,
  message = PERMISSION_DENIED_MESSAGE,
): Promise<AppRoleKey> {
  let allowed = false;
  try {
    allowed = await hasEffectivePermission(supabase, userId, permission);
  } catch {
    allowed = false;
  }
  if (!allowed) throw new Error(message);
  return (await resolveCallerRole(supabase, userId)) as AppRoleKey;
}
