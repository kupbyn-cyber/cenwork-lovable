import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * NAP-05 — Tệp đính kèm dùng chung cho Yêu cầu phê duyệt và Thông báo nội bộ.
 * Tệp nằm trong bucket riêng tư `attachments`; quyền thật do Storage Policy và
 * các hàm SECURITY DEFINER quyết định (client chỉ ghi metadata qua RPC).
 * Đường dẫn: approval/{request_id}/{uuid}-{ten-file} • announcement/{announcement_id}/{uuid}-{ten-file}
 */
export const ATTACHMENT_BUCKET = "attachments";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
];

export const ATTACHMENT_ACCEPT_ATTR =
  ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

export interface AttachmentRow {
  id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  removed_at: string | null;
  created_at: string;
  version_no?: number;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function validateAttachmentFile(file: File): string | null {
  if (!ATTACHMENT_ACCEPTED_TYPES.includes(file.type)) {
    return "Định dạng tệp không được phép. Chấp nhận PDF, ảnh, Word, Excel, PowerPoint, TXT, CSV, ZIP.";
  }
  if (file.size <= 0) return "Tệp rỗng.";
  if (file.size > ATTACHMENT_MAX_BYTES) return "Dung lượng tệp tối đa 10 MB.";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Bỏ ký tự có thể phá đường dẫn storage; giữ phần mở rộng. */
function safeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}

function friendlyUploadError(message: string): string {
  return /row-level security|not authorized|permission/i.test(message)
    ? "Bạn không có quyền đính kèm tệp cho nội dung này."
    : `Không tải được tệp lên: ${message}`;
}

async function uploadTo(prefix: string, ownerId: string, file: File): Promise<string> {
  const invalid = validateAttachmentFile(file);
  if (invalid) throw new Error(invalid);
  const path = `${prefix}/${ownerId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(friendlyUploadError(error.message));
  return path;
}

/** Xóa tệp vừa tải lên khi ghi metadata thất bại, tránh để lại tệp rác. */
async function rollbackUpload(path: string) {
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
}

export async function uploadApprovalAttachment(requestId: string, file: File) {
  const path = await uploadTo("approval", requestId, file);
  const { error } = await supabase.rpc("approval_attachment_add", {
    _request: requestId,
    _path: path,
    _name: file.name,
    _size: file.size,
    _mime: file.type,
  });
  if (error) {
    await rollbackUpload(path);
    throw new Error(error.message);
  }
}

export async function removeApprovalAttachment(attachmentId: string) {
  const { error } = await supabase.rpc("approval_attachment_remove", {
    _attachment: attachmentId,
  });
  fail(error);
}

export async function uploadAnnouncementAttachment(announcementId: string, file: File) {
  const path = await uploadTo("announcement", announcementId, file);
  const { error } = await supabase.rpc("announcement_attachment_add", {
    _announcement: announcementId,
    _path: path,
    _name: file.name,
    _size: file.size,
    _mime: file.type,
  });
  if (error) {
    await rollbackUpload(path);
    throw new Error(error.message);
  }
}

export async function removeAnnouncementAttachment(attachmentId: string) {
  const { error } = await supabase.rpc("announcement_attachment_remove", {
    _attachment: attachmentId,
  });
  fail(error);
}

/** URL tải xuống có chữ ký, hết hạn sau 1 giờ. */
export async function createAttachmentUrl(path: string, fileName: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 60, { download: fileName });
  if (error || !data?.signedUrl) {
    throw new Error("Không tạo được liên kết tải tệp. Có thể bạn không còn quyền xem.");
  }
  return data.signedUrl;
}

const COLUMNS = "id,storage_path,file_name,file_size,mime_type,uploaded_by,removed_at,created_at";

export const approvalAttachmentsQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["approval-attachments", requestId],
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase
        .from("approval_attachments")
        .select(`${COLUMNS},version_no`)
        .eq("approval_request_id", requestId)
        .order("created_at", { ascending: true });
      fail(error);
      return (data ?? []) as AttachmentRow[];
    },
  });

export const announcementAttachmentsQuery = (announcementId: string) =>
  queryOptions({
    queryKey: ["announcement-attachments", announcementId],
    queryFn: async (): Promise<AttachmentRow[]> => {
      const { data, error } = await supabase
        .from("announcement_attachments")
        .select(COLUMNS)
        .eq("announcement_id", announcementId)
        .order("created_at", { ascending: true });
      fail(error);
      return (data ?? []) as AttachmentRow[];
    },
  });
