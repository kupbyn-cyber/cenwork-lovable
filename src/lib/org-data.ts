import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M1.4 data layer
 * Đọc/ghi qua client trình duyệt; RLS quyết định phạm vi dữ liệu theo vai trò.
 */
export type AppRole = Database["public"]["Enums"]["app_role"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  cmo: "CMO",
  leader: "Leader",
  member: "Member",
};

export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Hoạt động",
  locked: "Đã khóa",
  resigned: "Đã nghỉ",
};


export interface TeamRow {
  id: string;
  name: string;
  leader_id: string | null;
}

export interface MemberRow {
  id: string;
  email: string;
  display_name: string;
  job_title: string | null;
  status: AccountStatus;
  primary_team_id: string | null;
  role: AppRole | null;
  collaboratorTeamIds: string[];
}

export interface FacilityRow {
  id: string;
  name: string;
  address: string;
  is_active: boolean;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

export async function fetchTeams(): Promise<TeamRow[]> {
  return unwrap(await supabase.from("teams").select("id,name,leader_id").order("name"));
}

export async function fetchFacilities(): Promise<FacilityRow[]> {
  return unwrap(
    await supabase.from("facilities").select("id,name,address,is_active").order("name"),
  );
}

export async function fetchMembers(): Promise<MemberRow[]> {
  const profiles = unwrap(
    await supabase
      .from("profiles")
      .select("id,email,display_name,job_title,status,primary_team_id")
      .order("display_name"),
  ) as Omit<MemberRow, "role" | "collaboratorTeamIds">[];

  const roles = unwrap(await supabase.from("user_roles").select("user_id,role")) as {
    user_id: string;
    role: AppRole;
  }[];
  const collaborators = unwrap(
    await supabase.from("team_collaborators").select("team_id,user_id"),
  ) as { team_id: string; user_id: string }[];

  const roleByUser = new Map(roles.map((r) => [r.user_id, r.role]));
  const teamsByUser = new Map<string, string[]>();
  for (const row of collaborators) {
    teamsByUser.set(row.user_id, [...(teamsByUser.get(row.user_id) ?? []), row.team_id]);
  }

  return profiles.map((profile) => ({
    ...profile,
    role: roleByUser.get(profile.id) ?? null,
    collaboratorTeamIds: teamsByUser.get(profile.id) ?? [],
  }));
}

export const teamsQuery = () => queryOptions({ queryKey: ["teams"], queryFn: fetchTeams });
export const membersQuery = () => queryOptions({ queryKey: ["members"], queryFn: fetchMembers });
export const facilitiesQuery = () =>
  queryOptions({ queryKey: ["facilities"], queryFn: fetchFacilities });

/** Vai trò + Team đang làm Leader của người dùng hiện tại. */
export async function fetchMyAccess(userId: string) {
  const [roleResult, leaderResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    supabase.from("teams").select("id").eq("leader_id", userId).maybeSingle(),
  ]);
  return {
    role: (roleResult.data?.role ?? null) as AppRole | null,
    leaderTeamId: leaderResult.data?.id ?? null,
  };
}

export const myAccessQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-access", userId],
    queryFn: () => fetchMyAccess(userId!),
    enabled: Boolean(userId),
  });

/** Cập nhật hồ sơ (không gồm vai trò và trạng thái — hai thao tác đó chạy ở backend). */
export async function updateMemberProfile(input: {
  id: string;
  display_name: string;
  job_title: string | null;
  primary_team_id: string | null;
  canChangePrimaryTeam: boolean;
}) {
  const payload: Database["public"]["Tables"]["profiles"]["Update"] = {
    display_name: input.display_name,
    job_title: input.job_title,
    ...(input.canChangePrimaryTeam ? { primary_team_id: input.primary_team_id } : {}),
  };

  const { error } = await supabase.from("profiles").update(payload).eq("id", input.id);

  if (error) throw new Error(error.message);
}

export async function replaceCollaboratorTeams(userId: string, teamIds: string[]) {
  const { error: deleteError } = await supabase
    .from("team_collaborators")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);
  if (teamIds.length === 0) return;
  const { error } = await supabase
    .from("team_collaborators")
    .insert(teamIds.map((team_id) => ({ team_id, user_id: userId })));
  if (error) throw new Error(error.message);
}

export async function saveTeam(input: { id?: string; name: string; leader_id: string | null }) {
  if (input.id) {
    const { error } = await supabase
      .from("teams")
      .update({ name: input.name, leader_id: input.leader_id })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("teams")
    .insert({ name: input.name, leader_id: input.leader_id });
  if (error) throw new Error(error.message);
}

export async function saveFacility(input: {
  id?: string;
  name: string;
  address: string;
  is_active: boolean;
}) {
  if (input.id) {
    const { error } = await supabase
      .from("facilities")
      .update({ name: input.name, address: input.address, is_active: input.is_active })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("facilities")
    .insert({ name: input.name, address: input.address, is_active: input.is_active });
  if (error) throw new Error(error.message);
}
