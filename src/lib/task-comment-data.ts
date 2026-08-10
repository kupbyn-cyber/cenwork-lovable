import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import { maskName, primeLockedIdentity } from "@/lib/member-identity";

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

export async function postTaskComment(taskId: string, authorId: string, body: string) {
  const { error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: authorId, body: body.trim() });
  if (error) throw new Error(error.message);
}

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
