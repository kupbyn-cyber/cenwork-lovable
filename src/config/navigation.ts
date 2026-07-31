import type { LinkProps } from "@tanstack/react-router";

import { hasPermission, type AppRoleKey, type PermissionKey } from "@/lib/permissions";
import {
  Building2,
  LayoutDashboard,
  Palette,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";


/**
 * CEN 1.0 — Navigation config (M1.2)
 * Nguồn duy nhất cho Sidebar + Mobile Drawer.
 * Chỉ khai báo route đã tồn tại trong project. Không hardcode role/permission:
 * gói sau chỉ cần lọc danh sách theo `permissionKey`.
 */
export interface NavItem {
  /** Khóa ổn định, dùng cho lọc quyền ở gói sau. */
  key: string;
  label: string;
  to: LinkProps["to"];
  icon: LucideIcon;
  /** Khớp chính xác pathname (dùng cho route gốc "/"). */
  exact?: boolean;
  /** Route/action chưa khả dụng → hiển thị disabled, không điều hướng. */
  disabled?: boolean;
  /** Khóa quyền (M1.5): item chỉ hiển thị khi vai trò hiện tại có quyền này. */
  permissionKey?: PermissionKey;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: "workspace",
    label: "Không gian làm việc",
    items: [
      {
        key: "home",
        label: "Trang chủ",
        to: "/",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    key: "organization",
    label: "Tổ chức",
    items: [
      {
        key: "members",
        label: "Thành viên",
        to: "/members",
        icon: Users,
        permissionKey: "members.view",
      },
      {
        key: "organization",
        label: "Cơ cấu tổ chức",
        to: "/organization",
        icon: Building2,
        permissionKey: "organization.view",
      },
      {
        key: "roles",
        label: "Vai trò và quyền",
        to: "/roles",
        icon: ShieldCheck,
        permissionKey: "roles.view",
      },
    ],
  },

  {
    key: "account",
    label: "Tài khoản",
    items: [
      {
        key: "settings",
        label: "Cài đặt",
        to: "/settings",
        icon: UserCog,
      },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    items: [
      {
        key: "audit-logs",
        label: "Nhật ký hoạt động",
        to: "/audit-logs",
        icon: ScrollText,
        permissionKey: "audit.view",
      },
      {
        key: "design-system",
        label: "Design System",
        to: "/theme-preview",
        icon: Palette,
      },
    ],
  },
];


export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const to = String(item.to ?? "/");
  if (item.exact || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Lọc navigation theo vai trò hiện tại (M1.5). Backend vẫn kiểm tra quyền độc lập. */
export function visibleNavGroups(role: AppRoleKey | null): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permissionKey || hasPermission(role, item.permissionKey),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
