import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { cancelTask } from "@/lib/task-data";

/**
 * TASK-RULE-XX — Hủy công việc.
 * Chỉ trình bày phần xác nhận; quyền và điều kiện trạng thái do RPC `task_cancel`
 * kiểm tra lại ở database. Không xóa dữ liệu: Task chuyển "Đã hủy" và vào Lưu trữ.
 */
export interface TaskCancelTarget {
  id: string;
  name: string;
}

export function TaskCancelDialog({
  task,
  onOpenChange,
  title = "Hủy công việc?",
  onCancelled,
}: {
  task: TaskCancelTarget | null;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onCancelled?: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (task) {
      setReason("");
      setError(null);
    }
  }, [task]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) => cancelTask(input.id, input.reason),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["task-approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["task-history", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
      invalidateProjectTaskScope(queryClient, task?.project_id);
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      void queryClient.invalidateQueries({ queryKey: ["today-insights"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success("Đã hủy và lưu trữ công việc.");
      onOpenChange(false);
      onCancelled?.(input.id);
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit() {
    if (!task) return;
    const text = reason.trim();
    if (!text) {
      setError("Nhập lý do hủy trước khi xác nhận.");
      return;
    }
    if (text.length > 1000) {
      setError("Lý do hủy tối đa 1000 ký tự.");
      return;
    }
    mutation.mutate({ id: task.id, reason: text });
  }

  return (
    <Modal
      open={task !== null}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onOpenChange(false);
      }}
      title={title}
      size="md"
      description="Công việc sẽ chuyển sang trạng thái Đã hủy và được đưa vào Lưu trữ."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Giữ lại
          </Button>
          <Button variant="destructive" onClick={submit} loading={mutation.isPending}>
            Xác nhận hủy
          </Button>
        </>
      }
    >
      <FormField
        id="task-cancel-reason"
        label="Lý do hủy"
        required
        error={error ?? undefined}
        helperText={task ? `Công việc: ${task.name}` : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={reason}
            disabled={mutation.isPending}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Ví dụ: Chiến dịch dừng, không cần thực hiện nữa."
          />
        )}
      </FormField>
    </Modal>
  );
}