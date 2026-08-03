import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { formatHanoiDateTime, isIsoInstant } from "@/lib/datetime";

/**
 * CEN 1.0 — M1.5 Audit Log data layer (chỉ đọc).
 * Ghi log do trigger phía database đảm nhiệm; UI không thể sửa hoặc xóa.
 */
export interface AuditLogRow {
  id: string;
  user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  result: string;
  created_at: string;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "account.created": "Tạo tài khoản",
  "account.locked": "Khóa tài khoản",
  "account.unlocked": "Mở khóa tài khoản",
  "account.password_changed": "Đổi mật khẩu",
  "account.signed_out_all": "Đăng xuất toàn bộ thiết bị",
  "member.profile_updated": "Cập nhật hồ sơ thành viên",
  "member.primary_team_changed": "Đổi Team chính",
  "role.granted": "Gán vai trò",
  "role.revoked": "Thu hồi vai trò",
  "team.created": "Tạo Team",
  "team.updated": "Cập nhật Team",
  "team.collaborator_added": "Thêm Team phối hợp",
  "team.collaborator_removed": "Gỡ Team phối hợp",
  "facility.created": "Tạo Cơ sở",
  "facility.updated": "Cập nhật Cơ sở",
  "facility.deactivated": "Ngừng hoạt động Cơ sở",
  "setting.updated": "Thay đổi cấu hình hệ thống",
  "project.created": "Tạo dự án",
  "project.submitted": "Gửi dự án đi duyệt",
  "project.auto_approved": "Tạo và duyệt ngay",
  "project.leader_approved": "Leader duyệt, chuyển CMO",
  "project.leader_rejected": "Leader từ chối dự án",
  "project.cmo_approved": "CMO duyệt dự án",
  "project.cmo_rejected": "CMO từ chối dự án",
  "project.status_changed": "Đổi trạng thái dự án",
  "project.archived": "Lưu trữ dự án",
  "project.owner_changed": "Đổi Chủ dự án",
  "project.schedule_changed": "Đổi mốc thời gian dự án",
  "project.updated": "Cập nhật thông tin dự án",
  "project.team_linked": "Thêm Team tham gia",
  "project.team_unlinked": "Gỡ Team tham gia",
  "project.member_linked": "Thêm thành viên tham gia",
  "project.member_unlinked": "Gỡ thành viên tham gia",
  "project.facility_linked": "Thêm Cơ sở liên quan",
  "project.facility_unlinked": "Gỡ Cơ sở liên quan",
  "task.created": "Tạo công việc",
  "task.updated": "Cập nhật thông tin công việc",
  "task.status_changed": "Đổi trạng thái công việc",
  "task.priority_changed": "Đổi mức ưu tiên công việc",
  "task.deadline_changed": "Đổi mốc thời gian công việc",
  "task.assignee_changed": "Đổi người phụ trách",
  "task.project_changed": "Đổi dự án của công việc",
  "task.team_changed": "Đổi Team phụ trách",
  "task.archived": "Lưu trữ công việc",
  "task.restored": "Khôi phục công việc",
  "task.participant_linked": "Thêm người tham gia công việc",
  "task.participant_unlinked": "Gỡ người tham gia công việc",
  "task.approval_requested": "Gửi yêu cầu tạo công việc",
  "task.approval_resubmitted": "Gửi lại yêu cầu tạo công việc",
  "task.approval_withdrawn": "Thu hồi yêu cầu tạo công việc",
  "task.approval_approved": "Duyệt yêu cầu tạo công việc",
  "task.approval_changes_requested": "Yêu cầu chỉnh sửa công việc",
  "mvp.cycle_created": "Mở kỳ MVP",
  "mvp.cycle_status_changed": "Đổi trạng thái kỳ MVP",
  "mvp.cycle_published": "Công bố kết quả kỳ MVP",
  "mvp.review_saved": "Lưu đánh giá thực tế",
  "mvp.review_submitted": "Gửi đánh giá thực tế",
  "mvp.vote_cast": "Ghi nhận phiếu bầu",
  "mvp.award_proposed": "Đề xuất danh hiệu",
  "mvp.award_approved": "Phê duyệt danh hiệu",
  "mvp.award_withheld": "Không trao danh hiệu",
  "mvp.award_published": "Công bố danh hiệu",
  "mvp.award_updated": "Cập nhật danh hiệu",
  "mvp.data_adjusted": "Điều chỉnh dữ liệu chấm điểm",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  profile: "Tài khoản",
  user_role: "Vai trò",
  team: "Team",
  facility: "Cơ sở",
  app_setting: "Cấu hình",
  project: "Dự án",
  task: "Công việc",
  mvp_cycle: "Kỳ MVP",
  mvp_review: "Đánh giá MVP",
  mvp_vote: "Phiếu bầu MVP",
  mvp_award: "Danh hiệu",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

export async function fetchAuditLogs(filters: AuditFilters): Promise<AuditLogRow[]> {
  let query = supabase
    .from("audit_logs")
    .select(
      "id,user_id,actor_email,action,entity_type,entity_id,before_data,after_data,metadata,result,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.actor) query = query.ilike("actor_email", `%${filters.actor}%`);
  if (filters.from) query = query.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    query = query.lte("created_at", to.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

export const auditLogsQuery = (filters: AuditFilters) =>
  queryOptions({
    queryKey: ["audit-logs", filters],
    queryFn: () => fetchAuditLogs(filters),
  });

export function formatAuditTime(value: string) {
  return formatHanoiDateTime(value);
}

/** Rút gọn dữ liệu trước/sau để hiển thị — không chứa mật khẩu, token hay secret. */
export function summarizeChange(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key]) => !/password|token|secret|key$/i.test(key),
  );
  if (entries.length === 0) return "—";
  return entries
    .map(([key, val]) => {
      if (val === null || val === "") return `${key}: —`;
      const text = String(val);
      // Thời điểm lưu UTC → hiển thị theo giờ Hà Nội (vd deadline công việc).
      return `${key}: ${isIsoInstant(text) ? formatHanoiDateTime(text) : text}`;
    })
    .join(" · ");
}

/**
 * Ghi audit cho sự kiện phía Auth mà database không quan sát được
 * (đổi mật khẩu tự phục vụ, đăng xuất toàn bộ thiết bị).
 * Chỉ ghi metadata an toàn — không bao giờ ghi mật khẩu hay token.
 */
export async function logSelfAuditEvent(
  userId: string,
  action: "account.password_changed" | "account.signed_out_all",
) {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: "profile",
    entity_id: userId,
    metadata: {},
  });
}
