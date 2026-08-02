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

/** NAP-01 — lọc lại theo trạng thái tài khoản tại server (không tin danh sách từ client). */
async function activeUserIds(supabase: Client, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("announcement_active_user_ids", {
    _ids: [...new Set(ids)],
  });
  fail(error);
  return (data ?? []) as string[];
}

/** Mở rộng Team thành thành viên đang hoạt động (Team chính + cộng tác). */
async function usersOfTeams(supabase: Client, teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabase.rpc("announcement_team_member_ids", {
    _teams: [...new Set(teamIds)],
  });
  fail(error);
  return (data ?? []) as string[];
}

/**
 * NAP-01 — Tính danh sách người nhận (khử trùng lặp) từ tiêu chí.
 * Người gửi đang hoạt động gửi được cho mọi người đang hoạt động, không giới hạn Team/dự án.
 * Trạng thái tài khoản luôn được kiểm tra lại tại server.
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

  if (wantsBulk) {
    if (criteria.allUsers) {
      const { data, error } = await supabase.rpc("announcement_audience_users");
      fail(error);
      for (const row of (data ?? []) as { id: string }[]) result.add(row.id);
    }
    if (criteria.allTeams) {
      const { data, error } = await supabase.rpc("announcement_audience_teams");
      fail(error);
      manualTeams.push(...((data ?? []) as { id: string }[]).map((row) => row.id));
    }
  }

  for (const id of await usersOfTeams(supabase, manualTeams)) result.add(id);

  if (criteria.includeSelf) result.add(userId);
  else if (!criteria.userIds.includes(userId)) result.delete(userId);

  // Chốt cuối: chỉ giữ tài khoản đang hoạt động (bao gồm cả người gửi).
  return activeUserIds(supabase, [...result]);
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

  // NAP-01: candidates đã được server lọc chỉ còn tài khoản đang hoạt động.
  const rows = [...new Set(candidates)].map((id) => ({
    announcement_id: announcementId,
    user_id: id,
    due_at: announcement.due_at as string,
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
    exemptCount: 0,
  };

}
