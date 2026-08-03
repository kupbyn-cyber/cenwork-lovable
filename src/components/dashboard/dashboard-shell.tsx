import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DashKpi, DashTone, DrillTarget } from "@/lib/dashboard";

/**
 * DASH-CORE-01 — khung hiển thị dùng chung cho cả ba nhóm vai trò.
 * Dashboard chỉ xem và điều hướng: không có hành động thay đổi dữ liệu ở đây.
 */
type LinkLikeProps = {
  to: string;
  search?: Record<string, string>;
  params?: Record<string, string>;
  className?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
};
const RouteLink = Link as unknown as React.ComponentType<LinkLikeProps>;

export function DrillLink({
  target,
  className,
  children,
  label,
}: {
  target: DrillTarget;
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <RouteLink
      to={target.to}
      {...(target.search ? { search: target.search } : {})}
      {...(target.params ? { params: target.params } : {})}
      {...(label ? { "aria-label": label } : {})}
      className={className ?? ""}
    >
      {children}
    </RouteLink>
  );
}

const TONE_CLASS: Record<DashTone, string> = {
  default: "text-text-primary",
  success: "text-state-success",
  warning: "text-state-warning",
  danger: "text-state-danger",
};

export function HintLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Cách tính: ${label}`}
            className="shrink-0 text-text-muted hover:text-text-primary"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-xs">{hint}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function KpiCard({ kpi }: { kpi: DashKpi }) {
  const body = (
    <CardContent className="flex h-full min-w-0 flex-col justify-between gap-1 pt-(--card-pad)">
      <p className="text-sm text-text-secondary">
        <HintLabel label={kpi.label} hint={kpi.hint} />
      </p>
      <p className={cn("text-2xl font-semibold tabular-nums", TONE_CLASS[kpi.tone ?? "default"])}>
        {kpi.value}
      </p>
      <div className="min-w-0 space-y-0.5">
        {kpi.sub ? <p className="truncate text-xs text-text-muted">{kpi.sub}</p> : null}
        {kpi.compare ? <p className="truncate text-xs text-text-muted">{kpi.compare}</p> : null}
      </div>
    </CardContent>
  );
  if (!kpi.drill) return <Card className="h-full min-w-0">{body}</Card>;
  return (
    <DrillLink
      target={kpi.drill}
      label={`Mở danh sách theo ${kpi.label}`}
      className="block h-full min-w-0 rounded-card transition-colors hover:border-border-strong focus-visible:outline-2"
    >
      <Card className="h-full min-w-0 hover:bg-surface-subtle">{body}</Card>
    </DrillLink>
  );
}

export function KpiRow({ kpis, loading }: { kpis: DashKpi[]; loading?: boolean }) {
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {loading
        ? Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="min-w-0">
              <CardContent className="space-y-2 pt-(--card-pad)">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        : kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}
    </section>
  );
}

export function DashPanel({
  title,
  hint,
  action,
  loading,
  error,
  onRetry,
  empty,
  className,
  children,
}: {
  title: string;
  hint?: string;
  action?: { target: DrillTarget; label: string };
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <CardTitle className="min-w-0 text-base">
          {hint ? <HintLabel label={title} hint={hint} /> : title}
        </CardTitle>
        {action ? (
          <DrillLink
            target={action.target}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-text-muted hover:text-text-primary"
          >
            {action.label}
            <ChevronRight className="size-3.5" aria-hidden />
          </DrillLink>
        ) : null}
      </CardHeader>
      <CardContent className="min-w-0 flex-1 pt-0">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <ErrorState
            title="Không tải được dữ liệu"
            description={error}
            {...(onRetry ? { onRetry } : {})}
          />
        ) : empty ? (
          <EmptyState variant="compact" title={empty} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: DashTone;
}) {
  return (
    <div className="min-w-0 rounded-control border border-border-default px-3 py-2">
      <p className="truncate text-xs text-text-muted">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", TONE_CLASS[tone])}>{value}</p>
    </div>
  );
}

export function RateBar({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
      <div className="h-full rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
