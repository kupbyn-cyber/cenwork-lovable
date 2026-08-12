import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { completeTaskWithResult } from "@/lib/task-data";

/**
 * CEN 1.0 — Hoàn thành công việc kèm Kết quả công việc.
 * Bắt buộc nhập kết quả; database còn chặn lần nữa bằng trigger.
 * Hoàn thành lại sau yêu cầu sửa: kết quả mới thay kết quả hiện tại,
 * bản cũ vẫn nằm trong lịch sử kết quả.
 */
export interface TaskCompleteTarget {
  id: string;
  name: string;
  result_text?: string | null;
}

export interface TaskCompleteDialogProps {
  task: TaskCompleteTarget | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (taskId: string) => void;
}

export function TaskCompleteDialog({ task, onOpenChange, onCompleted }: TaskCompleteDialogProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (task) {
      setResult(task.result_text ?? "");
      setError(null);
    }
  }, [task]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; result: string }) =>
      completeTaskWithResult(input.id, input.result),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["task-results", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["task-history", input.id] });
      void queryClient.invalidateQueries({ queryKey: ["project-task-counts"] });
      invalidateProjectTaskScope(queryClient, task?.project_id);
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      cenToast.success("Đã hoàn thành công việc và lưu kết quả.");
      onOpenChange(false);
      onCompleted?.(input.id);
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit() {
    if (!task) return;
    const text = result.trim();
    if (!text) {
      setError("Nhập Kết quả công việc trước khi hoàn thành.");
      return;
    }
    if (text.length > 4000) {
      setError("Kết quả công việc tối đa 4000 ký tự.");
      return;
    }
    mutation.mutate({ id: task.id, result: text });
  }

  return (
    <Modal
      open={task !== null}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onOpenChange(false);
      }}
      title="Hoàn thành công việc"
      description={
        task
          ? `Công việc "${task.name}" sẽ chuyển sang trạng thái Hoàn thành. Kết quả được lưu vào công việc và dùng cho báo cáo ngày.`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Hoàn thành
          </Button>
        </>
      }
    >
      <FormField
        id="task-result"
        label="Kết quả công việc"
        required
        error={error ?? undefined}
        helperText="Mô tả ngắn gọn kết quả cụ thể đã đạt được."
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={result}
            disabled={mutation.isPending}
            onChange={(event) => {
              setResult(event.target.value);
              if (error) setError(null);
            }}
            placeholder="Ví dụ: Hoàn thành 3 key visual, đã gửi Leader duyệt."
          />
        )}
      </FormField>
    </Modal>
  );
}
