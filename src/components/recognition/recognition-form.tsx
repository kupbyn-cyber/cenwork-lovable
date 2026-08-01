import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormErrorSummary } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import {
  RECOGNITION_CATEGORY_LABEL,
  RECOGNITION_CATEGORY_ORDER,
  RECOGNITION_DAILY_LIMIT,
  RECOGNITION_MAX_LENGTH,
  RECOGNITION_MIN_LENGTH,
  createRecognition,
  recognitionQuotaQuery,
  recognizableMembersQuery,
  type RecognitionCategory,
} from "@/lib/recognition-data";

/**
 * CEN TODAY-02 — Form gửi ghi nhận đồng đội.
 * Danh sách người nhận và hạn mức đều lấy từ database; UI chỉ phản ánh kết quả đó.
 */
export interface RecognitionFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Người nhận gợi ý sẵn (ví dụ mở từ hồ sơ thành viên). */
  defaultReceiverId?: string | null;
}

export function RecognitionFormModal({
  open,
  onOpenChange,
  defaultReceiverId = null,
}: RecognitionFormModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const membersResult = useQuery(recognizableMembersQuery(user?.id));
  const quotaResult = useQuery(recognitionQuotaQuery(user?.id));

  const [receiverId, setReceiverId] = React.useState<string>("");
  const [category, setCategory] = React.useState<RecognitionCategory>("support");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setReceiverId(defaultReceiverId ?? "");
    setCategory("support");
    setMessage("");
    setError(null);
  }, [open, defaultReceiverId]);

  const members = membersResult.data ?? [];
  const quota = quotaResult.data ?? 0;
  const outOfQuota = !quotaResult.isLoading && quota <= 0;
  const trimmed = message.trim();
  const lengthValid =
    trimmed.length >= RECOGNITION_MIN_LENGTH && trimmed.length <= RECOGNITION_MAX_LENGTH;

  const mutation = useMutation({
    mutationFn: () =>
      createRecognition({
        senderId: user!.id,
        receiverId,
        category,
        message,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recognitions"] });
      void queryClient.invalidateQueries({ queryKey: ["recognition-quota"] });
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      cenToast.success("Đã gửi lời ghi nhận. Bạn có 10 phút để thu hồi nếu cần.");
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Ghi nhận đồng đội"
      description={`Gửi lời ghi nhận tích cực đến đồng đội có quan hệ làm việc với bạn. Còn ${quota}/${RECOGNITION_DAILY_LIMIT} lượt hôm nay.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!receiverId || !lengthValid || outOfQuota}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            <Sparkles />
            Gửi ghi nhận
          </Button>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        {error ? <FormErrorSummary messages={[error]} /> : null}
        {outOfQuota ? (
          <FormErrorSummary
            title="Hết lượt hôm nay"
            messages={[
              `Mỗi người chỉ gửi tối đa ${RECOGNITION_DAILY_LIMIT} lời ghi nhận mỗi ngày.`,
            ]}
          />
        ) : null}

        <FormField
          id="recognition-receiver"
          label="Đồng đội"
          required
          helperText={
            membersResult.isLoading
              ? "Đang tải danh sách đồng đội…"
              : members.length === 0
                ? "Chưa có đồng đội nào đủ điều kiện (cùng Team, Team phối hợp hoặc cùng dự án)."
                : undefined
          }
        >
          {(control) => (
            <Select value={receiverId} onValueChange={setReceiverId}>
              <SelectTrigger id={control.id} aria-invalid={control["aria-invalid"]}>
                <SelectValue placeholder="Chọn đồng đội" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="recognition-category" label="Nhóm ghi nhận" required>
          {(control) => (
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as RecognitionCategory)}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECOGNITION_CATEGORY_ORDER.map((key) => (
                  <SelectItem key={key} value={key}>
                    {RECOGNITION_CATEGORY_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          id="recognition-message"
          label="Lời ghi nhận"
          required
          helperText={`${trimmed.length}/${RECOGNITION_MAX_LENGTH} ký tự · tối thiểu ${RECOGNITION_MIN_LENGTH} ký tự`}
          error={
            trimmed.length > 0 && !lengthValid
              ? `Nội dung cần từ ${RECOGNITION_MIN_LENGTH} đến ${RECOGNITION_MAX_LENGTH} ký tự.`
              : undefined
          }
        >
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              maxLength={RECOGNITION_MAX_LENGTH}
              placeholder="Ví dụ: Cảm ơn bạn đã hỗ trợ chốt nội dung chiến dịch trước hạn."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}
