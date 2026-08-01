import { Link } from "@tanstack/react-router";
import { ClipboardList, FolderPlus, ListPlus, Megaphone, Sparkles, Users } from "lucide-react";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgAccess } from "@/hooks/use-org-access";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

/**
 * CEN TODAY-01 — Quick Actions theo đúng quyền hiện tại.
 * Chỉ điều hướng tới màn hình gốc; không nhân bản Business Rule của module.
 */
interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  to: LinkProps["to"];
  permission?: PermissionKey;
}

const ACTIONS: QuickAction[] = [
  {
    key: "task",
    label: "Tạo công việc",
    icon: ListPlus,
    to: "/tasks",
    permission: PERMISSIONS.TASKS_CREATE,
  },
  {
    key: "project",
    label: "Tạo dự án",
    icon: FolderPlus,
    to: "/projects",
    permission: PERMISSIONS.PROJECTS_CREATE,
  },
  {
    key: "report",
    label: "Báo cáo",
    icon: ClipboardList,
    to: "/reports",
    permission: PERMISSIONS.REPORTS_VIEW,
  },
  {
    key: "announcement",
    label: "Soạn thông báo",
    icon: Megaphone,
    to: "/announcements",
    permission: PERMISSIONS.ANNOUNCEMENTS_CREATE,
  },
  {
    key: "members",
    label: "Thành viên",
    icon: Users,
    to: "/members",
    permission: PERMISSIONS.MEMBERS_VIEW,
  },
];

export function QuickActions() {
  const access = useOrgAccess();
  const actions = ACTIONS.filter((action) => !action.permission || access.can(action.permission));
  if (access.loading || actions.length === 0) return null;

  return (
    <Card density="compact">
      <CardHeader>
        <CardTitle>Hành động nhanh</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.key} variant="secondary" size="sm" asChild>
            <Link to={action.to}>
              <action.icon />
              {action.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
