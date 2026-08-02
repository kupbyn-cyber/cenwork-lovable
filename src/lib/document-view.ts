/**
 * CEN DOC-02 — Lọc, tìm kiếm, sắp xếp và chỉ số tổng quan cho Thư viện Tài liệu.
 * Thuần tính toán trên dữ liệu đã qua RLS; không gọi API.
 */
import {
  DOCUMENT_SCOPE_LABEL,
  DOCUMENT_TYPE_LABEL,
  type DocumentScope,
  type DocumentSource,
  type DocumentType,
  type DocumentVersionStatus,
} from "@/lib/document-catalog";
import { documentStatus, type DocumentAccessContext, type DocumentRow } from "@/lib/document-data";
import type { StatusTone } from "@/components/ui/status-badge";

export const ALL = "__all__";

export const DOCUMENT_STATUS_TONE: Record<DocumentVersionStatus, StatusTone> = {
  draft: "neutral",
  pending_approval: "progress",
  scheduled: "progress",
  active: "success",
  expired: "warning",
  archived: "neutral",
};

export type DocumentViewKey =
  | "overview"
  | "all"
  | "active"
  | "team"
  | "project"
  | "form"
  | "mine"
  | "archived";

export const DOCUMENT_VIEWS: { key: DocumentViewKey; label: string }[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "all", label: "Tất cả tài liệu" },
  { key: "active", label: "Đang hiệu lực" },
  { key: "team", label: "Theo Team" },
  { key: "project", label: "Theo Dự án" },
  { key: "form", label: "Mẫu biểu" },
  { key: "mine", label: "Của tôi" },
  { key: "archived", label: "Đã lưu trữ" },
];

export type DocumentSortKey =
  | "updated_desc"
  | "updated_asc"
  | "name_asc"
  | "effective_desc"
  | "version_desc";

export const DOCUMENT_SORT_OPTIONS: { value: DocumentSortKey; label: string }[] = [
  { value: "updated_desc", label: "Mới cập nhật" },
  { value: "updated_asc", label: "Cũ nhất" },
  { value: "name_asc", label: "Tên A–Z" },
  { value: "effective_desc", label: "Ngày hiệu lực gần nhất" },
  { value: "version_desc", label: "Phiên bản mới nhất" },
];

export interface DocumentFilterState {
  search: string;
  docType: string;
  scope: string;
  teamId: string;
  projectId: string;
  status: string;
  source: string;
  ownerId: string;
  creatorId: string;
  effectiveFrom: string;
  effectiveTo: string;
  needsReview: boolean;
  includeArchived: boolean;
}

export const EMPTY_DOCUMENT_FILTERS: DocumentFilterState = {
  search: "",
  docType: ALL,
  scope: ALL,
  teamId: ALL,
  projectId: ALL,
  status: ALL,
  source: ALL,
  ownerId: ALL,
  creatorId: ALL,
  effectiveFrom: "",
  effectiveTo: "",
  needsReview: false,
  includeArchived: false,
};

export function hasActiveDocumentFilters(filters: DocumentFilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.docType !== ALL ||
    filters.scope !== ALL ||
    filters.teamId !== ALL ||
    filters.projectId !== ALL ||
    filters.status !== ALL ||
    filters.source !== ALL ||
    filters.ownerId !== ALL ||
    filters.creatorId !== ALL ||
    filters.effectiveFrom !== "" ||
    filters.effectiveTo !== "" ||
    filters.needsReview ||
    filters.includeArchived
  );
}

