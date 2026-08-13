import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { useAuth } from "@/hooks/use-auth";
import { formatHanoiDateTime } from "@/lib/datetime";
import { TaskCommentComposer } from "@/components/task/task-comment-composer";
import {
  deleteTaskComment,
  markTaskCommentsRead,
  taskCommentsQuery,
} from "@/lib/task-comment-data";

/**
 * CEN 1.0 — TASK-LIST-UI-02 (E). Khu vực Bình luận trong chi tiết Công việc.
 * Đánh dấu đã đọc chỉ sau khi tải bình luận thành công.
 */
export function TaskCommentThread({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const comments = useQuery(taskCommentsQuery(taskId));

  const isSuccess = comments.isSuccess;
  React.useEffect(() => {
    if (!isSuccess || !user?.id) return;
    void markTaskCommentsRead(taskId)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["task-unread-comments", user.id] }),
      )
      .catch(() => undefined);
  }, [isSuccess, taskId, user?.id, queryClient, comments.dataUpdatedAt]);

  const remove = useMutation({
    mutationFn: (id: string) => deleteTaskComment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
      toast.success("Đã xóa bình luận.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = comments.data ?? [];

  return (
    <Card id="task-comments" className="lg:col-span-2 scroll-mt-24">
      <CardHeader>
        <CardTitle>Bình luận</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.isLoading ? (
          <p className="text-caption text-text-muted">Đang tải bình luận…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Chưa có bình luận" description="Hãy trao đổi về công việc này." />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-text-primary">
                      {row.authorName}
                    </p>
                    <p className="text-caption text-text-muted">
                      {formatHanoiDateTime(row.created_at)}
                    </p>
                  </div>
                  {row.author_id === user?.id ? (
                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      label="Xóa bình luận"
                      loading={remove.isPending}
                      onClick={() => remove.mutate(row.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  ) : null}
                </div>
                <div className="mt-2 text-body text-text-secondary whitespace-pre-wrap">
                  <LinkifiedText text={row.body} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <TaskCommentComposer taskId={taskId} />
      </CardContent>
    </Card>
  );
}
