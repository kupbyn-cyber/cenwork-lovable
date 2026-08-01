import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import {
  ANNOUNCEMENT_SYNC_KEYS,
  inboxQuery,
  pendingAckRows,
  type InboxRow,
} from "@/lib/announcement-data";
import { acknowledgeWithAnswers, type AnswerDraft } from "@/lib/announcement-interaction";

/**
 * CEN 1.0 — nguồn dữ liệu duy nhất cho thông báo bắt buộc chưa xác nhận.
 * Dùng chung cache `announcement-inbox` cho: trang Thông báo nội bộ, Trang chủ và thanh nhắc.
 * Không tạo bản ghi hay trạng thái xác nhận riêng cho từng giao diện.
 */
export function usePendingAnnouncements() {
  const { user } = useAuth();
  const inbox = useQuery(inboxQuery(user?.id));
  const pending = React.useMemo(() => pendingAckRows(inbox.data, user?.id), [inbox.data, user?.id]);
  return {
    userId: user?.id,
    pending,
    isLoading: inbox.isLoading,
    isError: inbox.isError,
    refetch: inbox.refetch,
  };
}

/** Xác nhận đã đọc — tái sử dụng đúng server action (RPC announcement_acknowledge). */
export function useAcknowledgeAnnouncement(onDone?: (row: InboxRow) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { row: InboxRow; answers?: AnswerDraft[] }) =>
      acknowledgeWithAnswers(input.row.announcement_id, input.answers ?? []),
    onSuccess: (_data, input) => {
      for (const key of ANNOUNCEMENT_SYNC_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onDone?.(input.row);
    },
  });
}
