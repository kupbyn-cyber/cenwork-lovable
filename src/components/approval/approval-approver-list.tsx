import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DECISION_STATUS_LABEL,
  DECISION_STATUS_TONE,
  approvalDirectoryQuery,
  isOpenStatus,
  type ApprovalDetail,
  type ApprovalDecisionRow,
} from "@/lib/approval-data";
import { replaceApprovalApprover } from "@/lib/approval.functions";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * NAP-04 — Danh sách người phê duyệt của phiên bản hiện tại.
 * Chỉ người gửi mới thấy hành động thay người phê duyệt, và chỉ khi người đó
 * không còn hoạt động (server function NAP-03 kiểm tra lại điều kiện này).
 */
interface Props {
  detail: ApprovalDetail;
  userId: string | null;
}

export function ApprovalApproverList({ detail, userId }: Props) {
  const queryClient = useQueryClient();
  const { request } = detail;
  const isSender = userId === request.sender_id;
  const canReplace = isSender && isOpenStatus(request.status);

  const [target, setTarget] = React.useState<ApprovalDecisionRow | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const directory = useQuery({ ...approvalDirectoryQuery(), enabled: Boolean(target) });

  const current = detail.decisions.filter((item) => item.version_no === request.current_version);
  const participants = new Map(detail.participants.map((item) => [item.id, item]));

  const existingIds = new Set(
    current.filter((item) => item.decision_status !== "replaced").map((item) => item.approver_id),
  );

  const candidates = (directory.data ?? []).filter(
    (item) =>
      item.id !== request.sender_id &&
      !existingIds.has(item.id) &&
      (!search.trim() ||
        item.display_name.toLowerCase().includes(search.trim().toLowerCase()) ||
        item.email.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const mutation = useMutation({
    mutationFn: () =>
      replaceApprovalApprover({
        data: {
          requestId: request.id,
          oldApproverId: target!.approver_id,
          newApproverId: selected!,
        },
      }),
    onSuccess: () => {
      setTarget(null);
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["approval", request.id] });
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Đã thay người phê duyệt");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {current.map((item) => {
        const profile = participants.get(item.approver_id);
        const inactive = profile ? !profile.is_active : false;
        return (
          <div
            key={item.id}
            className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <p className="break-words text-label font-medium text-text-primary">
                {profile?.display_name ?? "Người dùng"}
                {inactive ? (
                  <span className="ml-2 text-helper text-state-warning">(không còn hoạt động)</span>
                ) : null}
              </p>
              <p className="break-words text-helper text-text-muted">{profile?.email ?? "—"}</p>
              {item.decision_at ? (
                <p className="text-helper text-text-muted">
                  Xử lý lúc {formatHanoiDateTime(item.decision_at)}
                </p>
              ) : null}
              {item.approval_note ? (
                <p className="mt-1 break-words text-helper text-text-secondary">
                  Ghi chú: {item.approval_note}
                </p>
              ) : null}
              {item.rejection_reason ? (
                <p className="mt-1 break-words text-helper text-state-danger">
                  Lý do từ chối: {item.rejection_reason}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge
                tone={DECISION_STATUS_TONE[item.decision_status]}
                label={DECISION_STATUS_LABEL[item.decision_status]}
              />
              {canReplace && inactive && item.decision_status === "pending" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelected(null);
                    setSearch("");
                    setTarget(item);
                  }}
                >
                  <UserCog />
                  Thay người
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
        title="Thay người phê duyệt"
        description="Chỉ thay được người phê duyệt đã khóa, nghỉ việc hoặc không hoạt động."
        confirmLabel="Thay người"
        confirmDisabled={!selected}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <Input
            value={search}
            aria-label="Tìm người phê duyệt thay thế"
            placeholder="Tìm theo tên hoặc email"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-56 overflow-y-auto rounded-control border border-border-default">
            {directory.isLoading ? (
              <p className="p-3 text-helper text-text-muted">Đang tải danh bạ…</p>
            ) : candidates.length === 0 ? (
              <p className="p-3 text-helper text-text-muted">
                Không có tài khoản hợp lệ để thay thế.
              </p>
            ) : (
              candidates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`flex w-full min-w-0 flex-col items-start border-b border-border-default p-3 text-left last:border-b-0 ${
                    selected === item.id ? "bg-surface-raised" : ""
                  }`}
                >
                  <span className="truncate text-label text-text-primary">{item.display_name}</span>
                  <span className="truncate text-helper text-text-muted">{item.email}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
