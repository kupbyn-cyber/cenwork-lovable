import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormErrorSummary } from "@/components/ui/error-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { RecognitionBurst } from "@/components/recognition/recognition-burst";
import {
  RECOGNITION_CATEGORY_META,
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
 * CEN TODAY-02 / RECOGNITION-01 — Form gửi ghi nhận.
 * Cho phép chọn đồng đội hoặc chính mình (tự ghi nhận).
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
  const [category, setCategory] = React.useState<RecognitionCategory>("teamwork");
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [burstName, setBurstName] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setReceiverId(defaultReceiverId ?? "");
    setCategory("teamwork");
    setMessage("");
    setError(null);
    setSearch("");
  }, [open, defaultReceiverId]);

  /** Chính mình luôn đứng đầu danh sách với nhãn "Bạn". */
  const members = React.useMemo(() => {
    const all = membersResult.data ?? [];
    const me = all.filter((person) => person.id === user?.id);
    const others = all.filter((person) => person.id !== user?.id);
    return [...me, ...others];
  }, [membersResult.data, user?.id]);

  const quota = quotaResult.data ?? 0;
  const outOfQuota = !quotaResult.isLoading && quota <= 0;
  const trimmed = message.trim();
  const lengthValid =
    trimmed.length >= RECOGNITION_MIN_LENGTH && trimmed.length <= RECOGNITION_MAX_LENGTH;
  const receiver = members.find((person) => person.id === receiverId) ?? null;
  const isSelf = Boolean(receiverId) && receiverId === user?.id;

  /** Tìm kiếm không phân biệt hoa thường và dấu tiếng Việt. */
  const filtered = React.useMemo(() => {
    const needle = normalizeVi(search);
    if (!needle) return members;
    return members.filter((person) => normalizeVi(person.display_name).includes(needle));
  }, [members, search]);

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
      void queryClient.invalidateQueries({ queryKey: ["recognition-team-pulse"] });
      void queryClient.invalidateQueries({ queryKey: ["today-hub"] });
      setBurstName(isSelf ? "chính bạn" : (receiver?.display_name ?? "đồng đội"));
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      {burstName ? (
        <RecognitionBurst receiverName={burstName} onDone={() => setBurstName(null)} />
      ) : null}
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        size="md"
        title="Gửi lời ghi nhận"
        description={`Ghi nhận đồng đội hoặc chính mình. Còn ${quota}/${RECOGNITION_DAILY_LIMIT} lượt hôm nay.`}
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
              messages={[`Mỗi người chỉ gửi tối đa ${RECOGNITION_DAILY_LIMIT} lời ghi nhận mỗi ngày.`]}
            />
          ) : null}

          <FormField
            id="recognition-receiver"
            label="Người nhận"
            required
            helperText={
              membersResult.isLoading
                ? "Đang tải danh sách…"
                : isSelf
                  ? "Bạn đang tự ghi nhận — bản ghi sẽ được gắn nhãn “Tự ghi nhận”."
                  : undefined
            }
          >
            {(control) => (
              <div className="flex min-w-0 flex-col gap-2">
                <Input
                  id={control.id}
                  aria-invalid={control["aria-invalid"]}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên…"
                />
                <div
                  role="listbox"
                  aria-label="Danh sách người nhận"
                  className="max-h-56 min-w-0 overflow-y-auto rounded-card border border-border-default"
                >
                  {membersResult.isLoading ? (
                    <p className="px-3 py-3 text-helper text-text-muted">Đang tải danh sách…</p>
                  ) : membersResult.isError ? (
                    <ErrorState
                      variant="compact"
                      title="Không tải được danh sách thành viên"
                      onRetry={() => void membersResult.refetch()}
                    />
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-3 text-helper text-text-muted">
                      Không tìm thấy thành viên phù hợp.
                    </p>
                  ) : (
                    filtered.map((member) => {
                      const self = member.id === user?.id;
                      const active = member.id === receiverId;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => setReceiverId(member.id)}
                          className={cn(
                            "cen-transition flex w-full min-w-0 flex-col items-start gap-0.5 px-3 py-2 text-left",
                            active
                              ? "bg-brand-primary/10 text-text-primary"
                              : "text-text-secondary hover:bg-surface-subtle",
                          )}
                        >
                          <span className="min-w-0 truncate text-body text-text-primary">
                            {self ? `Bạn — ${member.display_name}` : member.display_name}
                          </span>
                          {member.job_title ? (
                            <span className="min-w-0 truncate text-helper text-text-muted">
                              {member.job_title}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </FormField>

          <FormField
            id="recognition-category"
            label="Loại ghi nhận"
            required
            helperText={RECOGNITION_CATEGORY_META[category].hint}
          >
            {() => (
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                {RECOGNITION_CATEGORY_ORDER.map((key) => {
                  const meta = RECOGNITION_CATEGORY_META[key];
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(key)}
                      className={cn(
                        "cen-transition flex min-w-0 items-center gap-2 rounded-card border px-3 py-2 text-left text-body",
                        "motion-safe:active:scale-[0.98]",
                        active
                          ? meta.tone
                          : "border-border-default bg-state-neutral-surface text-text-secondary hover:border-border-strong",
                        active ? "ring-2 ring-brand-primary/40" : "",
                      )}
                    >
                      <span aria-hidden>{meta.emoji}</span>
                      <span className="min-w-0 truncate">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
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
                placeholder={`Ghi nhận ${
                  isSelf ? "bản thân" : (receiver?.display_name ?? "[Tên]")
                } vì [hành động cụ thể], điều này đã giúp [kết quả].`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </Modal>
    </>
  );
}
