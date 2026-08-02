import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { AttachmentPanel } from "@/components/attachment/attachment-panel";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  announcementAttachmentsQuery,
  approvalAttachmentsQuery,
  removeAnnouncementAttachment,
  removeApprovalAttachment,
  uploadAnnouncementAttachment,
  uploadApprovalAttachment,
} from "@/lib/attachment-data";

/**
 * NAP-05 — Bọc phần tệp đính kèm cho từng module để route chỉ cần gắn một thẻ.
 * Quyền xem tệp bám theo quyền xem nội dung gốc (RLS + Storage Policy).
 */
function useAttachmentActions(
  queryKey: string,
  ownerId: string,
  upload: (id: string, file: File) => Promise<void>,
  remove: (attachmentId: string) => Promise<void>,
) {
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: [queryKey, ownerId] });
  }

  const add = useMutation({
    mutationFn: (file: File) => upload(ownerId, file),
    onSuccess: () => {
      refresh();
      toast.success("Đã đính kèm tệp");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const drop = useMutation({
    mutationFn: (attachmentId: string) => remove(attachmentId),
    onMutate: (attachmentId: string) => setRemovingId(attachmentId),
    onSettled: () => setRemovingId(null),
    onSuccess: () => {
      refresh();
      toast.success("Đã gỡ tệp");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { add, drop, removingId };
}

export function ApprovalAttachments({
  requestId,
  currentVersion,
  canManage,
}: {
  requestId: string;
  currentVersion: number;
  canManage: boolean;
}) {
  const list = useQuery(approvalAttachmentsQuery(requestId));
  const { add, drop, removingId } = useAttachmentActions(
    "approval-attachments",
    requestId,
    uploadApprovalAttachment,
    removeApprovalAttachment,
  );

  if (list.isLoading) return <SkeletonCard lines={2} />;
  if (list.isError) {
    return (
      <p className="text-body-sm text-text-muted">
        Không tải được danh sách tệp.{" "}
        <button type="button" className="underline" onClick={() => void list.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }

  return (
    <AttachmentPanel
      attachments={list.data ?? []}
      canManage={canManage}
      currentVersion={currentVersion}
      uploading={add.isPending}
      removingId={removingId}
      onUpload={(file) => add.mutate(file)}
      onRemove={(id) => drop.mutate(id)}
      emptyDescription="Người gửi có thể đính kèm tài liệu cho phiên bản hiện tại."
    />
  );
}

export function AnnouncementAttachments({
  announcementId,
  canManage,
}: {
  announcementId: string;
  canManage: boolean;
}) {
  const list = useQuery(announcementAttachmentsQuery(announcementId));
  const { add, drop, removingId } = useAttachmentActions(
    "announcement-attachments",
    announcementId,
    uploadAnnouncementAttachment,
    removeAnnouncementAttachment,
  );

  if (list.isLoading) return <SkeletonCard lines={2} />;
  if (list.isError) {
    return (
      <p className="text-body-sm text-text-muted">
        Không tải được danh sách tệp.{" "}
        <button type="button" className="underline" onClick={() => void list.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }

  return (
    <AttachmentPanel
      attachments={list.data ?? []}
      canManage={canManage}
      uploading={add.isPending}
      removingId={removingId}
      onUpload={(file) => add.mutate(file)}
      onRemove={(id) => drop.mutate(id)}
      emptyDescription="Người soạn thông báo có thể đính kèm tài liệu tham khảo."
    />
  );
}
