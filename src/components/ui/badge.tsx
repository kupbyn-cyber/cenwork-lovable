import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Badge (M1.1C)
 * Pure presentational. Colors come from design tokens only.
 * No business status list is hardcoded here.
 */
const badgeVariants = cva(
  "cen-transition inline-flex max-w-full items-center gap-1 rounded-badge border font-medium [&>svg]:size-icon-sm [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral:
          "border-border-default bg-state-neutral-surface text-text-secondary",
        brand: "border-transparent bg-brand-primary text-brand-foreground",
        "brand-subtle": "border-brand-secondary bg-brand-subtle text-text-primary",
        success:
          "border-state-success/35 bg-state-success-surface text-state-success",
        warning:
          "border-state-warning/35 bg-state-warning-surface text-state-warning",
        error: "border-state-danger/40 bg-state-danger-surface text-state-danger",
        info: "border-state-info/35 bg-state-info-surface text-state-info",
        outline: "border-border-strong bg-transparent text-text-secondary",
      },
      size: {
        sm: "h-5 px-1.5 text-caption",
        md: "h-6 px-2 text-helper",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Optional leading icon (small, decorative). */
  icon?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, icon, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-icon-sm">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
