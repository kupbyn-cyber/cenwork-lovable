import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cenToast } from "@/components/ui/toast";
import { ReviewActions } from "@/components/report/review-actions";
import { takeoverReportReview } from "@/lib/report-data";

/**
 * REPORT-FIX-01 — khối xử lý báo cáo tại trang chi tiết.
 * Hiển thị đúng theo quyền xử lý + trạng thái: người duyệt hiện tại thấy hành động
 * Duyệt / Yêu cầu chỉnh sửa; Admin không phải người duyệt chỉ thấy nút Tiếp quản duyệt.
 */
export interface ReportReviewBlockProps {
  kind: "daily" | "weekly";
  reportId: string;
  reviewable: boolean;
  takeover: boolean;
  reviewerName: string | null;
  onReview: (decision: "approved" | "changes_requested", note: string) => Promise<void>;
  invalidateKeys: unknown[][];
}

export function ReportReviewBlock({
  kind,
  reportId,
  reviewable,
  takeover,
  reviewerName,
  onReview,
  invalidateKeys,
}: ReportReviewBlockProps) {
  const queryClient = useQueryClient();
  const [takingOver, setTakingOver] = React.useState(false);

  if (reviewable) {
    return <ReviewActions onReview={onReview} invalidateKeys={invalidateKeys} />;
  }
  if (!takeover) return null;

  async function handleTakeover() {
    setTakingOver(true);
    try {
      await takeoverReportReview(kind, reportId, "Admin tiếp quản duyệt");
      await Promise.all(
        invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      cenToast.success("Bạn đã tiếp quản việc duyệt báo cáo này.");
    } catch (error) {
      cenToast.error(error instanceof Error ? error.message : "Không tiếp quản được báo cáo.");
    } finally {
      setTakingOver(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default p-3">
      <p className="text-label font-semibold text-text-primary">Quyền quản trị</p>
      <p className="text-helper text-text-muted">
        Báo cáo này đang chờ {reviewerName ?? "người duyệt được phân công"} xử lý. Bạn có thể tiếp
        quản việc duyệt; hệ thống lưu lại người tiếp quản và thời điểm.
      </p>
      <Button
        variant="secondary"
        className="self-start"
        disabled={takingOver}
        onClick={() => void handleTakeover()}
      >
        Tiếp quản duyệt
      </Button>
    </div>
  );
}
