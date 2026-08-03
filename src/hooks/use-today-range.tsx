import * as React from "react";

import type { TodayRange } from "@/lib/today-range";
import { rangeBounds, type RangeBounds } from "@/lib/today-range";

/**
 * TODAY-RESET-01 — state phạm vi thời gian duy nhất của Dashboard.
 * Không lưu vào localStorage: mỗi lần mở/reload luôn quay về "Hôm nay".
 */
interface TodayRangeValue {
  range: TodayRange;
  setRange: (next: TodayRange) => void;
  bounds: RangeBounds;
}

const TodayRangeContext = React.createContext<TodayRangeValue | null>(null);

export function TodayRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<TodayRange>("today");
  const bounds = React.useMemo(() => rangeBounds(range), [range]);
  const value = React.useMemo<TodayRangeValue>(() => ({ range, setRange, bounds }), [range, bounds]);
  return <TodayRangeContext.Provider value={value}>{children}</TodayRangeContext.Provider>;
}

export function useTodayRange(): TodayRangeValue {
  const ctx = React.useContext(TodayRangeContext);
  if (!ctx) throw new Error("useTodayRange phải nằm trong TodayRangeProvider");
  return ctx;
}