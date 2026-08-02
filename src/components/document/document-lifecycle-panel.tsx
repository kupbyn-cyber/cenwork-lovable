import * as React from "react";
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canArchiveDocument,
  canReportLink,
  canResolveLink,
  canRestoreDocument,
  isArchivedDocument,
  needsLinkReview,
  restoreBlockReason,
  type DocumentAccessContext,
  type DocumentRow,
} from "@/lib/document-data";
import { formatDateTime } from "@/lib/document-view";

/**
 * CEN DOC-06 — Kiểm soát tài liệu sau phát hành.
 * Báo link lỗi, xác nhận đã xử lý, lưu trữ và khôi phục.
 * Nút chỉ hiển thị khi có quyền; sai điều kiện thì disable kèm giải thích.
 */
export type LifecyclePending = "report" | "resolve" | "archive" | "restore" | null;

export interface DocumentLifecyclePanelProps {
  document: DocumentRow;
  ctx: DocumentAccessContext;
  pending: LifecyclePending;
  onReport: (note: string) => void;
  onResolve: (note: string, newUrl: string | null) => void;
  onArchive: (reason: string) => void;
  onRestore: (reason: string) => void;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-text-muted">{label}</p>
      <div className="mt-0.5 break-words text-body text-text-primary">{children}</div>
    </div>
  );
}

