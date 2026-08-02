import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalFormDrawer } from "@/components/approval/approval-form-drawer";
import { APPROVAL_MODE_LABEL, isOpenStatus, type ApprovalDetail } from "@/lib/approval-data";
import { decideApprovalRequest, withdrawApprovalRequest } from "@/lib/approval.functions";

/**
 * NAP-04 — Hành động trên yêu cầu phê duyệt.
 * Điều kiện hiển thị chỉ để giảm thao tác sai; server function NAP-03 mới là chốt chặn thật.
 */
interface Props {
  detail: ApprovalDetail;
  userId: string | null;
  /** Bố cục thanh hành động cố định ở cuối màn hình trên mobile. */
  sticky?: boolean;
}

export function ApprovalActions({ detail, userId, sticky = false }: Props) {
  const queryClient = useQueryClient();
  const { request } = detail;
  const status = request.status;
  const open = isOpenStatus(status);

  const myDecision = detail.decisions.find(
    (item) =>
      item.version_no === request.current_version &&
      item.approver_id === userId &&
      item.decision_status !== "replaced",
  );
  const canDecide = open && Boolean(myDecision) && myDecision?.decision_status === "pending";
  const isSender = userId === request.sender_id;
  const canWithdraw = isSender && open;
  const canResubmit = isSender && status === "rejected";

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [resubmitOpen, setResubmitOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | undefined>(undefined);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    void queryClient.invalidateQueries({ queryKey: ["approval", request.id] });
  }

  const decideMutation = useMutation({
    mutationFn: (input: { approve: boolean; note: string | null }) =>
      decideApprovalRequest({
        data: { requestId: request.id, approve: input.approve, note: input.note },
      }),
    onSuccess: (_data, variables) => {
      setApproveOpen(false);
      setRejectOpen(false);
      setNote("");
      setReason("");
      refresh();
      toast.success(variables.approve ? "Đã gửi phê duyệt" : "Đã gửi từ chối");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: () =>
      withdrawApprovalRequest({
        data: { requestId: request.id, reason: reason.trim() || null },
      }),
    onSuccess: () => {
      setWithdrawOpen(false);
      setReason("");
      refresh();
      toast.success("Đã thu hồi yêu cầu");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = decideMutation.isPending || withdrawMutation.isPending;

  if (!canDecide && !canWithdraw && !canResubmit) return null;

  return (
    <div
      className={
        sticky
          ? "sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-border-default bg-surface-base p-4 sm:mx-0 sm:rounded-control sm:border sm:p-3"
          : "flex flex-wrap gap-2"
      }
    >
      {canDecide ? (
        <>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            disabled={busy}
            onClick={() => setApproveOpen(true)}
          >
            <Check />
            Phê duyệt
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1 sm:flex-none"
            disabled={busy}
            onClick={() => {
              setReasonError(undefined);
              setRejectOpen(true);
            }}
          >
            <X />
            Từ chối
          </Button>
        </>
      ) : null}

      {canWithdraw ? (
        <Button
          type="button"
          variant="secondary"
          className="flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => setWithdrawOpen(true)}
        >
          <Undo2 />
          Thu hồi
        </Button>
      ) : null}

      {canResubmit ? (
        <Button type="button" className="flex-1 sm:flex-none" onClick={() => setResubmitOpen(true)}>
          <RotateCcw />
          Sửa và gửi lại
        </Button>
      ) : null}

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Xác nhận phê duyệt"
        description={`Cơ chế: ${APPROVAL_MODE_LABEL[request.approval_mode]}. Quyết định đã gửi không thể thay đổi.`}
        confirmLabel="Phê duyệt"
        loading={decideMutation.isPending}
        onConfirm={() => decideMutation.mutate({ approve: true, note: note.trim() || null })}
      >
        <FormField id="approval-note" label="Ghi chú (tùy chọn)">
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
        description={
          request.approval_mode === "all_required"
            ? "Cơ chế Tất cả phải đồng ý: yêu cầu sẽ bị từ chối ngay lập tức."
            : "Cơ chế Chỉ cần một người đồng ý: yêu cầu chỉ bị từ chối khi tất cả cùng từ chối."
        }
        confirmLabel="Từ chối"
        loading={decideMutation.isPending}
        onConfirm={() => {
          if (!reason.trim()) {
            setReasonError("Lý do từ chối là bắt buộc");
            return;
          }
          decideMutation.mutate({ approve: false, note: reason.trim() });
        }}
      >
        <FormField id="approval-reason" label="Lý do từ chối" required error={reasonError}>
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

      <ConfirmDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        tone="destructive"
        title="Thu hồi yêu cầu"
        description="Yêu cầu sẽ chuyển sang Đã thu hồi và không ai còn xử lý được. Toàn bộ lịch sử vẫn được giữ."
        confirmLabel="Thu hồi"
        loading={withdrawMutation.isPending}
        onConfirm={() => withdrawMutation.mutate()}
      >
        <FormField id="approval-withdraw-reason" label="Lý do thu hồi (tùy chọn)">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
      </ConfirmDialog>

      <ApprovalFormDrawer open={resubmitOpen} onOpenChange={setResubmitOpen} resubmitOf={request} />
    </div>
  );
}
