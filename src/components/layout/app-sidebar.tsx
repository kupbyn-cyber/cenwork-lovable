import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isNavItemActive, visibleNavGroups, type NavItem } from "@/config/navigation";
import { useOrgAccess } from "@/hooks/use-org-access";

/**
 * CEN 1.0 — Sidebar điều hướng (M1.2)
 * Dùng chung cho Desktop (cố định, mở rộng/thu gọn) và Mobile Drawer.
 */

export function CenLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img
        src="/brand/logo-mark.svg"
        alt=""
        aria-hidden
        className="size-8 shrink-0 object-contain"
      />
      {!collapsed ? (
        <span className="min-w-0 truncate">
          <span className="block truncate text-label font-bold tracking-wide text-text-primary">
            CEN 1.0
          </span>
          <span className="block truncate text-caption text-text-muted">Trung tâm điều hành</span>
        </span>
      ) : (
        <span className="sr-only">CEN 1.0 Trung tâm điều hành</span>
      )}
    </div>
  );
}

function NavLinkItem({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  const base = cn(
    "cen-transition group relative flex h-control-lg w-full items-center gap-3 rounded-control border border-transparent px-2.5 text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
    collapsed && "justify-center px-0",
    active
      ? "bg-brand-subtle text-text-primary border-brand-secondary"
      : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
    item.disabled && "pointer-events-none opacity-50",
  );

  const inner = (
    <>
      {active ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-primary"
        />
      ) : null}
      <Icon className="size-icon-md shrink-0" aria-hidden />
      {!collapsed ? <span className="min-w-0 truncate">{item.label}</span> : null}
    </>
  );

  const node = item.disabled ? (
    <span className={base} aria-disabled="true" title={`${item.label} — chưa khả dụng`}>
      {inner}
    </span>
  ) : (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={base}
    >
      {inner}
    </Link>
  );

  if (!collapsed) return node;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useOrgAccess();
  const groups = React.useMemo(() => visibleNavGroups(role), [role]);

  return (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-5 px-2.5 py-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {!collapsed ? (
            <p className="px-2.5 pb-1 text-caption font-semibold tracking-[0.14em] text-text-muted uppercase">
              {group.label}
            </p>
          ) : (
            <span className="sr-only">{group.label}</span>
          )}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLinkItem
                  item={item}
                  collapsed={collapsed}
                  active={isNavItemActive(item, pathname)}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "cen-transition hidden shrink-0 flex-col border-r border-border-default bg-background-elevated md:flex",
        collapsed ? "w-[4.5rem]" : "w-[16rem]",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border-default px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        <CenLogo collapsed={collapsed} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center border-t border-border-default p-2.5",
          collapsed ? "justify-center" : "justify-end",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              size="icon"
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
              label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Mở rộng" : "Thu gọn"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