function matchSearch(doc: DocumentRow, term: string): boolean {
  const haystack = [
    doc.name,
    doc.display_name,
    doc.code,
    doc.description ?? "",
    doc.keywords.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

export function filterDocuments(
  docs: DocumentRow[],
  filters: DocumentFilterState,
  view: DocumentViewKey,
  ctx: DocumentAccessContext,
): DocumentRow[] {
  const term = filters.search.trim().toLowerCase();
  return docs.filter((doc) => {
    const status = documentStatus(doc);
    const archived = Boolean(doc.archived_at) || status === "archived";

    // Chế độ xem
    if (view === "active" && status !== "active") return false;
    if (view === "team" && doc.scope !== "team") return false;
    if (view === "project" && doc.scope !== "project") return false;
    if (view === "form" && doc.doc_type !== "form") return false;
    if (view === "mine" && doc.created_by !== ctx.userId && doc.owner_id !== ctx.userId)
      return false;
    if (view === "archived" && !archived) return false;
    // Mặc định không hiển thị tài liệu lưu trữ.
    if (view !== "archived" && archived && !filters.includeArchived) return false;

    if (term && !matchSearch(doc, term)) return false;
    if (filters.docType !== ALL && doc.doc_type !== filters.docType) return false;
    if (filters.scope !== ALL && doc.scope !== filters.scope) return false;
    if (filters.teamId !== ALL && doc.team_id !== filters.teamId) return false;
    if (filters.projectId !== ALL && doc.project_id !== filters.projectId) return false;
    if (filters.status !== ALL && status !== filters.status) return false;
    if (filters.source !== ALL && doc.source_type !== filters.source) return false;
    if (filters.ownerId !== ALL && doc.owner_id !== filters.ownerId) return false;
    if (filters.creatorId !== ALL && doc.created_by !== filters.creatorId) return false;
    if (filters.needsReview && !doc.latestVersion?.needs_link_review) return false;

    const effective = doc.activeVersion?.effective_from ?? doc.latestVersion?.effective_from ?? "";
    if (filters.effectiveFrom && (!effective || effective < filters.effectiveFrom)) return false;
    if (filters.effectiveTo && (!effective || effective > filters.effectiveTo)) return false;

    return true;
  });
}

function effectiveDate(doc: DocumentRow): string {
  return doc.activeVersion?.effective_from ?? doc.latestVersion?.effective_from ?? "";
}

export function sortDocuments(docs: DocumentRow[], sort: DocumentSortKey): DocumentRow[] {
  const rows = [...docs];
  switch (sort) {
    case "updated_asc":
      return rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    case "name_asc":
      return rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    case "effective_desc":
      return rows.sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)));
    case "version_desc":
      return rows.sort(
        (a, b) => (b.latestVersion?.version_no ?? 0) - (a.latestVersion?.version_no ?? 0),
      );
    default:
      // Mặc định: ưu tiên tài liệu đang hiệu lực, sau đó mới cập nhật gần nhất.
      return rows.sort((a, b) => {
        const activeA = documentStatus(a) === "active" ? 0 : 1;
        const activeB = documentStatus(b) === "active" ? 0 : 1;
        if (activeA !== activeB) return activeA - activeB;
        return b.updated_at.localeCompare(a.updated_at);
      });
  }
}

/* ================= Tổng quan ================= */

export interface DocumentOverviewMetrics {
  active: number;
  scheduled: number;
  needsReview: number;
  pendingMyApproval: number | null;
  recentlyUpdated: DocumentRow[];
}

export function buildOverviewMetrics(
  docs: DocumentRow[],
  ctx: DocumentAccessContext,
): DocumentOverviewMetrics {
  const visible = docs.filter((doc) => !doc.archived_at);
  return {
    active: visible.filter((doc) => documentStatus(doc) === "active").length,
    scheduled: visible.filter((doc) => documentStatus(doc) === "scheduled").length,
    needsReview: visible.filter((doc) => doc.latestVersion?.needs_link_review).length,
    // DOC-04: đếm đúng số tài liệu đang chờ chính người dùng duyệt.
    pendingMyApproval: ctx.userId
      ? visible.filter((doc) => {
          const v = doc.latestVersion;
          if (!v || v.status !== "pending_approval") return false;
          return v.approver_id === ctx.userId || v.alt_approver_id === ctx.userId;
        }).length
      : null,
    recentlyUpdated: [...visible]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5),
  };
}


export function scopeText(doc: DocumentRow): string {
  if (doc.scope === "system") return DOCUMENT_SCOPE_LABEL.system;
  if (doc.scope === "team") return doc.teamName ?? DOCUMENT_SCOPE_LABEL.team;
  return doc.projectName ?? DOCUMENT_SCOPE_LABEL.project;
}

export function typeText(type: DocumentType): string {
  return DOCUMENT_TYPE_LABEL[type];
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type { DocumentScope, DocumentSource };
