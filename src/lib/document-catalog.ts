/**
 * CEN DOC-01 — Danh mục tập trung cho module Tài liệu.
 * Nguồn duy nhất cho UI (DOC-02+) và mọi nơi cần nhãn hiển thị.
 * Giá trị phải khớp enum trong database: document_type, document_source,
 * document_scope, document_version_status.
 */
import type { Database } from "@/integrations/supabase/types";

export type DocumentType = Database["public"]["Enums"]["document_type"];
export type DocumentSource = Database["public"]["Enums"]["document_source"];
export type DocumentScope = Database["public"]["Enums"]["document_scope"];
export type DocumentVersionStatus = Database["public"]["Enums"]["document_version_status"];

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "regulation", label: "Quy định" },
  { value: "process", label: "Quy trình" },
  { value: "guide", label: "Hướng dẫn" },
  { value: "form", label: "Mẫu biểu" },
  { value: "plan", label: "Kế hoạch" },
  { value: "report", label: "Báo cáo" },
  { value: "training", label: "Tài liệu đào tạo" },
  { value: "reference", label: "Tài liệu tham khảo" },
  { value: "other", label: "Khác" },
];

export const DOCUMENT_SOURCE_OPTIONS: { value: DocumentSource; label: string }[] = [
  { value: "google_docs", label: "Google Docs" },
  { value: "google_sheets", label: "Google Sheets" },
  { value: "google_slides", label: "Google Slides" },
  { value: "google_drive", label: "Google Drive" },
  { value: "canva", label: "Canva" },
  { value: "notion", label: "Notion" },
  { value: "website", label: "Website" },
  { value: "other", label: "Nguồn khác" },
];

export const DOCUMENT_SCOPE_OPTIONS: { value: DocumentScope; label: string }[] = [
  { value: "system", label: "Toàn hệ thống" },
  { value: "team", label: "Team" },
  { value: "project", label: "Dự án" },
];

export const DOCUMENT_VERSION_STATUS_OPTIONS: {
  value: DocumentVersionStatus;
  label: string;
}[] = [
  { value: "draft", label: "Nháp" },
  { value: "pending_approval", label: "Chờ duyệt" },
  { value: "scheduled", label: "Đã lên lịch" },
  { value: "active", label: "Đang hiệu lực" },
  { value: "expired", label: "Hết hiệu lực" },
  { value: "archived", label: "Đã lưu trữ" },
];

function toLabelMap<T extends string>(options: { value: T; label: string }[]) {
  return Object.fromEntries(options.map((o) => [o.value, o.label])) as Record<T, string>;
}

export const DOCUMENT_TYPE_LABEL = toLabelMap(DOCUMENT_TYPE_OPTIONS);
export const DOCUMENT_SOURCE_LABEL = toLabelMap(DOCUMENT_SOURCE_OPTIONS);
export const DOCUMENT_SCOPE_LABEL = toLabelMap(DOCUMENT_SCOPE_OPTIONS);
export const DOCUMENT_VERSION_STATUS_LABEL = toLabelMap(DOCUMENT_VERSION_STATUS_OPTIONS);

/** Trạng thái phiên bản mà mọi tài khoản đang hoạt động được xem (khớp RLS). */
export const DOCUMENT_PUBLIC_STATUSES: DocumentVersionStatus[] = [
  "scheduled",
  "active",
  "expired",
  "archived",
];

/** Chuẩn hóa tên nội dung giống hàm doc_normalize_name trong database. */
export function normalizeDocumentName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** URL hợp lệ khi là http/https. */
export function isValidDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * DOC-03A — Nhận diện loại nguồn từ URL.
 * Không phân biệt hoa/thường, bỏ qua query parameters.
 * Trả về null khi URL không hợp lệ.
 */
export function detectDocumentSource(value: string): DocumentSource | null {
  const raw = value.trim();
  if (!isValidDocumentUrl(raw)) return null;

  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();

  if (host === "docs.google.com") {
    if (path.startsWith("/document")) return "google_docs";
    if (path.startsWith("/spreadsheets")) return "google_sheets";
    if (path.startsWith("/presentation")) return "google_slides";
    return "google_drive";
  }
  if (host === "sheets.google.com") return "google_sheets";
  if (host === "slides.google.com") return "google_slides";
  if (host === "drive.google.com") return "google_drive";
  if (host === "canva.com" || host.endsWith(".canva.com")) return "canva";
  if (
    host === "notion.so" ||
    host.endsWith(".notion.so") ||
    host === "notion.site" ||
    host.endsWith(".notion.site")
  ) {
    return "notion";
  }
  return "website";
}

