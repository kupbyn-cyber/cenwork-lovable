import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cenToast } from "@/components/ui/toast";
import { saveReview, type MvpReviewRow } from "@/lib/mvp-data";
import {
  MVP_CRITERION_LABEL,
  MVP_CRITERION_MAX,
  requiresEvidence,
  reviewScaleOptions,
} from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 chấm điểm đánh giá thực tế (25 điểm).
 * Thang 5 mức cố định; mức Tốt trở lên bắt buộc kèm bằng chứng.
 */
export interface ReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  reviewerId: string;
  subjectId: string;
  subjectName: string;
  existing?: MvpReviewRow | undefined;
}

export function ReviewDrawer({
  open,
  onOpenChange,
  cycleId,
  reviewerId,
  subjectId,
  subjectName,
  existing,
}: ReviewDrawerProps) {
  const queryClient = useQueryClient();
  const [quality, setQuality] = React.useState(0);
  const [proactive, setProactive] = React.useState(0);
  const [teamwork, setTeamwork] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [evidence, setEvidence] = React.useState("");
  const [errors, setErrors] = React.useState<{ reason?: string; evidence?: string }>({});

  React.useEffect(() => {
    if (!open) return;
    setQuality(existing?.quality_score ?? 0);
    setProactive(existing?.proactive_score ?? 0);
    setTeamwork(existing?.teamwork_score ?? 0);
    setReason(existing?.reason ?? "");
    setEvidence(existing?.evidence ?? "");
    setErrors({});
  }, [open, existing]);

  const mutation = useMutation({
    mutationFn: (submit: boolean) =>
      saveReview({
        cycleId,
        subjectId,
        reviewerId,
        quality,
        proactive,
        teamwork,
        reason: reason.trim(),
        evidence: evidence.trim(),
        submit,
        existingId: existing?.id,
      }),
    onSuccess: (_data, submit) => {
      void queryClient.invalidateQueries({ queryKey: ["mvp-reviews", cycleId] });
      cenToast.success(submit ? "Đã gửi đánh giá" : "Đã lưu bản nháp");
      onOpenChange(false);
    },
    onError: (error: Error) => cenToast.error("Không lưu được", { description: error.message }),
  });

  const needEvidence =
    requiresEvidence(quality, MVP_CRITERION_MAX.quality) ||
    requiresEvidence(proactive, MVP_CRITERION_MAX.proactive) ||
    requiresEvidence(teamwork, MVP_CRITERION_MAX.teamwork);

  function run(submit: boolean) {
    if (submit) {
      const next: { reason?: string; evidence?: string } = {};
      if (!reason.trim()) next.reason = "Phải nhập lý do đánh giá";
      if (needEvidence && !evidence.trim()) {
        next.evidence = "Mức Tốt hoặc Xuất sắc bắt buộc có bằng chứng";
      }
      setErrors(next);
      if (Object.keys(next).length > 0) return;
    }
    mutation.mutate(submit);
  }

  const locked = existing?.status === "submitted";

  const scales: { id: string; value: number; set: (value: number) => void; max: number; label: string }[] = [
    {
      id: "quality",
      value: quality,
      set: setQuality,
      max: MVP_CRITERION_MAX.quality,
      label: MVP_CRITERION_LABEL.quality,
    },
    {
      id: "proactive",
      value: proactive,
      set: setProactive,
      max: MVP_CRITERION_MAX.proactive,
      label: MVP_CRITERION_LABEL.proactive,
    },
    {
      id: "teamwork",
      value: teamwork,
      set: setTeamwork,
      max: MVP_CRITERION_MAX.teamwork,
      label: MVP_CRITERION_LABEL.teamwork,
    },
  ];

  return (
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Đánh giá thực tế — ${subjectName}`}
      description="Phần đánh giá chiếm 25 trên tổng 100 điểm của kỳ."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {!locked ? (
            <>
              <Button
                variant="secondary"
                onClick={() => run(false)}
                loading={mutation.isPending && mutation.variables === false}
              >
                Lưu nháp
              </Button>
              <Button
                onClick={() => run(true)}
                loading={mutation.isPending && mutation.variables === true}
              >
                Gửi đánh giá
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        {locked ? (
          <p className="text-helper text-text-muted">
            Đánh giá đã gửi nên không thể chỉnh sửa. Cần thay đổi thì đề nghị CMO xử lý.
          </p>
        ) : null}

        {scales.map((scale) => (
          <FormField key={scale.id} id={`review-${scale.id}`} label={`${scale.label} (tối đa ${scale.max})`}>
            {(control) => (
              <Select
                value={String(scale.value)}
                onValueChange={(value) => scale.set(Number(value))}
                disabled={locked}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue placeholder="Chọn mức" />
                </SelectTrigger>
                <SelectContent>
                  {reviewScaleOptions(scale.max).map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ))}

        <FormField id="review-reason" label="Lý do đánh giá" required error={errors.reason}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={reason}
              disabled={locked}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="review-evidence"
          label="Bằng chứng"
          required={needEvidence}
          helperText="Dẫn chứng công việc, báo cáo hoặc kết quả cụ thể."
          error={errors.evidence}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={evidence}
              disabled={locked}
              onChange={(event) => setEvidence(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </DrawerPanel>
  );
}
