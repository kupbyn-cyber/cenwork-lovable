import * as React from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DOCUMENT_VERSION_STATUS_LABEL } from "@/lib/document-catalog";
import { documentStatus, type DocumentRow } from "@/lib/document-data";
import { DOCUMENT_STATUS_TONE, formatDate, scopeText, typeText } from "@/lib/document-view";

/**
 * CEN DOC-02 — Dạng Card cho Thư viện Tài liệu trên mobile.
 * Chỉ trình bày dữ liệu đã lọc; hành động do phía gọi cung cấp.
 */
export interface DocumentCardListProps {
  documents: DocumentRow[];
  onOpen: (doc: DocumentRow) => void;
  renderActions: (doc: DocumentRow) => React.ReactNode;
}

export function DocumentCardList({ documents, onOpen, renderActions }: DocumentCardListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {documents.map((doc) => {
        const status = documentStatus(doc);
        const version = doc.latestVersion;
        return (
          <li
            key={doc.id}
            className="rounded-lg border border-border-subtle bg-surface-default p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(doc)}>
                <p className="break-words text-body font-medium text-text-primary">{doc.name}</p>
                <p className="mt-1 break-words text-caption text-text-muted">
                  {typeText(doc.doc_type)} · {scopeText(doc)}
                </p>
              </button>
              <div onClick={(event) => event.stopPropagation()}>{renderActions(doc)}</div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-secondary">
              <span>{doc.ownerName ?? "—"}</span>
              <span>Hiệu lực: {formatDate(version?.effective_from)}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                label={DOCUMENT_VERSION_STATUS_LABEL[status]}
                tone={DOCUMENT_STATUS_TONE[status]}
                size="sm"
              />
              <Badge variant="outline" className="font-normal">
                {version?.version_label ?? `v${version?.version_no ?? 1}`}
              </Badge>
              {version?.needs_link_review ? (
                <Badge variant="warning" className="font-normal">
                  <AlertTriangle className="size-3" aria-hidden="true" /> Cần kiểm tra
                </Badge>
              ) : null}
              <a
                href={doc.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-caption text-brand-primary underline-offset-2 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="size-3" aria-hidden="true" /> Mở nguồn
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
