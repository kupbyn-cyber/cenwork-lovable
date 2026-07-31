import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Spinner (M1.1D)
 * Chỉ báo tiến trình không xác định. Không chứa logic nghiệp vụ.
 */
const sizeClass = {
  xs: "size-3",
  sm: "size-icon-sm",
  md: "size-icon-md",
  lg: "size-icon-lg",
  xl: "size-8",
} as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: keyof typeof sizeClass;
  /** Nhãn cho screen reader. */
  label?: string;
}

export function Spinner({ size = "md", label = "Đang tải", className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center justify-center text-text-muted", className)}
      {...props}
    >
      <Loader2 className={cn("animate-spin", sizeClass[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Vùng nội dung đang tải: spinner + mô tả ngắn, dùng khi chưa cần Skeleton. */
export function LoadingBlock({
  label = "Đang tải dữ liệu",
  compact = false,
  className,
}: {
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <Spinner size={compact ? "md" : "lg"} label={label} />
      <p className="text-helper text-text-muted">{label}</p>
    </div>
  );
}
