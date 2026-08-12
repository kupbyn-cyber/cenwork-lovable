import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Database } from "@/integrations/supabase/types";
import type { AppRoleKey, PermissionKey } from "@/lib/permissions";

/**
 * ROLE-01 — nguồn dữ liệu phân quyền động.
 * UI chỉ đọc kết quả tính quyền của database; mọi ràng buộc thật nằm ở RLS + server function.
 */
export type DataScope =
  | "own"
  | "assigned_or_participating"
  | "team"
  | "related_projects"
  | "organization";

export const SCOPE_LABEL: Record<DataScope, string> = {
  own: "Của tôi",
  assigned_or_participating: "Được giao / tham gia",
  team: "Trong Team",
  related_projects: "Dự án liên quan",
  organization: "Toàn hệ thống",
};

export const PERMISSION_SOURCE_LABEL: Record<string, string> = {
  system_owner: "Chủ hệ thống",
  user_override: "Ngoại lệ cá nhân",
  role: "Vai trò",
  default_deny: "Mặc định từ chối",
};

export interface EffectivePermission {
  permission_key: string;
  enabled: boolean;
  data_scope: string;
  source: string;
  locked: boolean;
}

export interface CatalogRow {
  permission_key: string;
  module: string;
  label: string;
  description: string | null;
  allowed_scopes: string[];
  is_configurable: boolean;
  is_sensitive: boolean;
  sort_order: number;
}

export interface RoleConfigRow {
  role: AppRoleKey;
  permission_key: string;
  enabled: boolean;
  data_scope: string;
  updated_at: string;
}

export interface OverrideRow {
  user_id: string;
  permission_key: string;
  override_type: "allow" | "deny";
  data_scope: string | null;
  reason: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeSetRow {
  id: string;
  reason: string;
  kind: string;
  changes_json: unknown;
  reverted_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type PermissionMap = Record<string, EffectivePermission>;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

export async function fetchEffectivePermissions(userId: string): Promise<PermissionMap> {
  const rows = unwrap(await supabase.rpc("perm_effective_for", { _user: userId }));
  const map: PermissionMap = {};
  for (const row of rows as EffectivePermission[]) map[row.permission_key] = row;
  return map;
}

export const effectivePermissionsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["effective-permissions", userId],
    queryFn: () => fetchEffectivePermissions(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

export const permissionCatalogQuery = () =>
  queryOptions({
    queryKey: ["permission-catalog"],
    queryFn: async (): Promise<CatalogRow[]> =>
      unwrap(
        await supabase
          .from("permission_catalog")
          .select(
            "permission_key,module,label,description,allowed_scopes,is_configurable,is_sensitive,sort_order",
          )
          .order("sort_order"),
      ),
  });

export const roleConfigQuery = () =>
  queryOptions({
    queryKey: ["role-permission-config"],
    queryFn: async (): Promise<RoleConfigRow[]> =>
      unwrap(
        await supabase
          .from("role_permission_config")
          .select("role,permission_key,enabled,data_scope,updated_at"),
      ),
  });

export const userOverridesQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["user-permission-overrides", userId],
    queryFn: async (): Promise<OverrideRow[]> =>
      unwrap(
        await supabase
          .from("user_permission_overrides")
          .select("user_id,permission_key,override_type,data_scope,reason,created_at,updated_at")
          .eq("user_id", userId!),
      ) as OverrideRow[],
    enabled: Boolean(userId),
  });

export const permissionChangeSetsQuery = () =>
  queryOptions({
    queryKey: ["permission-change-sets"],
    queryFn: async (): Promise<ChangeSetRow[]> =>
      unwrap(
        await supabase
          .from("permission_change_sets")
          .select("id,reason,kind,changes_json,reverted_at,created_by,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ),
  });

export const systemOwnersQuery = () =>
  queryOptions({
    queryKey: ["system-owners"],
    // PERF-03: danh sách chủ hệ thống hầu như không đổi; cache ngắn để không gọi lại mỗi trang.
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const rows = unwrap(await supabase.from("system_owners").select("user_id"));
      return (rows as { user_id: string }[]).map((row) => row.user_id);
    },
  });

export const effectivePermissionsOfQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["effective-permissions-of", userId],
    queryFn: () => fetchEffectivePermissions(userId!),
    enabled: Boolean(userId),
  });

export type PermissionChange =
  | {
      scope: "role";
      role: AppRoleKey;
      permission_key: PermissionKey | string;
      enabled: boolean;
      data_scope: string;
    }
  | {
      scope: "user";
      user_id: string;
      permission_key: PermissionKey | string;
      override_type: "allow" | "deny" | null;
      data_scope: string | null;
      reason?: string;
    };

export async function applyPermissionChanges(
  changes: PermissionChange[],
  reason: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("perm_apply_changes", {
    _changes: changes as unknown as Database["public"]["Functions"]["perm_apply_changes"]["Args"]["_changes"],
    _reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function revertChangeSet(id: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc("perm_revert_change_set", { _id: id, _reason: reason });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function clearUserOverrides(userId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc("perm_clear_user_overrides", {
    _user: userId,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
