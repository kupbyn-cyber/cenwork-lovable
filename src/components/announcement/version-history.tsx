import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { revisionsQuery, versionsQuery } from "@/lib/announcement-interaction";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * CEN 1.0 — M6.2 lịch sử phiên bản và chỉnh sửa nhỏ của một thông báo.
 */
export function VersionHistory({ announcementId }: { announcementId: string }) {
  const versions = useQuery(versionsQuery(announcementId));
  const revisions = useQuery(revisionsQuery(announcementId));

  if (versions.isPending || revisions.isPending) {
    return <Spinner label="Đang tải lịch sử phiên bản" />;
  }

  const versionRows = versions.data ?? [];
  const revisionRows = revisions.data ?? [];

  if (versionRows.length === 0 && revisionRows.length === 0) {
    return <EmptyState title="Chưa có thay đổi nào được ghi nhận" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {versionRows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 flex-col gap-1 rounded-control border border-border-default p-3"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="brand">Phiên bản {row.version}</Badge>
            <span className="text-body-xs text-text-muted">
              {formatHanoiDateTime(row.created_at)}
            </span>
          </div>
          <p className="min-w-0 break-words text-body-sm font-medium text-text-primary">
            {row.title}
          </p>
          {row.change_summary ? (
            <p className="min-w-0 break-words text-body-sm text-text-secondary">
              Tóm tắt thay đổi: {row.change_summary}
            </p>
          ) : null}
          {row.reason ? (
            <p className="min-w-0 break-words text-body-xs text-text-muted">
              Lý do: {row.reason}
            </p>
          ) : null}
        </div>
      ))}

      {revisionRows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 flex-col gap-1 rounded-control border border-border-default border-dashed p-3"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="neutral">Chỉnh sửa nhỏ • v{row.version}</Badge>
            <span className="text-body-xs text-text-muted">
              {formatHanoiDateTime(row.created_at)}
            </span>
          </div>
          <p className="min-w-0 break-words text-body-sm text-text-secondary">
            Lý do: {row.reason}
          </p>
          {row.before_data?.title && row.before_data.title !== row.after_data?.title ? (
            <p className="min-w-0 break-words text-body-xs text-text-muted">
              Tiêu đề cũ: {row.before_data.title}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
