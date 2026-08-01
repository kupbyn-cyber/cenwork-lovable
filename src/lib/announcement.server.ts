import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M6.1 logic phát hành thông báo nội bộ (chạy phía server).
 * Chốt danh sách người nhận tại thời điểm phát hành; RLS vẫn kiểm tra lại phạm vi gửi.
 */
type Client = SupabaseClient<Database>;

export interface PublishResult {
  announcementId: string;
  recipientCount: number;
  exemptCount: number;
}

export async function publishAnnouncementCore(
  supabase: Client,
  announcementId: string,
  userId: string,
): Promise<PublishResult> {
  const { data: announcement, error: readError } = await supabase
    .from("announcements")
    .select("id,created_by,title,body,status,due_at,deleted_at")
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

  const teamIds = (targets ?? [])
    .filter((row) => row.target_type === "team")
    .map((row) => row.target_id);
  const directUserIds = (targets ?? [])
    .filter((row) => row.target_type === "user")
    .map((row) => row.target_id);

  const expanded = new Set<string>(directUserIds);
  if (teamIds.length > 0) {
    const [primary, collaborators] = await Promise.all([
      supabase.from("profiles").select("id").in("primary_team_id", teamIds),
      supabase.from("team_collaborators").select("user_id").in("team_id", teamIds),
    ]);
    if (primary.error) throw new Error(primary.error.message);
    if (collaborators.error) throw new Error(collaborators.error.message);
    for (const row of primary.data ?? []) expanded.add(row.id);
    for (const row of collaborators.data ?? []) expanded.add(row.user_id);
  }

  const candidates = [...expanded];
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
