import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckSquare,
  FolderPlus,
  ListPlus,
  Megaphone,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { DashboardCard } from "@/components/home/today-layout";
import { Button } from "@/components/ui/button";
import { useOrgAccess } from "@/hooks/use-org-access";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

/**
 * TODAY-RESET-01 — Hàng 3 (1/3): sáu hành động nhanh, grid 2 cột.
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
    key: "project",
    label: "Tạo dự án",
    icon: FolderPlus,
    to: "/projects",
    permission: PERMISSIONS.PROJECTS_CREATE,
  },
  {
    key: "task",
    label: "Tạo công việc",
    icon: ListPlus,
    to: "/tasks",
    permission: PERMISSIONS.TASKS_CREATE,
  },
  {
    key: "announcement",
    label: "Tạo thông báo",
    icon: Megaphone,
    to: "/announcements",
    permission: PERMISSIONS.ANNOUNCEMENTS_CREATE,
  },
  {
    key: "approval",
    label: "Tạo phê duyệt",
    icon: CheckSquare,
    to: "/approvals",
    permission: PERMISSIONS.APPROVALS_CREATE,
  },
  {
    key: "recognition",
    label: "Ghi nhận đồng đội",
    icon: Sparkles,
    to: "/recognitions",
  },
  {
    key: "duty",
    label: "Lịch trực nhật",
    icon: CalendarClock,
    to: "/duty",
  },
];

export function QuickActions({ className }: { className?: string } = {}) {
  const access = useOrgAccess();
  const actions = ACTIONS.filter((action) => !action.permission || access.can(action.permission));
  if (access.loading || actions.length === 0) return null;

  return (
    <DashboardCard size="compact" icon={Zap} title="Hành động nhanh" className={className}>
      <div className="grid auto-rows-[minmax(52px,1fr)] grid-cols-2 gap-3 max-[380px]:grid-cols-1">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant="secondary"
            className="h-full min-h-[52px] w-full justify-start gap-2 px-3 text-left [&_svg]:size-5"
            asChild
          >
            <Link to={action.to!}>
              <action.icon />
              <span className="min-w-0 text-wrap">{action.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </DashboardCard>
  );
}
