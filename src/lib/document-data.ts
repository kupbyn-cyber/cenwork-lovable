/**
 * CEN DOC-02/03 — Data layer cho Thư viện Tài liệu.
 * Chỉ đọc/ghi qua RLS DOC-01 (documents, document_versions).
 * Mọi hàm quyền ở đây chỉ mirror RLS để ẩn/disable UI; database vẫn là chốt cuối.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  DocumentScope,
  DocumentSource,
  DocumentType,
  DocumentVersionStatus,
} from "@/lib/document-catalog";
import type { AppRoleKey } from "@/lib/permissions";

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_no: number;
  version_label: string | null;
  status: DocumentVersionStatus;
  source_type: DocumentSource;
  source_url: string;
  effective_from: string;
  effective_to: string | null;
  change_note: string | null;
  needs_link_review: boolean;
  ever_submitted: boolean;
  submitted_by: string | null;
  submitted_at: string | null;
  withdrawn_at: string | null;
  approver_id: string | null;
  alt_approver_id: string | null;
  approver_assigned_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  self_approved: boolean;
  self_approval_reason: string | null;
  /** DOC-06 — kiểm soát sau phát hành. */
  link_review_note: string | null;
  link_reported_by: string | null;
  link_reported_at: string | null;
  link_resolved_by: string | null;
  link_resolved_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
  restore_reason: string | null;
  status_before_archive: DocumentVersionStatus | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  code: string;
  name: string;
  display_name: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  team_id: string | null;
  project_id: string | null;
  description: string | null;
  source_type: DocumentSource;
  source_url: string;
  keywords: string[];
  created_by: string;
  owner_id: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
  restore_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Phiên bản mới nhất (theo version_no) mà người dùng đọc được. */
  latestVersion: DocumentVersionRow | null;
  /** Phiên bản đang hiệu lực nếu có. */
  activeVersion: DocumentVersionRow | null;
  ownerName: string | null;
  creatorName: string | null;
  teamName: string | null;
  projectName: string | null;
  /** Tên người liên quan tới luồng duyệt của phiên bản mới nhất. */
  approverName: string | null;
  submitterName: string | null;
  approvedByName: string | null;
  rejectedByName: string | null;
  /** DOC-06 — tên người báo/xử lý link và người lưu trữ. */
  linkReporterName: string | null;
  linkResolverName: string | null;
  archivedByName: string | null;
  restoredByName: string | null;
}

const DOCUMENT_COLUMNS =
  "id,code,name,display_name,doc_type,scope,team_id,project_id,description,source_type,source_url,keywords,created_by,owner_id,archived_at,archived_by,archive_reason,restored_at,restored_by,restore_reason,created_at,updated_at";

const VERSION_COLUMNS =
  "id,document_id,version_no,version_label,status,source_type,source_url,effective_from,effective_to,change_note,needs_link_review,ever_submitted,submitted_by,submitted_at,withdrawn_at,approver_id,alt_approver_id,approver_assigned_at,approved_by,approved_at,rejected_by,rejected_at,reject_reason,self_approved,self_approval_reason,link_review_note,link_reported_by,link_reported_at,link_resolved_by,link_resolved_at,archived_at,archived_by,archive_reason,restored_at,restored_by,restore_reason,status_before_archive,created_at,updated_at";


function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

