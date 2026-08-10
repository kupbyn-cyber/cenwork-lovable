import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Database } from "@/integrations/supabase/types";
import { maskName, primeLockedIdentity } from "@/lib/member-identity";

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

/** Chức danh tổ chức — danh sách cố định, độc lập với vai trò hệ thống. */
export const JOB_TITLES = ["Giám đốc", "Leader", "Nhân viên"] as const;
export type JobTitle = (typeof JOB_TITLES)[number];

export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Hoạt động",
  locked: "Đã khóa",
  resigned: "Đã nghỉ",
};


export interface TeamRow {
  id: string;
  name: string;
  leader_id: string | null;
  telegram_topic_id: string | null;
  telegram_enabled: boolean;
}

export interface MemberRow {
  id: string;
  email: string;
  display_name: string;
  job_title: string | null;
  status: AccountStatus;
  primary_team_id: string | null;
  telegram_user_id: string | null;
  telegram_enabled: boolean;
  telegram_test_status: "success" | "failed" | null;
  telegram_tested_at: string | null;
  telegram_test_error: string | null;
  phone_number: string | null;
  birthday: string | null;
  avatar_path: string | null;
  role: AppRole | null;
  locked_at?: string | null;
  lock_reason?: string | null;
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
  return unwrap(await supabase
      .from("teams")
      .select("id,name,leader_id,telegram_topic_id,telegram_enabled")
      .order("name"));
}

export async function fetchFacilities(): Promise<FacilityRow[]> {
  return unwrap(
    await supabase.from("facilities").select("id,name,address,is_active").order("name"),
  );
}

export async function fetchMembers(): Promise<MemberRow[]> {
  await primeLockedIdentity();
  // ORG-VIEW-01: danh bạ nội bộ — RPC tự lọc cột nhạy cảm theo quyền của người gọi.
  const rows = unwrap(await supabase.rpc("member_directory")) as (Omit<
    MemberRow,
    "telegram_enabled"
  > & {
    telegram_enabled: boolean | null;
    collaborator_team_ids: string[] | null;
  })[];

  // MEMBER-FIX-04: bỏ khái niệm Team phối hợp, chỉ dùng Team chính.
  return rows.map(({ collaborator_team_ids: _ignored, ...profile }) => ({
    ...profile,
    email: profile.email ?? "",
    telegram_enabled: profile.telegram_enabled ?? false,
    display_name: maskName(profile.display_name, profile.id) as string,
  }));
}

export const teamsQuery = () => queryOptions({ queryKey: ["teams"], queryFn: fetchTeams });
export const membersQuery = () => queryOptions({ queryKey: ["members"], queryFn: fetchMembers });

/** Chỉ tài khoản đang hoạt động — dùng cho mọi ô chọn người phụ trách / Leader / người nhận. */
export const activeMembersQuery = () =>
  queryOptions({
    queryKey: ["members", "active"],
    queryFn: async () => (await fetchMembers()).filter((member) => member.status === "active"),
  });
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
export const PHONE_PATTERN = /^[0-9+][0-9 .()-]{7,19}$/;

/** Kiểm tra bắt buộc số điện thoại và ngày sinh, dùng chung cho form và trước khi ghi dữ liệu. */
export function validateContactFields(input: { phone_number: string | null; birthday: string | null }) {
  const errors: { phone_number?: string; birthday?: string } = {};
  const phone = (input.phone_number ?? "").trim();
  const birthday = (input.birthday ?? "").trim();

  if (!phone) errors.phone_number = "Số điện thoại là bắt buộc.";
  else if (!PHONE_PATTERN.test(phone))
    errors.phone_number = "Số điện thoại không hợp lệ (8–20 ký tự số).";

  if (!birthday) errors.birthday = "Ngày sinh là bắt buộc.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) errors.birthday = "Sinh nhật không hợp lệ.";
  else if (new Date(`${birthday}T00:00:00Z`).getTime() > Date.now())
    errors.birthday = "Ngày sinh không được lớn hơn ngày hiện tại.";

  return errors;
}

export async function updateMemberProfile(input: {
  id: string;
  display_name: string;
  job_title: string | null;
  primary_team_id: string | null;
  canChangePrimaryTeam: boolean;
  telegram_user_id?: string | null;
  phone_number: string | null;
  birthday: string | null;
}) {
  const contactErrors = validateContactFields(input);
  const firstError = contactErrors.phone_number ?? contactErrors.birthday;
  if (firstError) throw new Error(firstError);

  const payload: Database["public"]["Tables"]["profiles"]["Update"] = {
    display_name: input.display_name,
    job_title: input.job_title,
    ...(input.canChangePrimaryTeam ? { primary_team_id: input.primary_team_id } : {}),
    ...(input.telegram_user_id !== undefined ? { telegram_user_id: input.telegram_user_id } : {}),
    // Mọi tài khoản luôn bật nhận thông báo Telegram.
    telegram_enabled: true,
    phone_number: (input.phone_number ?? "").trim(),
    birthday: input.birthday,
  };

  const { error } = await supabase.from("profiles").update(payload).eq("id", input.id);

  if (error) throw new Error(error.message);
}

export async function saveTeam(input: {
  id?: string;
  name: string;
  leader_id: string | null;
  telegram_topic_id?: string | null;
  telegram_enabled?: boolean;
}) {
  if (input.id) {
    const { error } = await supabase
      .from("teams")
      .update({
        name: input.name,
        leader_id: input.leader_id,
        ...(input.telegram_topic_id !== undefined
          ? { telegram_topic_id: input.telegram_topic_id }
          : {}),
        ...(input.telegram_enabled !== undefined
          ? { telegram_enabled: input.telegram_enabled }
          : {}),
      })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("teams")
    .insert({
      name: input.name,
      leader_id: input.leader_id,
      ...(input.telegram_topic_id !== undefined
        ? { telegram_topic_id: input.telegram_topic_id }
        : {}),
      ...(input.telegram_enabled !== undefined ? { telegram_enabled: input.telegram_enabled } : {}),
    });
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
