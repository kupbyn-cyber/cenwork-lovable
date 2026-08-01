import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * CEN 1.0 — M6.1 Thông báo nội bộ (data layer).
 * Nội dung do người dùng chủ động soạn — khác Notification Center tự động của M5.
 * Mọi phạm vi đọc/ghi do RLS quyết định; UI chỉ ẩn thao tác không hợp lệ.
 */
export type AnnouncementStatus = Database["public"]["Enums"]["announcement_status"];
export type RecipientStatus = Database["public"]["Enums"]["announcement_recipient_status"];
/** Trạng thái hiển thị: "quá hạn" được tính động từ hạn xác nhận. */
export type EffectiveRecipientStatus = RecipientStatus | "overdue";

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  draft: "Nháp",
  published: "Đã phát hành",
};

export const RECIPIENT_STATUS_LABEL: Record<EffectiveRecipientStatus, string> = {
  unread: "Chưa đọc",
  reading: "Đang đọc",
  completed: "Đã hoàn thành",
  overdue: "Quá hạn",
  exempt: "Miễn hoàn thành",
};

export const RECIPIENT_STATUS_TONE: Record<
  EffectiveRecipientStatus,
  "neutral" | "progress" | "success" | "warning" | "error"
> = {
  unread: "neutral",
  reading: "progress",
  completed: "success",
  overdue: "error",
  exempt: "warning",
};

export type ResultVisibility = "none" | "after_submit" | "after_due";

export const RESULT_VISIBILITY_LABEL: Record<ResultVisibility, string> = {
  none: "Không công khai cho người nhận",
  after_submit: "Công khai sau khi người nhận gửi câu trả lời",
  after_due: "Công khai sau khi hết hạn",
};

export interface AnnouncementRow {
  id: string;
  created_by: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  due_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  comments_enabled: boolean;
  result_visibility: ResultVisibility;
  current_version: number;
  revoked_at: string | null;
  revoke_reason: string | null;
  archived_at: string | null;
  last_minor_edit_at: string | null;
}


export interface RecipientRow {
  id: string;
  announcement_id: string;
  user_id: string;
  status: RecipientStatus;
  version: number;
  due_at: string;
  first_opened_at: string | null;
  read_completed_at: string | null;
  acknowledged_at: string | null;
  is_late: boolean;
  exempt_reason: string | null;
}

export interface InboxRow extends RecipientRow {
  announcement: AnnouncementRow;
}

export interface TargetRow {
  id: string;
  target_type: "user" | "team";
  target_id: string;
}

const ANNOUNCEMENT_COLUMNS =
  "id,created_by,title,body,status,due_at,published_at,created_at,updated_at," +
  "comments_enabled,result_visibility,current_version,revoked_at,revoke_reason,archived_at,last_minor_edit_at";
const RECIPIENT_COLUMNS =
  "id,announcement_id,user_id,status,version,due_at,first_opened_at,read_completed_at,acknowledged_at,is_late,exempt_reason";

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function effectiveRecipientStatus(row: {
  status: RecipientStatus;
  due_at: string;
}): EffectiveRecipientStatus {
  if (row.status === "completed" || row.status === "exempt") return row.status;
  return new Date(row.due_at).getTime() < Date.now() ? "overdue" : row.status;
}

/** Thông báo tôi nhận. */
export async function fetchInbox(): Promise<InboxRow[]> {
  const { data, error } = await supabase
    .from("announcement_recipients")
    .select(`${RECIPIENT_COLUMNS},announcements!inner(${ANNOUNCEMENT_COLUMNS})`)
    .order("due_at", { ascending: true });
  fail(error);
  return ((data ?? []) as unknown as (RecipientRow & { announcements: AnnouncementRow })[])
    .filter((row) => row.announcements?.status === "published")
    .map(({ announcements, ...rest }) => ({ ...rest, announcement: announcements }));
}

/** Thông báo tôi đã tạo (gồm Nháp). */
export async function fetchMyAnnouncements(userId: string): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as unknown as AnnouncementRow[];
}

export async function fetchAnnouncement(id: string): Promise<AnnouncementRow | null> {
  const { data, error } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  fail(error);
  return (data ?? null) as unknown as AnnouncementRow | null;
}

export async function fetchTargets(id: string): Promise<TargetRow[]> {
  const { data, error } = await supabase
    .from("announcement_targets")
    .select("id,target_type,target_id")
    .eq("announcement_id", id);
  fail(error);
  return (data ?? []) as TargetRow[];
}

