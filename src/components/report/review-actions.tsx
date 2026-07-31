import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";

/**
 * CEN 1.0 — M4 khối duyệt dùng chung cho báo cáo ngày và tuần.
 * Yêu cầu chỉnh sửa bắt buộc có nhận xét (UI, server và trigger đều kiểm tra).
 */
export interface ReviewActionsProps {
  onReview: (decision: "approved" | "changes_requested", note: string) => Promise<void>;
  invalidateKeys: unknown[][];
}

export function ReviewActions({ onReview, invalidateKeys }: ReviewActionsProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (decision: "approved" | "changes_requested") => onReview(decision, note.trim()),
    onSuccess: (_data, decision) => {
      for (const key of invalidateKeys) void queryClient.invalidateQueries({ queryKey: key });
      setNote("");
      cenToast.success(decision === "approved" ? "Đã duyệt báo cáo" : "Đã gửi yêu cầu chỉnh sửa");
    },
    onError: (err: Error) => cenToast.error("Không xử lý được", { description: err.message }),
  });

  function run(decision: "approved" | "changes_requested") {
    if (decision === "changes_requested" && !note.trim()) {
      setError("Phải nhập nhận xét khi yêu cầu chỉnh sửa");
      return;
    }
    setError(undefined);
    mutation.mutate(decision);
  }

  return (
    <div className="flex flex-col gap-3">
      <FormField id="review-note" label="Nhận xét" error={error}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Nhận xét cho người gửi (bắt buộc khi yêu cầu chỉnh sửa)."
          />
        )}
      </FormField>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={() => run("approved")}
          loading={mutation.isPending && mutation.variables === "approved"}
        >
          Duyệt báo cáo
        </Button>
        <Button
          variant="secondary"
          onClick={() => run("changes_requested")}
          loading={mutation.isPending && mutation.variables === "changes_requested"}
        >
          Yêu cầu chỉnh sửa
        </Button>
      </div>
    </div>
  );
}
