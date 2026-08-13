import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import { maskName, primeLockedIdentity } from "@/lib/member-identity";

/** RPC mới (task_comment_post / task_mention_candidates) chưa có trong types sinh tự động. */
const rpc = supabase.rpc as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * CEN 1.0 — TASK-LIST-UI-02 (E). Bình luận Công việc + trạng thái đã đọc theo người dùng.
 * Phạm vi đọc/ghi do RLS quyết định (can_view_task); UI chỉ hiển thị.
 */
export interface TaskCommentRow {
  id: string;
  task_id: string;
  author_id: string;
  authorName: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function fetchTaskComments(taskId: string): Promise<TaskCommentRow[]> {
  await primeLockedIdentity();
  const { data, error } = await supabase
    .from("task_comments")
    .select("id,task_id,author_id,body,created_at,updated_at,profiles:author_id(display_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const profile = row.profiles as { display_name: string | null } | null;
    return {
      id: row.id,
      task_id: row.task_id,
      author_id: row.author_id,
      authorName: maskName(profile?.display_name ?? null, row.author_id) ?? "—",
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export const taskCommentsQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["task-comments", taskId],
    queryFn: () => fetchTaskComments(taskId),
  });

/**
 * TASK-QUICKVIEW-01 — đăng bình luận qua RPC để database tự xác thực quyền,
 * lưu mention theo user_id thật và tạo thông báo CEN cho người được nhắc tên.
 */
export async function postTaskComment(taskId: string, body: string, mentions: string[] = []) {
  const { error } = await rpc("task_comment_post", {
    _task: taskId,
    _body: body.trim(),
    _mentions: Array.from(new Set(mentions)),
  });
  if (error) throw new Error(error.message);
}

export interface MentionCandidate {
  id: string;
  display_name: string;
}

/** Danh sách người có thể nhắc tên — backend chỉ trả người vốn đã xem được Task. */
export async function fetchTaskMentionCandidates(taskId: string): Promise<MentionCandidate[]> {
  await primeLockedIdentity();
  const { data, error } = await rpc("task_mention_candidates", { _task: taskId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; display_name: string | null }[])
    .map((row) => ({
      id: row.id,
      display_name: maskName(row.display_name ?? "", row.id) || "—",
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "vi"));
}

export const taskMentionCandidatesQuery = (taskId: string, enabled: boolean) =>
  queryOptions({
    queryKey: ["task-mention-candidates", taskId],
    queryFn: () => fetchTaskMentionCandidates(taskId),
    enabled,
    staleTime: 5 * 60_000,
  });

export async function deleteTaskComment(id: string) {
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Số bình luận chưa đọc theo từng Task, tính riêng cho người đang đăng nhập. */
export async function fetchTaskUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("task_unread_comment_counts");
  if (error) throw new Error(error.message);
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.task_id] = row.unread;
  return map;
}

export const taskUnreadCountsQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["task-unread-comments", userId],
    queryFn: fetchTaskUnreadCounts,
    enabled: Boolean(userId),
  });

/** Chỉ gọi sau khi danh sách bình luận đã tải xong. */
export async function markTaskCommentsRead(taskId: string) {
  const { error } = await supabase.rpc("task_comments_mark_read", { _task: taskId });
  if (error) throw new Error(error.message);
}

export function formatUnreadBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}
