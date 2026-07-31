import * as React from "react";
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Empty State (M1.1D)
 * Dùng khi không có dữ liệu. Không minh họa lớn, không phong cách landing page.
 * Action luôn truyền từ ngoài vào, component không tự gọi nghiệp vụ.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon | null;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "full" | "compact";
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = "full",
  className,
  ...props
}: EmptyStateProps) {
  const compact = variant === "compact";
  return (
    <div
      data-state="empty"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-control border border-border-default bg-surface-subtle text-text-muted",
            compact ? "size-8" : "size-10",
          )}
          aria-hidden="true"
        >
          <Icon className={compact ? "size-icon-md" : "size-icon-lg"} />
        </span>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className={cn("font-semibold text-text-primary", compact ? "text-label" : "text-body-lg")}>
          {title}
        </p>
        {description ? <p className="text-helper text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className={cn("flex flex-wrap justify-center gap-2", compact ? "mt-1" : "mt-2")}>{action}</div> : null}
    </div>
  );
}