async function decorate(rows: Record<string, unknown>[]): Promise<DocumentRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r["id"] as string);
  const versions = unwrap(
    await supabase
      .from("document_versions")
      .select(VERSION_COLUMNS)
      .in("document_id", ids)
      .order("version_no", { ascending: false }),
  ) as DocumentVersionRow[];

  const personIds = Array.from(
    new Set(
      [
        ...rows.flatMap((r) => [r["owner_id"] as string, r["created_by"] as string]),
        ...versions.flatMap((v) => [
          v.submitted_by,
          v.approver_id,
          v.alt_approver_id,
          v.approved_by,
          v.rejected_by,
          v.link_reported_by,
          v.link_resolved_by,
          v.archived_by,
          v.restored_by,
        ]),
      ].filter(Boolean) as string[],
    ),
  );

  const teamIds = Array.from(
    new Set(rows.map((r) => r["team_id"] as string | null).filter(Boolean) as string[]),
  );
  const projectIds = Array.from(
    new Set(rows.map((r) => r["project_id"] as string | null).filter(Boolean) as string[]),
  );

  const [people, teams, projects] = await Promise.all([
    personIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", personIds)
      : Promise.resolve({ data: [], error: null }),
    teamIds.length
      ? supabase.from("teams").select("id,name").in("id", teamIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from("projects").select("id,name").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const nameById = new Map(
    ((people.data ?? []) as { id: string; display_name: string }[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  );
  const teamById = new Map(
    ((teams.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const projectById = new Map(
    ((projects.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
  );

  return rows.map((row) => {
    const id = row["id"] as string;
    const mine = versions.filter((v) => v.document_id === id);
    const latest = mine[0] ?? null;
    const nameOf = (value: string | null | undefined) =>
      value ? (nameById.get(value) ?? null) : null;
    return {
      ...(row as unknown as Omit<
        DocumentRow,
        "latestVersion" | "activeVersion" | "ownerName" | "creatorName" | "teamName" | "projectName"
      >),
      keywords: (row["keywords"] as string[] | null) ?? [],
      latestVersion: latest,
      activeVersion: mine.find((v) => v.status === "active") ?? null,
      ownerName: nameById.get(row["owner_id"] as string) ?? null,
      creatorName: nameById.get(row["created_by"] as string) ?? null,
      teamName: row["team_id"] ? (teamById.get(row["team_id"] as string) ?? null) : null,
      projectName: row["project_id"]
        ? (projectById.get(row["project_id"] as string) ?? null)
        : null,
      approverName: nameOf(latest?.alt_approver_id ?? latest?.approver_id),
      submitterName: nameOf(latest?.submitted_by),
      approvedByName: nameOf(latest?.approved_by),
      rejectedByName: nameOf(latest?.rejected_by),
    } as DocumentRow;
  });

}

export async function fetchDocuments(): Promise<DocumentRow[]> {
  const rows = unwrap(
    await supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
  ) as Record<string, unknown>[];
  return decorate(rows);
}

export async function fetchDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [row] = await decorate([data as unknown as Record<string, unknown>]);
  return row ?? null;
}

export const documentsQuery = () =>
  queryOptions({ queryKey: ["documents"], queryFn: fetchDocuments });

export const documentQuery = (id: string) =>
  queryOptions({ queryKey: ["document", id], queryFn: () => fetchDocument(id) });

/* ================= Phạm vi được phép tạo ================= */

export interface DocumentScopeAccess {
  teamIds: string[];
  projectIds: string[];
}

/** Team và Dự án người dùng được chọn khi tạo tài liệu (mirror can_create_document). */
export async function fetchMyScopeAccess(userId: string): Promise<DocumentScopeAccess> {
  const [profile, collaborators, leaderTeams, ownProjects, memberProjects] = await Promise.all([
    supabase.from("profiles").select("primary_team_id").eq("id", userId).maybeSingle(),
    supabase.from("team_collaborators").select("team_id").eq("user_id", userId),
    supabase.from("teams").select("id").eq("leader_id", userId),
    supabase.from("projects").select("id,owner_id,created_by").is("deleted_at", null),
    supabase.from("project_members").select("project_id").eq("user_id", userId),
  ]);

  const teamIds = new Set<string>();
  const primary = (profile.data as { primary_team_id: string | null } | null)?.primary_team_id;
  if (primary) teamIds.add(primary);
  for (const row of (collaborators.data ?? []) as { team_id: string }[]) teamIds.add(row.team_id);
  for (const row of (leaderTeams.data ?? []) as { id: string }[]) teamIds.add(row.id);

  const projectIds = new Set<string>();
  for (const row of (ownProjects.data ?? []) as {
    id: string;
    owner_id: string | null;
    created_by: string | null;
  }[]) {
    if (row.owner_id === userId || row.created_by === userId) projectIds.add(row.id);
  }
  for (const row of (memberProjects.data ?? []) as { project_id: string }[]) {
    projectIds.add(row.project_id);
  }
  if (teamIds.size > 0) {
    const { data } = await supabase
      .from("project_teams")
      .select("project_id,team_id")
      .in("team_id", Array.from(teamIds));
    for (const row of (data ?? []) as { project_id: string }[]) projectIds.add(row.project_id);
  }

  return { teamIds: Array.from(teamIds), projectIds: Array.from(projectIds) };
}

export const myScopeAccessQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["document-scope-access", userId],
    queryFn: () => fetchMyScopeAccess(userId!),
    enabled: Boolean(userId),
  });

/* ================= Quyền (mirror RLS) ================= */

export interface DocumentAccessContext {
  userId: string | null;
  role: AppRoleKey | null;
  leaderTeamId: string | null;
  /** Dự án người dùng quản lý/tham gia — dùng cho phạm vi project. */
  manageableProjectIds?: string[];
}

const privileged = (ctx: DocumentAccessContext) => ctx.role === "admin" || ctx.role === "cmo";

export function canManageDocument(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  if (!ctx.userId) return false;
  if (privileged(ctx)) return true;
  if (doc.created_by === ctx.userId || doc.owner_id === ctx.userId) return true;
  if (doc.scope === "team" && doc.team_id && doc.team_id === ctx.leaderTeamId) return true;
  if (
    doc.scope === "project" &&
    doc.project_id &&
    ctx.role === "leader" &&
    (ctx.manageableProjectIds ?? []).includes(doc.project_id)
  ) {
    return true;
  }
  return false;
}

/** Chỉ được xóa khi tài liệu chỉ có bản nháp chưa từng gửi duyệt. */
export function canDeleteDocument(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  if (!canManageDocument(doc, ctx)) return false;
  const v = doc.latestVersion;
  return Boolean(v && v.status === "draft" && !v.ever_submitted);
}

export function isDraftDocument(doc: DocumentRow): boolean {
  return doc.latestVersion?.status === "draft";
}

export function documentStatus(doc: DocumentRow): DocumentVersionStatus {
  if (doc.archived_at) return "archived";
  return doc.activeVersion?.status ?? doc.latestVersion?.status ?? "draft";
}

/* ================= Ghi dữ liệu ================= */

export interface DocumentDraftInput {
  name: string;
  doc_type: DocumentType;
  scope: DocumentScope;
  team_id: string | null;
  project_id: string | null;
  description: string;
  source_type: DocumentSource;
  source_url: string;
  owner_id: string;
  effective_from: string;
  effective_to: string | null;
  keywords: string[];
  change_note: string;
}

function friendlyError(message: string): Error {
  if (/duplicate key|unique/i.test(message)) {
    return new Error("Đã có tài liệu cùng loại, cùng phạm vi và cùng tên. Hãy đổi tên nội dung.");
  }
  if (/row-level security|permission denied/i.test(message)) {
    return new Error("Bạn không có quyền thực hiện thao tác này trong phạm vi đã chọn.");
  }
  return new Error(message);
}

export async function createDocumentDraft(
  input: DocumentDraftInput,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      code: "",
      name: input.name,
      normalized_name: "",
      display_name: "",
      doc_type: input.doc_type,
      scope: input.scope,
      team_id: input.scope === "team" ? input.team_id : null,
      project_id: input.scope === "project" ? input.project_id : null,
      description: input.description || null,
      source_type: input.source_type,
      source_url: input.source_url,
      keywords: input.keywords,
      owner_id: input.owner_id,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw friendlyError(error.message);

  const documentId = (data as { id: string }).id;
  const { error: versionError } = await supabase
    .from("document_versions")
    .update({
      source_type: input.source_type,
      source_url: input.source_url,
      effective_from: input.effective_from,
      effective_to: input.effective_to,
      change_note: input.change_note || null,
    })
    .eq("document_id", documentId)
    .eq("version_no", 1);
  if (versionError) throw friendlyError(versionError.message);
  return documentId;
}

export async function updateDocumentDraft(
  documentId: string,
  versionId: string,
  input: DocumentDraftInput,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({
      name: input.name,
      doc_type: input.doc_type,
      scope: input.scope,
      team_id: input.scope === "team" ? input.team_id : null,
      project_id: input.scope === "project" ? input.project_id : null,
      description: input.description || null,
      source_type: input.source_type,
      source_url: input.source_url,
      keywords: input.keywords,
      owner_id: input.owner_id,
    })
    .eq("id", documentId);
  if (error) throw friendlyError(error.message);

  const { error: versionError } = await supabase
    .from("document_versions")
    .update({
      source_type: input.source_type,
      source_url: input.source_url,
      effective_from: input.effective_from,
      effective_to: input.effective_to,
      change_note: input.change_note || null,
    })
    .eq("id", versionId);
  if (versionError) throw friendlyError(versionError.message);
}

export async function deleteDocumentDraft(documentId: string): Promise<void> {
  const { error: versionError } = await supabase
    .from("document_versions")
    .delete()
    .eq("document_id", documentId);
  if (versionError) throw friendlyError(versionError.message);
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) throw friendlyError(error.message);
}

/* ================= DOC-04 — Luồng duyệt ================= */

function approvalError(message: string): Error {
  if (/permission denied|row-level security/i.test(message)) {
    return new Error("Bạn không có quyền thực hiện thao tác duyệt này.");
  }
  return new Error(message.replace(/^.*?ERROR:\s*/i, ""));
}

/** Có đang chờ duyệt không (theo phiên bản mới nhất). */
export function isPendingApproval(doc: DocumentRow): boolean {
  return doc.latestVersion?.status === "pending_approval";
}

/** Người quản lý tài liệu gửi duyệt khi bản mới nhất là nháp. */
export function canSubmitDocument(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  return canManageDocument(doc, ctx) && isDraftDocument(doc);
}

/** Chỉ người gửi duyệt được thu hồi khi chưa có quyết định. */
export function canWithdrawDocument(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  const v = doc.latestVersion;
  if (!v || !ctx.userId) return false;
  return (
    v.status === "pending_approval" &&
    v.submitted_by === ctx.userId &&
    !v.approved_at &&
    !v.rejected_at
  );
}

/** Người duyệt được chỉ định (hoặc người duyệt thay thế) mới thấy nút duyệt/từ chối. */
export function canDecideDocument(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  const v = doc.latestVersion;
  if (!v || !ctx.userId) return false;
  if (v.status !== "pending_approval" || v.approved_at || v.rejected_at) return false;
  return v.approver_id === ctx.userId || v.alt_approver_id === ctx.userId;
}

/** Ngoại lệ: Admin/CMO tự duyệt tài liệu mình tạo/gửi, bắt buộc nhập lý do. */
export function needsSelfApprovalReason(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  const v = doc.latestVersion;
  if (!v || !ctx.userId || !privileged(ctx)) return false;
  if (v.status !== "pending_approval") return false;
  return v.submitted_by === ctx.userId || doc.created_by === ctx.userId;
}

/** Admin/CMO được đổi người duyệt khi tài liệu đang chờ duyệt. */
export function canReassignApprover(doc: DocumentRow, ctx: DocumentAccessContext): boolean {
  return privileged(ctx) && isPendingApproval(doc);
}

export async function submitDocument(documentId: string): Promise<void> {
  const { error } = await supabase.rpc("document_submit", { _document: documentId });
  if (error) throw approvalError(error.message);
}

export async function withdrawDocument(documentId: string): Promise<void> {
  const { error } = await supabase.rpc("document_withdraw", { _document: documentId });
  if (error) throw approvalError(error.message);
}

export async function approveDocument(documentId: string, selfReason?: string): Promise<void> {
  const trimmed = selfReason?.trim();
  const { error } = await supabase.rpc("document_approve", {
    _document: documentId,
    ...(trimmed ? { _self_reason: trimmed } : {}),
  });
  if (error) throw approvalError(error.message);
}


export async function rejectDocument(documentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("document_reject", {
    _document: documentId,
    _reason: reason.trim(),
  });
  if (error) throw approvalError(error.message);
}

export async function setDocumentApprover(documentId: string, approverId: string): Promise<void> {
  const { error } = await supabase.rpc("document_set_approver", {
    _document: documentId,
    _approver: approverId,
  });
  if (error) throw approvalError(error.message);
}
