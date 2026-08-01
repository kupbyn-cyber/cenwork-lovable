import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { resolveCallerRole } from "@/lib/permission-guard";
import type { AppRoleKey } from "@/lib/permissions";

/**
 * CEN 1.0 — M6.1/M6.3 logic phát hành thông báo nội bộ (chạy phía server).
 * "Tất cả" là tiêu chí người nhận: luôn tính lại tại thời điểm phát hành thật,
 * theo vai trò và quan hệ Team hợp lệ ở đúng thời điểm đó. RLS vẫn kiểm tra lại.
 */
type Client = SupabaseClient<Database>;

export interface PublishResult {
  announcementId: string;
  recipientCount: number;
  exemptCount: number;
}

export interface AudienceCriteria {
  userIds: string[];
  teamIds: string[];
  allUsers: boolean;
  allTeams: boolean;
  includeSelf: boolean;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Team mà người dùng được phép gửi (Leader: Team phụ trách + Team chính + Team cộng tác). */
async function scopeTeamIds(supabase: Client, userId: string): Promise<string[]> {
  const [profile, leaderTeams, collaborations] = await Promise.all([
    supabase.from("profiles").select("primary_team_id").eq("id", userId).maybeSingle(),
    supabase.from("teams").select("id").eq("leader_id", userId),
    supabase.from("team_collaborators").select("team_id").eq("user_id", userId),
  ]);
  fail(profile.error);
  fail(leaderTeams.error);
  fail(collaborations.error);
  const ids = new Set<string>();
  if (profile.data?.primary_team_id) ids.add(profile.data.primary_team_id);
  for (const row of leaderTeams.data ?? []) ids.add(row.id);
  for (const row of collaborations.data ?? []) ids.add(row.team_id);
  return [...ids];
}

async function usersOfTeams(supabase: Client, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const [primary, collaborators] = await Promise.all([
    supabase.from("profiles").select("id").in("primary_team_id", teamIds),
    supabase.from("team_collaborators").select("user_id").in("team_id", teamIds),
  ]);
  fail(primary.error);
  fail(collaborators.error);
  return [
    ...(primary.data ?? []).map((row) => row.id),
    ...(collaborators.data ?? []).map((row) => row.user_id),
  ];
}

/**
 * Tính danh sách người nhận (đã khử trùng lặp theo User ID) từ tiêu chí.
 * Quyền được kiểm tra lại tại đây, không dựa vào UI.
 */
export async function resolveAudienceUserIds(
  supabase: Client,
  userId: string,
  criteria: AudienceCriteria,
  role?: AppRoleKey | null,
): Promise<string[]> {
  const callerRole = role ?? (await resolveCallerRole(supabase, userId));
  const wantsBulk = criteria.allUsers || criteria.allTeams;
  if (wantsBulk && callerRole !== "admin" && callerRole !== "cmo" && callerRole !== "leader") {
    throw new Error("Bạn không có quyền chọn tất cả người nhận.");
  }

  const result = new Set<string>(criteria.userIds);
  const manualTeams = [...criteria.teamIds];

  if (callerRole === "admin" || callerRole === "cmo") {
    if (criteria.allUsers) {
      const { data, error } = await supabase.from("profiles").select("id");
      fail(error);
      for (const row of data ?? []) result.add(row.id);
    }
    if (criteria.allTeams) {
      const { data, error } = await supabase.from("teams").select("id");
      fail(error);
      manualTeams.push(...(data ?? []).map((row) => row.id));
    }
  } else if (wantsBulk) {
    // Leader: chỉ trong phạm vi được phép gửi, không bao giờ toàn hệ thống.
    const teams = await scopeTeamIds(supabase, userId);
    if (criteria.allTeams) manualTeams.push(...teams);
    if (criteria.allUsers) {
      for (const id of await usersOfTeams(supabase, teams)) result.add(id);
      result.add(userId);
    }
  }

  for (const id of await usersOfTeams(supabase, [...new Set(manualTeams)])) result.add(id);

  if (criteria.includeSelf) result.add(userId);
  else if (!criteria.userIds.includes(userId)) result.delete(userId);

  return [...result];
}

export async function publishAnnouncementCore(
  supabase: Client,
  announcementId: string,
  userId: string,
): Promise<PublishResult> {
  const { data: announcement, error: readError } = await supabase
    .from("announcements")
    .select(
      "id,created_by,title,body,status,due_at,deleted_at,audience_all_users,audience_all_teams,include_self",
    )
    .eq("id", announcementId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!announcement || announcement.deleted_at) throw new Error("Không tìm thấy thông báo.");
  if (announcement.created_by !== userId) {
    throw new Error("Chỉ người tạo mới được phát hành thông báo này.");
  }
  if (announcement.status !== "draft") throw new Error("Thông báo đã được phát hành.");
  if (!announcement.title.trim() || !announcement.body.trim()) {
    throw new Error("Phải nhập tiêu đề và nội dung trước khi phát hành.");
  }
  if (!announcement.due_at || new Date(announcement.due_at).getTime() <= Date.now()) {
    throw new Error("Hạn xác nhận phải ở tương lai.");
  }

  const { data: targets, error: targetError } = await supabase
    .from("announcement_targets")
    .select("target_type,target_id")
    .eq("announcement_id", announcementId);
  if (targetError) throw new Error(targetError.message);

  const candidates = await resolveAudienceUserIds(supabase, userId, {
    userIds: (targets ?? [])
      .filter((row) => row.target_type === "user")
      .map((row) => row.target_id),
    teamIds: (targets ?? [])
      .filter((row) => row.target_type === "team")
      .map((row) => row.target_id),
    allUsers: announcement.audience_all_users,
    allTeams: announcement.audience_all_teams,
    includeSelf: announcement.include_self,
  });

  if (candidates.length === 0) throw new Error("Phải có ít nhất một người nhận hợp lệ.");

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,status")
    .in("id", candidates);
  if (profileError) throw new Error(profileError.message);

  const valid = profiles ?? [];
  if (valid.length === 0) throw new Error("Phải có ít nhất một người nhận hợp lệ.");

  const rows = valid.map((profile) => ({
    announcement_id: announcementId,
    user_id: profile.id,
    due_at: announcement.due_at as string,
    ...(String(profile.status) === "resigned"
      ? { status: "exempt" as const, exempt_reason: "Tài khoản đã nghỉ" }
      : {}),
  }));

  const { error: insertError } = await supabase
    .from("announcement_recipients")
    .upsert(rows, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  if (insertError) {
    throw new Error(
      insertError.message.includes("row-level security")
        ? "Danh sách người nhận vượt quá phạm vi bạn được phép gửi."
        : insertError.message,
    );
  }

  const { error: publishError } = await supabase
    .from("announcements")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", announcementId);
  if (publishError) throw new Error(publishError.message);

  return {
    announcementId,
    recipientCount: rows.length,
    exemptCount: rows.filter((row) => "status" in row).length,
  };
}
