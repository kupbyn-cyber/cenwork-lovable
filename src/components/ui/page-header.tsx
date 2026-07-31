import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — PageHeader (M1.1C)
 * Structure only: no app shell, no hardcoded actions, no permission logic.
 */
export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Breadcrumb node passed in from outside (e.g. <BreadcrumbNav />). */
  breadcrumb?: React.ReactNode;
  /** Metadata row: badges, counters, timestamps… */
  meta?: React.ReactNode;
  /** Action area — always provided by the caller. */
  actions?: React.ReactNode;
  /** Extra content below the header (tabs, filters slot, etc.). */
  children?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ title, description, breadcrumb, meta, actions, children, className, ...props }, ref) => (
    <header ref={ref} className={cn("flex min-w-0 flex-col gap-3", className)} {...props}>
      {breadcrumb ? <div className="min-w-0">{breadcrumb}</div> : null}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2 font-semibold text-text-primary">{title}</h1>
          {description ? (
            <p className="mt-1 text-body text-text-muted">{description}</p>
          ) : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  ),
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
