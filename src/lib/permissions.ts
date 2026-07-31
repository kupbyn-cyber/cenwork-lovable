/**
 * CEN 1.0 — M1.5 Permission model (nguồn duy nhất cho UI và backend).
 *
 * Nguyên tắc:
 * - Chỉ 4 vai trò hiện hành: admin, cmo, leader, member.
 * - Ma trận dưới đây phản ánh đúng quyền đã triển khai ở M1.4 (không mở rộng).
 * - UI dùng để ẩn/disable; server function và RLS vẫn kiểm tra độc lập.
 */
export type AppRoleKey = "admin" | "cmo" | "leader" | "member";

export const ROLE_ORDER: AppRoleKey[] = ["admin", "cmo", "leader", "member"];

export const PERMISSIONS = {
  MEMBERS_VIEW: "members.view",
  MEMBERS_CREATE: "members.create",
  MEMBERS_EDIT_SCOPED: "members.edit_scoped",
  MEMBERS_LOCK: "members.lock",
  ROLES_VIEW: "roles.view",
  ROLES_ASSIGN: "roles.assign",
  ORG_VIEW: "organization.view",
  ORG_MANAGE: "organization.manage",
  SETTINGS_ADMIN: "settings.admin",
  AUDIT_VIEW: "audit.view",
  PROJECTS_VIEW: "projects.view",
  PROJECTS_CREATE: "projects.create",
  TASKS_VIEW: "tasks.view",
  TASKS_CREATE: "tasks.create",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  "members.view": "Xem danh sách thành viên",
  "members.create": "Tạo tài khoản thành viên",
  "members.edit_scoped": "Sửa hồ sơ thành viên trong phạm vi",
  "members.lock": "Khóa / mở khóa tài khoản",
  "roles.view": "Xem vai trò và quyền",
  "roles.assign": "Gán vai trò hệ thống",
  "organization.view": "Xem Team và Cơ sở",
  "organization.manage": "Tạo / sửa Team và Cơ sở",
  "settings.admin": "Cấu hình quản trị hệ thống",
  "audit.view": "Xem nhật ký hoạt động",
  "projects.view": "Xem dự án trong phạm vi",
  "projects.create": "Gửi ý tưởng dự án",
  "tasks.view": "Xem công việc trong phạm vi",
  "tasks.create": "Tạo công việc",
};

export const PERMISSION_GROUP: Record<PermissionKey, string> = {
  "members.view": "Thành viên",
  "members.create": "Thành viên",
  "members.edit_scoped": "Thành viên",
  "members.lock": "Thành viên",
  "roles.view": "Vai trò",
  "roles.assign": "Vai trò",
  "organization.view": "Tổ chức",
  "organization.manage": "Tổ chức",
  "settings.admin": "Hệ thống",
  "audit.view": "Hệ thống",
  "projects.view": "Dự án",
  "projects.create": "Dự án",
  "tasks.view": "Công việc",
  "tasks.create": "Công việc",
};

/** Ma trận quyền — giữ nguyên phạm vi đã chốt ở M1.4. */
export const ROLE_PERMISSIONS: Record<AppRoleKey, PermissionKey[]> = {
  admin: [
    "members.view",
    "members.create",
    "members.edit_scoped",
    "members.lock",
    "roles.view",
    "roles.assign",
    "organization.view",
    "organization.manage",
    "settings.admin",
    "audit.view",
    "projects.view",
    "projects.create",
    "tasks.view",
    "tasks.create",
  ],
  cmo: [
    "members.view",
    "members.create",
    "members.edit_scoped",
    "roles.view",
    "roles.assign",
    "organization.view",
    "audit.view",
    "projects.view",
    "projects.create",
    "tasks.view",
    "tasks.create",
  ],
  leader: [
    "members.view",
    "members.edit_scoped",
    "roles.view",
    "organization.view",
    "projects.view",
    "projects.create",
    "tasks.view",
    "tasks.create",
  ],
  member: ["organization.view", "projects.view", "projects.create"],
};

export function hasPermission(role: AppRoleKey | null, permission: PermissionKey): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const PERMISSION_DENIED_MESSAGE = "Bạn không có quyền thực hiện thao tác này.";
