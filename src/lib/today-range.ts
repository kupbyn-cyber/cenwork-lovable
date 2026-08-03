/**
 * TODAY-RESET-01 — phạm vi thời gian dùng chung cho toàn bộ CEN Today.
 * File thuần: chỉ tính mốc thời gian theo giờ Hà Nội (UTC+7, không có DST).
 * Không chứa Business Rule; các chỉ số vẫn giữ nguyên định nghĩa sẵn có.
 */
export type TodayRange = "today" | "week" | "month";

export const TODAY_RANGES: TodayRange[] = ["today", "week", "month"];

export const RANGE_LABEL: Record<TodayRange, string> = {
  today: "Hôm nay",
  week: "Tuần",
  month: "Tháng",
};

/** Cụm từ dùng trong câu nhắc và nhãn KPI. */
export const RANGE_PHRASE: Record<TodayRange, string> = {
  today: "hôm nay",
  week: "tuần này",
  month: "tháng này",
};

export const RANGE_DUE_LABEL: Record<TodayRange, string> = {
  today: "Đến hạn hôm nay",
  week: "Đến hạn tuần này",
  month: "Đến hạn tháng này",
};

const HANOI_OFFSET_MS = 7 * 60 * 60 * 1000;

interface HanoiParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
}

export function hanoiParts(now: Date = new Date()): HanoiParts {
  const shifted = new Date(now.getTime() + HANOI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
  };
}

/** 00:00 giờ Hà Nội của một ngày cụ thể, quy về epoch ms. */
function hanoiMidnightMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - HANOI_OFFSET_MS;
}

export interface RangeBounds {
  /** >= start */
  start: number;
  /** < end */
  end: number;
}

/**
 * Hôm nay: 00:00 hôm nay → trước 00:00 ngày kế tiếp.
 * Tuần: 00:00 thứ Hai → trước 00:00 thứ Hai kế tiếp.
 * Tháng: 00:00 ngày 1 → trước 00:00 ngày 1 tháng kế tiếp.
 */
export function rangeBounds(range: TodayRange, now: Date = new Date()): RangeBounds {
  const p = hanoiParts(now);
  if (range === "today") {
    return {
      start: hanoiMidnightMs(p.year, p.month, p.day),
      end: hanoiMidnightMs(p.year, p.month, p.day + 1),
    };
  }
  if (range === "week") {
    const back = (p.weekday + 6) % 7; // thứ Hai = 0
    return {
      start: hanoiMidnightMs(p.year, p.month, p.day - back),
      end: hanoiMidnightMs(p.year, p.month, p.day - back + 7),
    };
  }
  return {
    start: hanoiMidnightMs(p.year, p.month, 1),
    end: hanoiMidnightMs(p.year, p.month + 1, 1),
  };
}

/** true nếu mốc thời gian (ISO hoặc yyyy-MM-dd) nằm trong phạm vi. */
export function inRange(value: string | null | undefined, bounds: RangeBounds): boolean {
  if (!value) return false;
  const iso = value.length === 10 ? `${value}T00:00:00+07:00` : value;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return time >= bounds.start && time < bounds.end;
}

/** Ngày hiện tại theo giờ Hà Nội, định dạng "Thứ Hai, 03/08/2026". */
export function hanoiLongDate(now: Date = new Date()): string {
  const p = hanoiParts(now);
  const weekdays = [
    "Chủ nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${weekdays[p.weekday]}, ${pad(p.day)}/${pad(p.month + 1)}/${p.year}`;
}

export function hanoiGreeting(now: Date = new Date()): string {
  const hour = hanoiParts(now).hour;
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}