export async function fetchRecipients(id: string): Promise<RecipientRow[]> {
  const { data, error } = await supabase
    .from("announcement_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("announcement_id", id);
  fail(error);
  return (data ?? []) as RecipientRow[];
}

/** Nghĩa vụ quá hạn của chính mình — nguồn duy nhất để khóa thao tác ở UI. */
export async function fetchMyOverdue(userId: string): Promise<InboxRow[]> {
  const rows = await fetchInbox();
  return rows.filter(
    (row) => row.user_id === userId && effectiveRecipientStatus(row) === "overdue",
  );
}

export const inboxQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["announcement-inbox", userId],
    queryFn: fetchInbox,
    enabled: Boolean(userId),
  });

export const myAnnouncementsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["announcements-created", userId],
    queryFn: () => fetchMyAnnouncements(userId!),
    enabled: Boolean(userId),
  });

export const announcementQuery = (id: string) =>
  queryOptions({ queryKey: ["announcement", id], queryFn: () => fetchAnnouncement(id) });

export const announcementTargetsQuery = (id: string) =>
  queryOptions({ queryKey: ["announcement-targets", id], queryFn: () => fetchTargets(id) });

export const announcementRecipientsQuery = (id: string) =>
  queryOptions({ queryKey: ["announcement-recipients", id], queryFn: () => fetchRecipients(id) });

export const myOverdueQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["announcement-overdue", userId],
    queryFn: () => fetchMyOverdue(userId!),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });

export interface DraftInput {
  id?: string;
  title: string;
  body: string;
  dueAt: string | null;
  userIds: string[];
  teamIds: string[];
  commentsEnabled: boolean;
  resultVisibility: ResultVisibility;
}

/** Lưu Nháp: Nháp có thể chưa hoàn chỉnh nên không ràng buộc nội dung. */
export async function saveDraft(input: DraftInput, createdBy: string): Promise<string> {
  let id = input.id;
  if (id) {
    const { error } = await supabase
      .from("announcements")
      .update({
        title: input.title,
        body: input.body,
        due_at: input.dueAt,
        comments_enabled: input.commentsEnabled,
        result_visibility: input.resultVisibility,
      })
      .eq("id", id);
    fail(error);
  } else {
    const { data, error } = await supabase
      .from("announcements")
      .insert({
        created_by: createdBy,
        title: input.title,
        body: input.body,
        due_at: input.dueAt,
        comments_enabled: input.commentsEnabled,
        result_visibility: input.resultVisibility,
      })
      .select("id")
      .single();
    fail(error);
    id = (data as { id: string }).id;
  }

  const { error: deleteError } = await supabase
    .from("announcement_targets")
    .delete()
    .eq("announcement_id", id!);
  fail(deleteError);

  const rows = [
    ...input.userIds.map((target_id) => ({
      announcement_id: id!,
      target_type: "user" as const,
      target_id,
    })),
    ...input.teamIds.map((target_id) => ({
      announcement_id: id!,
      target_type: "team" as const,
      target_id,
    })),
  ];
  if (rows.length > 0) {
    const { error } = await supabase.from("announcement_targets").insert(rows);
    fail(error);
  }
  return id!;
}

export async function softDeleteDraft(id: string) {
  const { error } = await supabase
    .from("announcements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  fail(error);
}

/** Ghi nhận mở lần đầu (không ghi Audit Log cho mỗi lần mở lại). */
export async function markOpened(row: RecipientRow) {
  if (row.first_opened_at || row.status === "completed" || row.status === "exempt") return;
  const { error } = await supabase
    .from("announcement_recipients")
    .update({ first_opened_at: new Date().toISOString(), status: "reading" })
    .eq("id", row.id);
  fail(error);
}

export async function markReadCompleted(row: RecipientRow) {
  if (row.read_completed_at || row.status === "completed" || row.status === "exempt") return;
  const { error } = await supabase
    .from("announcement_recipients")
    .update({ read_completed_at: new Date().toISOString(), status: "reading" })
    .eq("id", row.id);
  fail(error);
}

/** Xác nhận đã đọc — chỉ ghi một lần, trigger database chốt thời điểm và trễ hạn. */
export async function acknowledge(row: RecipientRow) {
  const { error } = await supabase
    .from("announcement_recipients")
    .update({
      status: "completed",
      read_completed_at: row.read_completed_at ?? new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("status", ["unread", "reading"]);
  fail(error);
}
