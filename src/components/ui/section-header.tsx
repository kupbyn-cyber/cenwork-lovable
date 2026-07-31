import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — SectionHeader (M1.1C)
 * Structure only. `compact` is used inside cards.
 */
export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ title, description, actions, compact = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3",
        compact ? "gap-2" : "",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2
          className={cn(
            "font-semibold text-text-primary",
            compact ? "text-label" : "text-h4",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className={cn("mt-1 text-text-muted", compact ? "text-caption" : "text-helper")}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  ),
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
