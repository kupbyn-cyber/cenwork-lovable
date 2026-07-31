import * as React from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — StatusBadge (M1.1C)
 * Presentational only: label + tone + optional icon come from props.
 * BR-M1.1C-02: no business status list, no transition logic, no data access.
 */
export type StatusTone = "neutral" | "progress" | "success" | "warning" | "error";

const toneToVariant: Record<StatusTone, NonNullable<BadgeProps["variant"]>> = {
  neutral: "neutral",
  progress: "info",
  success: "success",
  warning: "warning",
  error: "error",
};

const dotClass: Record<StatusTone, string> = {
  neutral: "bg-state-neutral",
  progress: "bg-state-progress",
  success: "bg-state-success",
  warning: "bg-state-warning",
  error: "bg-state-danger",
};

export interface StatusBadgeProps extends Omit<BadgeProps, "variant" | "children" | "icon"> {
  /** Visible text of the status. Always provided by the caller. */
  label: string;
  /** Presentation tone. Not tied to any module business rule. */
  tone?: StatusTone;
  /** Optional icon rendered before the label. */
  icon?: React.ReactNode;
  /** Show a small tone dot when no icon is supplied. Defaults to true. */
  dot?: boolean;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ label, tone = "neutral", icon, dot = true, className, size, ...props }, ref) => (
    <Badge
      ref={ref}
      variant={toneToVariant[tone]}
      size={size}
      className={cn("whitespace-nowrap", className)}
      icon={
        icon ??
        (dot ? (
          <span className={cn("size-1.5 rounded-full", dotClass[tone])} />
        ) : undefined)
      }
      {...props}
    >
      {label}
    </Badge>
  ),
);
StatusBadge.displayName = "StatusBadge";

export { StatusBadge };
