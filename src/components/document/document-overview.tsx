import * as React from "react";
import { CalendarClock, CheckCircle2, Clock, Inbox, ShieldQuestion } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DOCUMENT_VERSION_STATUS_LABEL } from "@/lib/document-catalog";
import { documentStatus, type DocumentRow } from "@/lib/document-data";
import {
  DOCUMENT_STATUS_TONE,
  formatDate,
  scopeText,
  typeText,
  type DocumentOverviewMetrics,
} from "@/lib/document-view";

/**
 * CEN DOC-02 — Tổng quan Thư viện Tài liệu.
 * Chỉ số tính từ dữ liệu thật người dùng được phép đọc (RLS DOC-01).
 */
export interface DocumentOverviewProps {
  metrics: DocumentOverviewMetrics | null;
  loading: boolean;
  onOpen: (doc: DocumentRow) => void;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: typeof Clock;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-control border border-border-default bg-surface-subtle text-text-muted"
          aria-hidden="true"
        >
          <Icon className="size-icon-md" />
        </span>
        <div className="min-w-0">
          <p className="text-caption text-text-muted">{label}</p>
          <p className="text-h3 font-semibold text-text-primary">{value}</p>
          {hint ? <p className="mt-1 text-helper text-text-muted">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DocumentOverview({ metrics, loading, onOpen }: DocumentOverviewProps) {
  if (loading || !metrics) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[86px] w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Đang hiệu lực" value={metrics.active} icon={CheckCircle2} />
        <MetricCard label="Sắp hiệu lực" value={metrics.scheduled} icon={CalendarClock} />
        <MetricCard label="Cần kiểm tra" value={metrics.needsReview} icon={Clock} />
        <MetricCard
          label="Chờ tôi duyệt"
          value={metrics.pendingMyApproval ?? "—"}
          hint="Tài liệu đang chờ chính bạn duyệt."
          icon={ShieldQuestion}
        />

      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mới cập nhật</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.recentlyUpdated.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={Inbox}
              title="Chưa có tài liệu"
              description="Tài liệu bạn được phép xem sẽ hiển thị tại đây."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {metrics.recentlyUpdated.map((doc) => {
                const status = documentStatus(doc);
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(doc)}
                      className="flex w-full flex-col gap-1 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="block break-words text-body text-text-primary">
                          {doc.name}
                        </span>
                        <span className="block text-caption text-text-muted">
                          {typeText(doc.doc_type)} · {scopeText(doc)} · Hiệu lực{" "}
                          {formatDate(doc.latestVersion?.effective_from)}
                        </span>
                      </span>
                      <StatusBadge
                        label={DOCUMENT_VERSION_STATUS_LABEL[status]}
                        tone={DOCUMENT_STATUS_TONE[status]}
                        size="sm"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
