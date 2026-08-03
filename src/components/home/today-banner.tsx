import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudSun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTodayRange } from "@/hooks/use-today-range";
import { getHanoiWeather } from "@/lib/weather.functions";
import { cn } from "@/lib/utils";
import {
  hanoiGreeting,
  hanoiLongDate,
  RANGE_LABEL,
  TODAY_RANGES,
  type TodayRange,
} from "@/lib/today-range";

/**
 * TODAY-RESET-01 — Hàng 1: banner chào mừng full width.
 * Ngày và thời tiết luôn theo thời điểm hiện tại; bộ lọc chỉ điều khiển dữ liệu Dashboard.
 */
export function TodayBanner({ name, prompt }: { name: string; prompt: string }) {
  const { range, setRange } = useTodayRange();
  const fetchWeather = useServerFn(getHanoiWeather);
  const weather = useQuery({
    queryKey: ["hanoi-weather"],
    queryFn: () => fetchWeather(),
    staleTime: 30 * 60_000,
    retry: false,
  });

  return (
    <section className="cen-hero-surface cen-hairlines rounded-container border border-border-default px-5 py-6 shadow-level-2 sm:px-7 sm:py-7">
      <div className="relative z-[1] flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/brand/logo-mark.svg"
              alt="CEN WORK"
              className="size-6 shrink-0"
              loading="lazy"
            />
            <span className="text-caption font-semibold tracking-[0.28em] text-accent-yellow uppercase">
              Marketing Command Center
            </span>
          </div>
          <h1 className="min-w-0 text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl lg:text-4xl">
            {hanoiGreeting()}, {name}
          </h1>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-helper text-text-secondary">
            <span>{hanoiLongDate()}</span>
            <span aria-hidden="true">·</span>
            <span>Hà Nội</span>
            {weather.data ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <CloudSun className="size-icon-sm text-text-muted" aria-hidden="true" />
                  {weather.data.temperature}°C · {weather.data.description}
                </span>
              </>
            ) : null}
          </p>
          <p className="min-w-0 text-body text-text-secondary">{prompt}</p>
        </div>

        <div
          className="flex shrink-0 flex-wrap gap-1 self-start rounded-card border border-border-default bg-background p-1.5 shadow-level-2 lg:mt-auto lg:self-end"
          role="group"
          aria-label="Phạm vi thời gian"
        >
          {TODAY_RANGES.map((option: TodayRange) => (
            <Button
              key={option}
              size="md"
              variant={option === range ? "primary" : "ghost"}
              aria-pressed={option === range}
              className={cn(
                "min-w-[104px] font-semibold",
                option === range ? "shadow-level-2" : "text-text-secondary",
              )}
              onClick={() => setRange(option)}
            >
              {RANGE_LABEL[option]}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}