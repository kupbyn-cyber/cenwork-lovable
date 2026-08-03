import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_MODE_LABEL, type ApprovalListItem } from "@/lib/approval-data";
import { decideApprovalRequest } from "@/lib/approval.functions";

/**
 * ANN-UI-10 — hành động nhanh Phê duyệt/Từ chối ngay trên danh sách.
 * Vẫn gọi đúng server function NAP-03, không đổi nghiệp vụ.
 */
export function ApprovalQuickActions({ item }: { item: ApprovalListItem }) {
  const queryClient = useQueryClient();
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | undefined>(undefined);

  const decide = useMutation({
    mutationFn: (input: { approve: boolean; note: string | null }) =>
      decideApprovalRequest({
        data: { requestId: item.request.id, approve: input.approve, note: input.note },
      }),
    onSuccess: (_data, variables) => {
      setApproveOpen(false);
      setRejectOpen(false);
      setNote("");
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["approval", item.request.id] });
      toast.success(variables.approve ? "Đã gửi phê duyệt" : "Đã gửi từ chối");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={decide.isPending}
        onClick={() => setApproveOpen(true)}
      >
        <Check />
        Phê duyệt
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={decide.isPending}
        onClick={() => {
          setReasonError(undefined);
          setRejectOpen(true);
        }}
      >
        <X />
        Từ chối
      </Button>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Xác nhận phê duyệt"
        description={`Cơ chế: ${APPROVAL_MODE_LABEL[item.request.approval_mode]}. Quyết định đã gửi không thể thay đổi.`}
        confirmLabel="Phê duyệt"
        loading={decide.isPending}
        onConfirm={() => decide.mutate({ approve: true, note: note.trim() || null })}
      >
        <FormField id={`quick-note-${item.request.id}`} label="Ghi chú (tùy chọn)">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        tone="destructive"
        title="Từ chối yêu cầu"
        description="Lý do từ chối sẽ hiển thị cho người gửi."
        confirmLabel="Từ chối"
        loading={decide.isPending}
        onConfirm={() => {
          if (!reason.trim()) {
            setReasonError("Lý do từ chối là bắt buộc");
            return;
          }
          decide.mutate({ approve: false, note: reason.trim() });
        }}
      >
        <FormField
          id={`quick-reason-${item.request.id}`}
          label="Lý do từ chối"
          required
          error={reasonError}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setReasonError(undefined);
              }}
            />
          )}
        </FormField>
      </ConfirmDialog>
    </>
  );
}
