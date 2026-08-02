import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * NAP-02 — Tab điều hướng chung cho module "Thông báo & Phê duyệt".
 * Dùng Link nên chuyển tab không reload App Shell.
 */
const TAB_CLASS =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control px-3 py-1.5 text-label font-medium text-text-muted transition-colors duration-fast hover:text-text-primary data-[status=active]:bg-surface-raised data-[status=active]:text-text-primary";

export function AnnouncementModuleTabs({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Thông báo và phê duyệt"
      className={cn(
        "-mx-1 flex min-w-0 gap-1 overflow-x-auto rounded-control border border-border-default bg-surface-subtle p-1",
        className,
      )}
    >
      <Link
        to="/announcements"
        activeOptions={{ exact: false }}
        className={TAB_CLASS}
        activeProps={{ "aria-current": "page" }}
      >
        Thông báo
      </Link>
      <Link
        to="/approvals"
        className={TAB_CLASS}
        activeProps={{ "aria-current": "page" }}
      >
        Phê duyệt
      </Link>
    </nav>
  );
}