export function DocumentLifecyclePanel({
  document: doc,
  ctx,
  pending,
  onReport,
  onResolve,
  onArchive,
  onRestore,
}: DocumentLifecyclePanelProps) {
  const version = doc.latestVersion;
  const [mode, setMode] = React.useState<Exclude<LifecyclePending, null> | null>(null);
  const [note, setNote] = React.useState("");
  const [url, setUrl] = React.useState("");

  const flagged = needsLinkReview(doc);
  const archived = isArchivedDocument(doc);
  const reportable = canReportLink(doc, ctx);
  const resolvable = canResolveLink(doc, ctx);
  const archivable = canArchiveDocument(doc, ctx);
  const restorable = canRestoreDocument(doc, ctx);
  const privileged = ctx.role === "admin" || ctx.role === "cmo";
  const restoreBlocked = restorable ? restoreBlockReason(doc) : null;

  const busy = pending !== null;

  const openMode = (next: Exclude<LifecyclePending, null>) => {
    setMode(next);
    setNote("");
    setUrl(next === "resolve" ? (version?.source_url ?? "") : "");
  };

  const closeMode = () => {
    setMode(null);
    setNote("");
    setUrl("");
  };

  React.useEffect(() => {
    if (!busy) return;
    // Đóng form khi thao tác đã gửi đi để tránh double-submit.
  }, [busy]);

  const reasonRequired = mode === "archive" || mode === "restore";
  const canSubmitForm = !reasonRequired || note.trim().length > 0;

  const submitForm = () => {
    if (!mode || busy || !canSubmitForm) return;
    if (mode === "report") onReport(note);
    if (mode === "resolve") onResolve(note, url.trim() ? url.trim() : null);
    if (mode === "archive") onArchive(note);
    if (mode === "restore") onRestore(note);
    closeMode();
  };

  if (!version) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Kiểm soát sau phát hành</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {flagged ? (
            <StatusBadge label="Cần kiểm tra" tone="warning" size="sm" />
          ) : null}
          {archived ? <StatusBadge label="Đã lưu trữ" tone="neutral" size="sm" /> : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {flagged || version.link_resolved_at || archived || doc.restored_at ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {version.link_reported_at ? (
              <Info label="Người báo link lỗi">
                {doc.linkReporterName ?? "—"} — {formatDateTime(version.link_reported_at)}
              </Info>
            ) : null}
            {version.link_review_note ? (
              <Info label="Ghi chú cảnh báo">{version.link_review_note}</Info>
            ) : null}
            {version.link_resolved_at ? (
              <Info label="Đã xử lý bởi">
                {doc.linkResolverName ?? "—"} — {formatDateTime(version.link_resolved_at)}
              </Info>
            ) : null}
            {archived && (version.archived_at ?? doc.archived_at) ? (
              <Info label="Lưu trữ bởi">
                {doc.archivedByName ?? "—"} —{" "}
                {formatDateTime(version.archived_at ?? doc.archived_at)}
              </Info>
            ) : null}
            {archived && (version.archive_reason ?? doc.archive_reason) ? (
              <Info label="Lý do lưu trữ">{version.archive_reason ?? doc.archive_reason}</Info>
            ) : null}
            {!archived && doc.restored_at ? (
              <Info label="Khôi phục bởi">
                {doc.restoredByName ?? "—"} — {formatDateTime(doc.restored_at)}
              </Info>
            ) : null}
            {!archived && doc.restore_reason ? (
              <Info label="Lý do khôi phục">{doc.restore_reason}</Info>
            ) : null}
          </div>
        ) : (
          <p className="text-caption text-text-muted">
            Tài liệu chưa có cảnh báo đường dẫn và chưa từng được lưu trữ.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {reportable ? (
            <Button
              variant="secondary"
              disabled={busy}
              loading={pending === "report"}
              onClick={() => openMode("report")}
            >
              <Flag className="size-icon-sm" aria-hidden="true" /> Báo link lỗi
            </Button>
          ) : flagged && ctx.userId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="secondary" disabled>
                    <AlertTriangle className="size-icon-sm" aria-hidden="true" /> Đang chờ kiểm tra
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Tài liệu đã được báo link lỗi và đang chờ người phụ trách xử lý.
              </TooltipContent>
            </Tooltip>
          ) : null}

          {resolvable ? (
            <Button
              disabled={busy}
              loading={pending === "resolve"}
              onClick={() => openMode("resolve")}
            >
              <CheckCircle2 className="size-icon-sm" aria-hidden="true" /> Xác nhận đã xử lý
            </Button>
          ) : null}

          {privileged ? (
            archived ? (
              restoreBlocked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="secondary" disabled>
                        <ArchiveRestore className="size-icon-sm" aria-hidden="true" /> Khôi phục
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{restoreBlocked}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={pending === "restore"}
                  onClick={() => openMode("restore")}
                >
                  <ArchiveRestore className="size-icon-sm" aria-hidden="true" /> Khôi phục
                </Button>
              )
            ) : archivable ? (
              <Button
                variant="secondary"
                disabled={busy}
                loading={pending === "archive"}
                onClick={() => openMode("archive")}
              >
                <Archive className="size-icon-sm" aria-hidden="true" /> Lưu trữ
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="secondary" disabled>
                      <Archive className="size-icon-sm" aria-hidden="true" /> Lưu trữ
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Chỉ lưu trữ được tài liệu đã được duyệt.</TooltipContent>
              </Tooltip>
            )
          ) : null}
        </div>

        {mode ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-muted p-3">
            {mode === "resolve" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="doc-link-url">Đường dẫn tài liệu</Label>
                <Input
                  id="doc-link-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://..."
                />
                <p className="text-caption text-text-muted">
                  Chỉ sửa được khi vẫn trỏ tới đúng tài liệu chính thức. Nếu là nội dung khác, hãy
                  tạo phiên bản mới.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-lifecycle-note">
                {mode === "report"
                  ? "Mô tả lỗi (không bắt buộc)"
                  : mode === "resolve"
                    ? "Ghi chú xử lý (không bắt buộc)"
                    : mode === "archive"
                      ? "Lý do lưu trữ (bắt buộc)"
                      : "Lý do khôi phục (bắt buộc)"}
              </Label>
              <Textarea
                id="doc-lifecycle-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  mode === "report" ? "Ví dụ: link báo lỗi 404 khi mở." : "Nhập nội dung..."
                }
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !canSubmitForm} loading={busy} onClick={submitForm}>
                Xác nhận
              </Button>
              <Button variant="ghost" disabled={busy} onClick={closeMode}>
                Hủy
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
