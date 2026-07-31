import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Error State (M1.1D)
 * Khác rõ Empty State: dùng token lỗi cho icon và viền.
 * Không tự fetch lại, chỉ phát callback `onRetry`. Không hiển thị stack trace.
 */
export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon | null;
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
  variant?: "full" | "compact";
}

export function ErrorState({
  icon: Icon = AlertTriangle,
  title = "Không tải được nội dung",
  description = "Vui lòng thử lại. Nếu vẫn lỗi, liên hệ quản trị hệ thống.",
  onRetry,
  retryLabel = "Thử lại",
  action,
  variant = "full",
  className,
  ...props
}: ErrorStateProps) {
  const compact = variant === "compact";
  return (
    <div
      role="alert"
      data-state="error"
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
            "grid shrink-0 place-items-center rounded-control border border-state-danger/50 bg-state-danger-surface text-state-danger",
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
      {onRetry || action ? (
        <div className={cn("flex flex-wrap justify-center gap-2", compact ? "mt-1" : "mt-2")}>
          {onRetry ? (
            <Button variant="secondary" size={compact ? "sm" : "md"} onClick={onRetry}>
              <RotateCcw />
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Lỗi cấp form (không phải cấp field). Đặt trên đầu form, ngắn gọn,
 * không thay thế error message của FormField.
 */
export function FormErrorSummary({
  title = "Không gửi được biểu mẫu",
  messages,
  className,
}: {
  title?: string;
  messages: string[];
  className?: string;
}) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-state-danger/50 bg-state-danger-surface px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-icon-sm shrink-0 text-state-danger" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-label font-semibold text-text-primary">{title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-helper text-text-secondary">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
