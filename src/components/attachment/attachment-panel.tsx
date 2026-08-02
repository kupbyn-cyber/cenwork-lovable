import * as React from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ATTACHMENT_ACCEPT_ATTR,
  createAttachmentUrl,
  formatFileSize,
  validateAttachmentFile,
  type AttachmentRow,
} from "@/lib/attachment-data";
import { formatHanoiDateTime } from "@/lib/datetime";

/**
 * NAP-05 — Danh sách tệp đính kèm dùng chung (Phê duyệt và Thông báo nội bộ).
 * Chỉ hiển thị; mọi kiểm tra quyền thật nằm ở Storage Policy và RPC phía database.
 */
interface Props {
  attachments: AttachmentRow[];
  /** Người tạo nội dung mới được thêm/gỡ tệp. */
  canManage: boolean;
  /** Phiên bản hiện tại (chỉ dùng cho Phê duyệt) — tệp phiên bản cũ chỉ xem lại. */
  currentVersion?: number;
  uploading?: boolean;
  removingId?: string | null;
  onUpload: (file: File) => void;
  onRemove: (attachmentId: string) => void;
  emptyDescription?: string;
}

export function AttachmentPanel({
  attachments,
  canManage,
  currentVersion,
  uploading,
  removingId,
  onUpload,
  onRemove,
  emptyDescription,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const active = attachments.filter((row) => !row.removed_at);

  async function download(row: AttachmentRow) {
    setDownloading(row.id);
    try {
      const url = await createAttachmentUrl(row.storage_path, row.file_name);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  function pick(file: File | undefined) {
    if (!file) return;
    const invalid = validateAttachmentFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    onUpload(file);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {active.length === 0 ? (
        <EmptyState
          title="Chưa có tệp đính kèm"
          description={emptyDescription ?? "Nội dung này chưa có tệp nào."}
        />
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {active.map((row) => {
            const isOldVersion =
              currentVersion !== undefined &&
              row.version_no !== undefined &&
              row.version_no !== currentVersion;
            return (
              <li
                key={row.id}
                className="flex min-w-0 flex-col gap-2 rounded-control border border-border-default p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Paperclip className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <p className="break-words text-body-sm font-medium text-text-primary">
                      {row.file_name}
                    </p>
                    <p className="text-body-xs text-text-muted">
                      {formatFileSize(row.file_size)} • {formatHanoiDateTime(row.created_at)}
                      {row.version_no !== undefined ? ` • V${row.version_no}` : ""}
                    </p>
                  </div>
                  {isOldVersion ? <Badge variant="neutral">Phiên bản cũ</Badge> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === row.id}
                    onClick={() => void download(row)}
                  >
                    <Download />
                    Tải xuống
                  </Button>
                  {canManage && !isOldVersion ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={removingId === row.id}
                      onClick={() => onRemove(row.id)}
                    >
                      <Trash2 />
                      Gỡ
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={ATTACHMENT_ACCEPT_ATTR}
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip />
            Thêm tệp
          </Button>
          <span className="text-body-xs text-text-muted">
            Tối đa 10 MB • PDF, ảnh, Word, Excel, PowerPoint, TXT, CSV, ZIP
          </span>
        </div>
      ) : null}
    </div>
  );
}
