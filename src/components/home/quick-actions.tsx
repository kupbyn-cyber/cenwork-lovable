import { Link } from "@tanstack/react-router";
import { ClipboardList, FolderPlus, ListPlus, Megaphone, Sparkles, Users, Zap } from "lucide-react";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { DashboardCard } from "@/components/home/today-layout";
import { Button } from "@/components/ui/button";
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
    key: "recognition",
    label: "Ghi nhận đồng đội",
    icon: Sparkles,
    to: "/recognitions",
  },
  {
    key: "members",
    label: "Thành viên",
    icon: Users,
    to: "/members",
    permission: PERMISSIONS.MEMBERS_VIEW,
  },
];

export function QuickActions({ className }: { className?: string } = {}) {
  const access = useOrgAccess();
  const actions = ACTIONS.filter((action) => !action.permission || access.can(action.permission));
  if (access.loading || actions.length === 0) return null;

  return (
    <DashboardCard size="compact" icon={Zap} title="Hành động nhanh" className={className}>
      <div className="grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant="secondary"
            className="h-12 w-full justify-start gap-2 px-3 text-left [&_svg]:size-5"
            asChild
          >
            <Link to={action.to!}>
              <action.icon />
              <span className="min-w-0 truncate">{action.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </DashboardCard>
  );
}
