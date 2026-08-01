import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { formatHanoiDateTime, hanoiToUtcISO, utcToHanoiInputs } from "@/lib/datetime";
import {
  decideDeadlineChange,
  requestDeadlineChange,
  type DeadlineEntityType,
  type DeadlineRequestRow,
} from "@/lib/deadline-data";

/**
 * CEN 1.0 — Modal gửi và xử lý yêu cầu đổi deadline.
 * UI chỉ thu thập dữ liệu; quyền, trạng thái pending và việc áp dụng deadline
 * được kiểm tra lại trong RPC ở database.
 */
function useRefresh(entityType: DeadlineEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["deadline-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({
      queryKey: [entityType === "task" ? "task" : "project", entityId],
    });
    void queryClient.invalidateQueries({
      queryKey: [entityType === "task" ? "task-history" : "project-history", entityId],
    });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
  };
}

export interface DeadlineRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: DeadlineEntityType;
  entityId: string;
  entityName: string;
  /** Deadline hiện tại dạng ISO (dự án: mốc 00:00 giờ Hà Nội của ngày deadline). */
  currentDeadline: string | null;
  /** Dự án chỉ có deadline theo ngày. */
  dateOnly?: boolean;
}

export function DeadlineRequestModal({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
  currentDeadline,
  dateOnly = false,
}: DeadlineRequestModalProps) {
  const refresh = useRefresh(entityType, entityId);
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const parts = utcToHanoiInputs(currentDeadline);
    setDate(parts.date);
    setTime(dateOnly ? "00:00" : parts.time || "17:00");
    setReason("");
    setError(null);
  }, [open, currentDeadline, dateOnly]);

  const mutation = useMutation({
    mutationFn: (input: { proposed: string; reason: string }) =>
      requestDeadlineChange({ entityType, entityId, ...input }),
    onSuccess: () => {
      refresh();
      onOpenChange(false);
      cenToast.success("Đã gửi yêu cầu đổi deadline. Chờ người có thẩm quyền xử lý.");
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = () => {
    if (!date || !time) {
      setError("Chọn đầy đủ deadline đề xuất.");
      return;
    }
    if (!reason.trim()) {
      setError("Phải nhập lý do đổi deadline.");
      return;
    }
    const proposed = hanoiToUtcISO(date, time);
    if (!proposed) {
      setError("Deadline đề xuất không hợp lệ.");
      return;
    }
    if (new Date(proposed).getTime() <= Date.now()) {
      setError("Deadline đề xuất không được ở quá khứ.");
      return;
    }
    if (currentDeadline && new Date(proposed).getTime() === new Date(currentDeadline).getTime()) {
      setError("Deadline đề xuất trùng với deadline hiện tại.");
      return;
    }
    setError(null);
    mutation.mutate({ proposed, reason: reason.trim() });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title="Yêu cầu đổi deadline"
      description={entityName}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Gửi yêu cầu
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField id="deadline-current" label="Deadline hiện tại">
          {(control) => (
            <Input {...control} readOnly value={formatHanoiDateTime(currentDeadline)} />
          )}
        </FormField>

        <FormField id="deadline-proposed" label="Deadline đề xuất" required>
          {(control) => (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                {...control}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              {dateOnly ? null : (
                <Input
                  type="time"
                  aria-label="Giờ deadline đề xuất"
                  className="sm:w-40"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              )}
            </div>
          )}
        </FormField>

        <FormField id="deadline-reason" label="Lý do" required error={error ?? undefined}>
          {(control) => (
            <Textarea
              {...control}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Nêu rõ lý do cần lùi hoặc đẩy sớm deadline."
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}

export interface DeadlineDecisionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: DeadlineRequestRow | null;
  entityName: string;
}

export function DeadlineDecisionModal({
  open,
  onOpenChange,
  request,
  entityName,
}: DeadlineDecisionModalProps) {
  const refresh = useRefresh(request?.entity_type ?? "task", request?.entity_id ?? "");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (approve: boolean) =>
      decideDeadlineChange({ requestId: request!.id, approve, note }),
    onSuccess: (_data, approve) => {
      refresh();
      onOpenChange(false);
      cenToast.success(approve ? "Đã duyệt và cập nhật deadline." : "Đã từ chối yêu cầu.");
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!request) return null;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
      }}
      title="Xử lý yêu cầu đổi deadline"
      description={entityName}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Đóng
          </Button>
          <Button
            variant="destructive"
            loading={mutation.isPending}
            onClick={() => {
              if (!note.trim()) {
                setError("Phải nhập lý do từ chối.");
                return;
              }
              setError(null);
              mutation.mutate(false);
            }}
          >
            Từ chối
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate(true)}>
            Duyệt
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">Người yêu cầu</dt>
            <dd className="text-body text-text-primary">{request.requesterName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">Thời điểm gửi</dt>
            <dd className="text-body text-text-primary">
              {formatHanoiDateTime(request.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">Deadline cũ</dt>
            <dd className="text-body text-text-primary">
              {formatHanoiDateTime(request.current_deadline)}
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">Deadline mới</dt>
            <dd className="text-body text-text-primary">
              {formatHanoiDateTime(request.proposed_deadline)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption uppercase tracking-wide text-text-muted">Lý do</dt>
            <dd className="whitespace-pre-line text-body text-text-primary">{request.reason}</dd>
          </div>
        </dl>

        <FormField
          id="deadline-decision-note"
          label="Lý do từ chối (bắt buộc khi từ chối)"
          error={error ?? undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Modal>
  );
}
