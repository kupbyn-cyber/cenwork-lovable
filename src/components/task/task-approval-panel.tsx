import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, RotateCcw, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import {
  TASK_APPROVAL_LABEL,
  TASK_APPROVAL_TONE,
  canApproveTaskSubmission,
  canResubmitTask,
  canWithdrawTaskSubmission,
  decideTaskApproval,
  formatDateTime,
  resubmitTaskForApproval,
  taskApprovalsQuery,
  withdrawTaskSubmission,
  type TaskAccessContext,
  type TaskRow,
} from "@/lib/task-data";

/**
 * TASK-APPROVAL-01 — khu vực "Task chờ duyệt".
 * Chỉ hiển thị yêu cầu chưa được duyệt; mọi hành động đều đi qua RPC có kiểm tra quyền
 * ở database (Leader đúng Team phụ trách, Admin/CMO, hoặc chính người gửi).
 */
export function TaskApprovalPanel({ ctx }: { ctx: TaskAccessContext }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery(taskApprovalsQuery());
  const [rejectTarget, setRejectTarget] = React.useState<TaskRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);

  const rows = data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["task-approvals"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const decide = useMutation({
    mutationFn: (input: { id: string; approve: boolean; note?: string }) =>
      decideTaskApproval(input.id, input.approve, input.note ?? null),
    onSuccess: (_data, input) => {
      refresh();
      setRejectTarget(null);
      setReason("");
      cenToast.success(
        input.approve ? "Đã duyệt công việc." : "Đã gửi yêu cầu chỉnh sửa tới người tạo.",
      );
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const resubmit = useMutation({
    mutationFn: (id: string) => resubmitTaskForApproval(id),
    onSuccess: () => {
      refresh();
      cenToast.success("Đã gửi công việc tới Leader phê duyệt.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawTaskSubmission(id),
    onSuccess: () => {
      refresh();
      cenToast.success("Đã thu hồi yêu cầu.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  if (rows.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-heading-sm font-semibold text-text-primary">Task chờ duyệt</h2>
        <span className="text-body-sm text-text-muted">
          {rows.length} yêu cầu chưa vào danh sách công việc chính thức
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const approver = canApproveTaskSubmission(row, ctx);
          return (
            <Card key={row.id} className="flex min-w-0 flex-col gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 truncate text-left font-medium text-text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      void navigate({ to: "/tasks/$taskId", params: { taskId: row.id } })
                    }
                  >
                    {row.name}
                  </button>
                  <StatusBadge
                    label={TASK_APPROVAL_LABEL[row.approval_status]}
                    tone={TASK_APPROVAL_TONE[row.approval_status]}
                  />
                </div>
                <p className="text-body-sm text-text-secondary">
                  Dự án: {row.projectName ?? "—"} · Team phụ trách: {row.teamName ?? "—"} · Người
                  gửi: {row.creatorName ?? "—"} · Deadline: {formatDateTime(row.deadline)}
                </p>
                <p className="text-body-sm text-text-muted">
                  Người xử lý: {row.teamName ? `Leader ${row.teamName}` : "Admin/CMO"}
                  {row.approval_status === "changes_requested" && row.approval_note
                    ? ` · Lý do cần chỉnh sửa: ${row.approval_note}`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {approver ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => decide.mutate({ id: row.id, approve: true })}
                      loading={decide.isPending}
                    >
                      <Check />
                      Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectTarget(row);
                        setReason("");
                        setReasonError(null);
                      }}
                    >
                      <X />
                      Yêu cầu chỉnh sửa
                    </Button>
                  </>
                ) : null}
                {canResubmitTask(row, ctx) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resubmit.mutate(row.id)}
                    loading={resubmit.isPending}
                  >
                    <RotateCcw />
                    Gửi lại
                  </Button>
                ) : null}
                {canWithdrawTaskSubmission(row, ctx) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => withdraw.mutate(row.id)}
                    loading={withdraw.isPending}
                  >
                    <Undo2 />
                    Thu hồi
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={rejectTarget !== null}
        onOpenChange={(open) => (open ? undefined : setRejectTarget(null))}
        title="Yêu cầu chỉnh sửa"
        description={rejectTarget?.name}
        size="md"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Hủy
            </Button>
            <Button
              loading={decide.isPending}
              onClick={() => {
                const note = reason.trim();
                if (!note) {
                  setReasonError("Cần nhập lý do yêu cầu chỉnh sửa.");
                  return;
                }
                if (rejectTarget) decide.mutate({ id: rejectTarget.id, approve: false, note });
              }}
            >
              Gửi yêu cầu
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <Textarea
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Nêu rõ nội dung cần chỉnh sửa."
            aria-label="Lý do yêu cầu chỉnh sửa"
          />
          {reasonError ? (
            <p role="alert" className="text-body-sm text-state-danger">
              {reasonError}
            </p>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
