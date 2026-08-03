import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * TODAY-LAYOUT-RESET-01 — khung bố cục dùng riêng cho CEN Today.
 * Chỉ lo bố cục và khung card; không chứa Business Rule hay query nào.
 */
export type TodaySize = "compact" | "wide" | "full";

/** Lớp span theo kích thước. Grid: 1 cột (mobile) → 2 cột (md/lg) → 3 cột (xl). */
const SPAN: Record<TodaySize, string> = {
  compact: "col-span-1",
  wide: "col-span-1 md:col-span-2 xl:col-span-2",
  full: "col-span-1 md:col-span-2 xl:col-span-3",
};

export function TodayDashboardLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return <div className={cn("flex min-w-0 flex-col gap-4", className)}>{children}</div>;
}

/** Hàng KPI độc lập phía trên lưới widget. */
export function TodayKpiRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

/** Lưới widget 3 cột, tự dồn (dense). Widget ẩn không để lại ô trống. */
export function TodayGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 [grid-auto-flow:dense] md:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

/** Bọc một widget sẵn có vào ô lưới theo kích thước. */
export function TodaySlot({
  size = "compact",
  className,
  children,
}: {
  size?: TodaySize | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return <div className={cn("min-w-0", SPAN[size], className)}>{children}</div>;
}

export function todaySpan(size: TodaySize): string {
  return SPAN[size];
}

export interface DashboardCardProps {
  title: string;
  icon?: LucideIcon | undefined;
  size?: TodaySize | undefined;
  /** Hành động "Xem thêm" ở góc phải header. */
  to?: LinkProps["to"] | undefined;
  params?: LinkProps["params"] | undefined;
  actionLabel?: string | undefined;
  /** Hành động phụ (nút Làm mới, badge…) đặt cạnh "Xem thêm". */
  headerExtra?: React.ReactNode | undefined;
  /** Giới hạn chiều cao vùng nội dung cho khối nhiều dữ liệu. */
  scroll?: boolean | undefined;
  footer?: React.ReactNode | undefined;
  className?: string | undefined;
  contentClassName?: string | undefined;
  children: React.ReactNode;
}

/** Card chuẩn hóa cho CEN Today: header thống nhất + "Xem thêm". */
export function DashboardCard({
  title,
  icon: Icon,
  size = "compact",
  to,
  params,
  actionLabel = "Xem thêm",
  headerExtra,
  scroll = false,
  footer,
  className,
  contentClassName,
  children,
}: DashboardCardProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col", SPAN[size], className)}>
      <CardHeader className="gap-2 pb-0">
        <CardTitle className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-icon-sm shrink-0 text-text-muted" aria-hidden="true" /> : null}
          <span className="min-w-0 truncate">{title}</span>
        </CardTitle>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {headerExtra}
          {to ? (
            <Button asChild variant="ghost" size="sm">
              <Link to={to} {...(params ? { params } : {})}>
                {actionLabel}
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 pt-(--card-pad)",
          scroll && "max-h-72 overflow-y-auto",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
      {footer ? <div className="px-(--card-pad) pb-(--card-pad)">{footer}</div> : null}
    </Card>
  );
}
