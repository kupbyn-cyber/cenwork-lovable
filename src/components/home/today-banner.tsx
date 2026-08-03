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
          <h1 className="min-w-0 text-2xl font-semibold leading-tight tracking-tight text-text-primary sm:text-3xl lg:text-4xl">
            {hanoiGreeting()},{" "}
            <span className="bg-gradient-to-r from-brand-primary via-accent-yellow to-accent-orange bg-clip-text text-transparent">
              {name}
            </span>
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
          className="flex shrink-0 flex-wrap gap-1 rounded-control border border-border-default bg-surface-subtle p-1"
          role="group"
          aria-label="Phạm vi thời gian"
        >
          {TODAY_RANGES.map((option: TodayRange) => (
            <Button
              key={option}
              size="sm"
              variant={option === range ? "primary" : "ghost"}
              aria-pressed={option === range}
              className={cn("min-w-[76px]")}
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