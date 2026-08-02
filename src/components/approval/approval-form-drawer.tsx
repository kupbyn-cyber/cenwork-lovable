import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormModal } from "@/components/ui/form-modal";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  APPROVAL_MODE_HINT,
  APPROVAL_MODE_LABEL,
  approvalDirectoryQuery,
  type ApprovalMode,
  type ApprovalRequestRow,
} from "@/lib/approval-data";
import { createApproval, resubmitApprovalRequest } from "@/lib/approval.functions";
import { hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";

/**
 * NAP-04 — Form tạo yêu cầu phê duyệt và form gửi lại sau khi bị từ chối.
 * Gửi lại giữ nguyên cơ chế và danh sách người phê duyệt (theo Business Rule NAP-03).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Có giá trị: chế độ "Sửa và gửi lại" trên cùng yêu cầu. */
  resubmitOf?: ApprovalRequestRow | undefined;
}

interface FormState {
  title: string;
  content: string;
  dueDate: string;
  dueTime: string;
  mode: ApprovalMode;
  approverIds: string[];
}

const EMPTY: FormState = {
  title: "",
  content: "",
  dueDate: "",
  dueTime: "17:00",
  mode: "any_one",
  approverIds: [],
};

export function ApprovalFormDrawer({ open, onOpenChange, resubmitOf }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isResubmit = Boolean(resubmitOf);

  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [search, setSearch] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const directory = useQuery({ ...approvalDirectoryQuery(), enabled: open && !isResubmit });

  const initialForm = React.useMemo<FormState>(() => {
    if (!resubmitOf) return EMPTY;
    const due = utcToHanoiInputs(resubmitOf.due_at);
    return {
      title: resubmitOf.title,
      content: resubmitOf.content,
      dueDate: due.date,
      dueTime: due.time || "17:00",
      mode: resubmitOf.approval_mode,
      approverIds: [],
    };
  }, [resubmitOf]);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setSearch("");
    setForm(initialForm);
  }, [open, initialForm]);

  const candidates = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return (directory.data ?? [])
      .filter((item) => item.id !== user?.id)
      .filter(
        (item) =>
          !term ||
          item.display_name.toLowerCase().includes(term) ||
          item.email.toLowerCase().includes(term),
      );
  }, [directory.data, search, user?.id]);

  function validate(): string | null {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next["title"] = "Tiêu đề không được để trống";
    if (!form.content.trim()) next["content"] = "Nội dung đề nghị không được để trống";
    const dueAt = hanoiToUtcISO(form.dueDate, form.dueTime || "00:00");
    if (!dueAt) next["due"] = "Cần chọn ngày và giờ hạn xử lý";
    else if (new Date(dueAt).getTime() <= Date.now()) next["due"] = "Hạn xử lý phải ở tương lai";
    if (!isResubmit && form.approverIds.length === 0)
      next["approvers"] = "Phải chọn ít nhất một người phê duyệt";
    setErrors(next);
    return Object.keys(next).length > 0 ? null : dueAt;
  }

  const mutation = useMutation({
    mutationFn: async (dueAt: string) => {
      if (resubmitOf) {
        await resubmitApprovalRequest({
          data: {
            requestId: resubmitOf.id,
            title: form.title.trim(),
            content: form.content.trim(),
            dueAt,
          },
        });
        return resubmitOf.id;
      }
      const result = await createApproval({
        data: {
          title: form.title.trim(),
          content: form.content.trim(),
          dueAt,
          mode: form.mode,
          approverIds: [...new Set(form.approverIds)],
        },
      });
      return result.requestId;
    },
    onSuccess: (requestId) => {
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["approval", requestId] });
      onOpenChange(false);
      toast.success(isResubmit ? "Đã gửi lại yêu cầu phê duyệt" : "Đã tạo yêu cầu phê duyệt");
      void navigate({ to: "/approvals/$approvalId", params: { approvalId: requestId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit() {
    const dueAt = validate();
    if (!dueAt) return;
    mutation.mutate(dueAt);
  }

  return (
    <FormModal
      open={open}
      size="lg"
      dirty={JSON.stringify(form) !== JSON.stringify(initialForm)}
      busy={mutation.isPending}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title={isResubmit ? "Sửa và gửi lại yêu cầu" : "Tạo yêu cầu phê duyệt"}
      description={
        isResubmit
          ? "Giữ nguyên cơ chế và danh sách người phê duyệt; tất cả sẽ phải xử lý lại."
          : "Chọn người phê duyệt và cơ chế xử lý cho yêu cầu của bạn."
      }
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Hủy
          </Button>
          <Button type="button" onClick={submit} loading={mutation.isPending}>
            {isResubmit ? "Gửi lại" : "Gửi yêu cầu"}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <FormField id="approval-title" label="Tiêu đề" required error={errors["title"]}>
          {(control) => (
            <Input
              {...control}
              value={form.title}
              maxLength={200}
              placeholder="Ví dụ: Đề nghị duyệt ngân sách chiến dịch tháng 8"
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          )}
        </FormField>

        <FormField
          id="approval-content"
          label="Nội dung đề nghị"
          required
          error={errors["content"]}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={6}
              maxLength={5000}
              value={form.content}
              placeholder="Mô tả nội dung cần phê duyệt"
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            />
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField id="approval-due-date" label="Hạn xử lý (ngày)" required error={errors["due"]}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            )}
          </FormField>
          <FormField id="approval-due-time" label="Hạn xử lý (giờ)" required>
            {(control) => (
              <Input
                {...control}
                type="time"
                value={form.dueTime}
                onChange={(event) => setForm((prev) => ({ ...prev, dueTime: event.target.value }))}
              />
            )}
          </FormField>
        </div>

        {isResubmit ? (
          <p className="rounded-control border border-border-default bg-surface-subtle p-3 text-helper text-text-muted">
            Cơ chế phê duyệt: {APPROVAL_MODE_LABEL[form.mode]}. Danh sách người phê duyệt giữ nguyên
            và sẽ phải xử lý lại từ đầu.
          </p>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-2">
              <Label className="text-label font-medium text-text-secondary">Cơ chế phê duyệt</Label>
              <RadioGroup
                value={form.mode}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, mode: value as ApprovalMode }))
                }
                className="gap-2"
              >
                {(["any_one", "all_required"] as ApprovalMode[]).map((mode) => (
                  <label
                    key={mode}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-control border border-border-default p-3"
                  >
                    <RadioGroupItem value={mode} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-label font-medium text-text-primary">
                        {APPROVAL_MODE_LABEL[mode]}
                      </span>
                      <span className="block text-helper text-text-muted">
                        {APPROVAL_MODE_HINT[mode]}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <Label className="text-label font-medium text-text-secondary">
                Người phê duyệt <span className="text-state-danger">*</span>
              </Label>
              <Input
                value={search}
                placeholder="Tìm theo tên hoặc email"
                aria-label="Tìm người phê duyệt"
                onChange={(event) => setSearch(event.target.value)}
              />
              {errors["approvers"] ? (
                <p className="text-helper text-state-danger">{errors["approvers"]}</p>
              ) : null}
              <div className="max-h-64 min-w-0 overflow-y-auto rounded-control border border-border-default">
                {directory.isLoading ? (
                  <div className="p-3">
                    <SkeletonCard lines={3} />
                  </div>
                ) : directory.isError ? (
                  <ErrorState
                    variant="compact"
                    title="Không tải được danh bạ"
                    onRetry={() => void directory.refetch()}
                  />
                ) : candidates.length === 0 ? (
                  <p className="p-3 text-helper text-text-muted">
                    Không tìm thấy tài khoản đang hoạt động phù hợp.
                  </p>
                ) : (
                  candidates.map((item) => {
                    const checked = form.approverIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-border-default p-3 last:border-b-0"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              approverIds: value
                                ? [...new Set([...prev.approverIds, item.id])]
                                : prev.approverIds.filter((id) => id !== item.id),
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-label text-text-primary">
                            {item.display_name}
                          </span>
                          <span className="block truncate text-helper text-text-muted">
                            {item.email}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-helper text-text-muted">
                Đã chọn {form.approverIds.length} người. Không thể chọn chính bạn hoặc tài khoản đã
                khóa/nghỉ việc.
              </p>
            </div>
          </>
        )}
      </div>
    </FormModal>
  );
}
