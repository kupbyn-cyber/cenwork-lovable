import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { mvpComponentsQuery } from "@/lib/mvp-data";
import { MVP_CRITERION_LABEL, MVP_TOTAL_MAX, type MvpCriterion } from "@/lib/mvp-scoring";

/**
 * CEN 1.0 — M6 giải thích minh bạch từng thành phần điểm.
 * Hiển thị công thức và dữ liệu nguồn để người được chấm tự kiểm tra được.
 */
export interface ScorecardDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  userId: string | null;
  userName: string;
  totalScore: number;
}

function formatSource(source: Record<string, unknown>): string {
  const entries = Object.entries(source);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${value === null ? "—" : String(value)}`).join(" · ");
}

export function ScorecardDetail({
  open,
  onOpenChange,
  cycleId,
  userId,
  userName,
  totalScore,
}: ScorecardDetailProps) {
  const components = useQuery({ ...mvpComponentsQuery(cycleId, userId), enabled: open && Boolean(userId) });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Chi tiết điểm — ${userName}`}
      description={`Tổng ${totalScore}/${MVP_TOTAL_MAX} điểm`}
      size="lg"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {components.isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : (components.data ?? []).length === 0 ? (
          <p className="text-body text-text-muted">Kỳ này chưa được tính điểm.</p>
        ) : (
          (components.data ?? []).map((component) => (
            <div
              key={component.id}
              className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-label font-medium text-text-primary">
                  {MVP_CRITERION_LABEL[component.criterion as MvpCriterion] ?? component.criterion}
                </span>
                <Badge variant={component.is_applicable ? "info" : "neutral"} size="sm">
                  {component.earned_points}/{component.max_points}
                </Badge>
              </div>
              <p className="mt-1 text-helper text-text-muted">{component.formula ?? "—"}</p>
              <p className="mt-1 text-caption text-text-muted">
                Dữ liệu: {formatSource(component.source_data)}
              </p>
              {!component.is_applicable ? (
                <p className="mt-1 text-caption text-state-warning">
                  Không áp dụng: {component.not_applicable_reason}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
