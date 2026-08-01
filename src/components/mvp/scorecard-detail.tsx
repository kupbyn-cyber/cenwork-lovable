import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatHanoiDateTime } from "@/lib/datetime";
import { mvpComponentsQuery, type MvpComponentRow } from "@/lib/mvp-data";
import {
  MVP_ANNOUNCEMENT_BUCKET_LABEL,
  MVP_CRITERION_LABEL,
  MVP_TOTAL_MAX,
  type MvpAnnouncementBucket,
  type MvpAnnouncementEvaluation,
  type MvpCriterion,
} from "@/lib/mvp-scoring";

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

/** Các khóa dữ liệu dạng danh sách được hiển thị riêng, không nhồi vào dòng tóm tắt. */
const VERBOSE_SOURCE_KEYS = new Set(["items", "countedIds", "excludedIds"]);

function formatSource(source: Record<string, unknown>): string {
  const entries = Object.entries(source).filter(([key]) => !VERBOSE_SOURCE_KEYS.has(key));
  if (entries.length === 0) return "—";
  return entries
    .map(([key, value]) => `${key}: ${value === null ? "—" : String(value)}`)
    .join(" · ");
}

function announcementItems(source: Record<string, unknown>): MvpAnnouncementEvaluation[] {
  const items = source["items"];
  return Array.isArray(items) ? (items as MvpAnnouncementEvaluation[]) : [];
}

/** Danh sách từng thông báo được tính: hạn, thời điểm xác nhận, hệ số, lý do loại. */
function AnnouncementBreakdown({ items }: { items: MvpAnnouncementEvaluation[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return (
      <p className="mt-2 text-caption text-text-muted">
        Không có thông báo bắt buộc xác nhận nào trong kỳ.
      </p>
    );
  }
  return (
    <div className="mt-2 min-w-0">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? "Ẩn danh sách thông báo" : `Xem ${items.length} thông báo`}
      </Button>
      {open ? (
        <ul className="mt-2 flex min-w-0 flex-col gap-2">
          {items.map((item) => (
            <li
              key={`${item.announcementId}-${item.dueAt ?? ""}`}
              className="min-w-0 rounded-md border border-border-subtle bg-background-base p-2"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-caption font-medium text-text-primary">
                  {item.title || "Thông báo"}
                </span>
                <Badge variant={item.excluded ? "neutral" : "info"} size="sm">
                  {item.excluded
                    ? MVP_ANNOUNCEMENT_BUCKET_LABEL.excluded
                    : `${MVP_ANNOUNCEMENT_BUCKET_LABEL[item.bucket as MvpAnnouncementBucket]} · hệ số ${item.coefficient}`}
                </Badge>
              </div>
              <p className="mt-1 break-words text-caption text-text-muted">
                Hạn: {formatHanoiDateTime(item.dueAt)} · Xác nhận:{" "}
                {item.acknowledgedAt ? formatHanoiDateTime(item.acknowledgedAt) : "Chưa xác nhận"}
                {item.lateHours !== null && item.lateHours > 0 ? ` · Trễ ${item.lateHours} giờ` : ""}
              </p>
              {item.excluded ? (
                <p className="mt-1 break-words text-caption text-state-warning">
                  Loại khỏi mẫu số: {item.excludeReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ComponentCard({ component }: { component: MvpComponentRow }) {
  const isAnnouncement = component.criterion === "announcement";
  return (
    <div className="min-w-0 rounded-md border border-border-default bg-background-elevated p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-label font-medium text-text-primary">
          {MVP_CRITERION_LABEL[component.criterion as MvpCriterion] ?? component.criterion}
        </span>
        <Badge variant={component.is_applicable ? "info" : "neutral"} size="sm">
          {component.earned_points}/{component.max_points}
        </Badge>
      </div>
      <p className="mt-1 break-words text-helper text-text-muted">{component.formula ?? "—"}</p>
      <p className="mt-1 break-words text-caption text-text-muted">
        Dữ liệu: {formatSource(component.source_data)}
      </p>
      {!component.is_applicable ? (
        <p className="mt-1 break-words text-caption text-state-warning">
          Không áp dụng: {component.not_applicable_reason}
          {isAnnouncement ? " — điểm được phân bổ lại cho chỉ số còn lại trong nhóm Kỷ luật." : ""}
        </p>
      ) : null}
      {isAnnouncement ? (
        <AnnouncementBreakdown items={announcementItems(component.source_data)} />
      ) : null}
    </div>
  );
}

export function ScorecardDetail({
  open,
  onOpenChange,
  cycleId,
  userId,
  userName,
  totalScore,
}: ScorecardDetailProps) {
  const components = useQuery({
    ...mvpComponentsQuery(cycleId, userId),
    enabled: open && Boolean(userId),
  });

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
        ) : components.isError ? (
          <ErrorState
            description="Không tải được chi tiết điểm."
            onRetry={() => void components.refetch()}
          />
        ) : (components.data ?? []).length === 0 ? (
          <p className="text-body text-text-muted">Kỳ này chưa được tính điểm.</p>
        ) : (
          (components.data ?? []).map((component) => (
            <ComponentCard key={component.id} component={component} />
          ))
        )}
      </div>
    </Modal>
  );
}
