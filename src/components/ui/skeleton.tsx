import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Skeleton (M1.1D)
 * Animation nhẹ, dùng token surface. Giữ gần đúng kích thước nội dung thật.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-badge bg-surface-subtle", className)}
      {...props}
    />
  );
}

/** Nhiều dòng chữ giả, dòng cuối ngắn hơn cho tự nhiên. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 && lines > 1 ? "w-2/5" : "w-full")}
        />
      ))}
    </div>
  );
}

const avatarSize = {
  xs: "size-6",
  sm: "size-8",
  md: "size-9",
  lg: "size-11",
} as const;

/** Avatar hoặc icon tròn/vuông bo góc. */
function SkeletonAvatar({
  size = "md",
  shape = "circle",
  className,
}: {
  size?: keyof typeof avatarSize;
  shape?: "circle" | "square";
  className?: string;
}) {
  return (
    <Skeleton
      className={cn(avatarSize[size], shape === "circle" ? "rounded-full" : "rounded-control", className)}
    />
  );
}

/** Khối card đang tải: tiêu đề + vài dòng text, khớp padding của Card. */
function SkeletonCard({
  lines = 3,
  withAvatar = false,
  className,
}: {
  lines?: number;
  withAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        {withAvatar ? <SkeletonAvatar /> : null}
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

/**
 * Dòng bảng đang tải. Render trong vùng body của bảng (đặt trong cell colSpan)
 * nên dùng grid thay vì <tr> để không phá cấu trúc bảng.
 */
function SkeletonTableRows({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border-default", className)} data-slot="skeleton-rows">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid items-center gap-4 px-3 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn("h-3.5", colIndex === 0 ? "w-4/5" : "w-3/5")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonTableRows };
