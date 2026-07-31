import type { LinkProps } from "@tanstack/react-router";
import { LayoutDashboard, Palette, type LucideIcon } from "lucide-react";

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
  /** Khóa quyền dự kiến, chưa được sử dụng ở M1.2. */
  permissionKey?: string;
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
    key: "system",
    label: "Hệ thống",
    items: [
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
