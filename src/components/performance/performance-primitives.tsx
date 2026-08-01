import * as React from "react";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * PERFORMANCE — khối hiển thị dùng chung cho Dashboard hiệu suất.
 * Không tạo điểm tổng, không xếp hạng: chỉ mô tả số liệu kèm cách tính.
 */
export function MetricLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Cách tính: ${label}`}
            className="text-text-muted hover:text-text-primary"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-xs">{hint}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function MetricCard({
  label,
  hint,
  value,
  sub,
  delta,
  tone = "default",
}: {
  label: string;
  hint: string;
  value: string;
  sub?: string | undefined;
  delta?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "warning"
        ? "text-status-warning"
        : tone === "error"
          ? "text-status-error"
          : "text-text-primary";
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 pt-(--card-pad)">
        <p className="text-sm text-text-secondary">
          <MetricLabel label={label} hint={hint} />
        </p>
        <p className={cn("mt-1 text-2xl font-semibold", toneClass)}>{value}</p>
        {sub ? <p className="text-xs text-text-muted">{sub}</p> : null}
        {delta ? <div className="mt-1 text-xs text-text-muted">{delta}</div> : null}
      </CardContent>
    </Card>
  );
}

export function DeltaText({
  current,
  previous,
  suffix = "",
  invert = false,
}: {
  current: number | null;
  previous: number | null;
  suffix?: string;
  invert?: boolean;
}) {
  if (current === null || previous === null) return <span>Kỳ trước: —</span>;
  const diff = current - previous;
  const rounded = Math.abs(diff) < 0.0001 ? 0 : diff;
  const tone =
    rounded === 0
      ? "text-text-muted"
      : (rounded > 0) !== invert
        ? "text-status-success"
        : "text-status-warning";
  const sign = rounded > 0 ? "+" : "";
  return (
    <span className={tone}>
      Kỳ trước {previous}
      {suffix} · {sign}
      {Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}
      {suffix}
    </span>
  );
}

export function PanelCard({
  title,
  hint,
  children,
  empty,
}: {
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
  empty?: string | undefined;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">
          {hint ? <MetricLabel label={title} hint={hint} /> : title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 pt-0">
        {empty ? <EmptyState variant="compact" title={empty} /> : children}
      </CardContent>
    </Card>
  );
}
