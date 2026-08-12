import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * NAP-UI-11 — Tab điều hướng chung: Thông báo | Đề xuất | Phê duyệt.
 * "Đề xuất" và "Phê duyệt" dùng chung pathname /approvals, phân biệt bằng
 * query param `view` nên active state phải tự tính, không dùng activeProps.
 */
const TAB_CLASS =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-control px-3 py-1.5 text-label font-medium text-text-muted transition-colors duration-fast hover:text-text-primary data-[status=active]:bg-surface-raised data-[status=active]:text-text-primary";
const ACTIVE_CLASS = "bg-surface-raised text-text-primary";

export function AnnouncementModuleTabs({ className }: { className?: string }) {
  const location = useRouterState({ select: (state) => state.location });
  const onApprovals = location.pathname.startsWith("/approvals");
  const view = (location.search as { view?: string } | undefined)?.view;
  const proposalActive = onApprovals && view === "proposal";
  const approvalActive = onApprovals && !proposalActive;

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
        search={{ view: "proposal" }}
        className={cn(TAB_CLASS, proposalActive && ACTIVE_CLASS)}
        {...(proposalActive ? { "aria-current": "page" as const } : {})}
      >
        Đề xuất
      </Link>
      <Link
        to="/approvals"
        search={{ view: "approval" }}
        className={cn(TAB_CLASS, approvalActive && ACTIVE_CLASS)}
        {...(approvalActive ? { "aria-current": "page" as const } : {})}
      >
        Phê duyệt
      </Link>
    </nav>
  );
}
