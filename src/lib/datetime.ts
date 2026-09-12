/**
 * CEN 1.0 — Tiện ích ngày giờ dùng chung.
 *
 * Quy ước nghiệp vụ duy nhất:
 * - Database lưu thời điểm theo UTC (timestamptz).
 * - Toàn bộ UI và nội dung nghiệp vụ hiển thị theo múi giờ Hà Nội.
 * - Không cộng/trừ cứng số giờ ở bất kỳ component nào: offset được tính từ
 *   Intl API theo timezone nghiệp vụ, nên tự đúng kể cả khi quy tắc thay đổi.
 */

export const CEN_TIMEZONE = "Asia/Ho_Chi_Minh";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CEN_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map["year"]),
    month: Number(map["month"]),
    day: Number(map["day"]),
    hour: Number(map["hour"] === "24" ? "0" : map["hour"]),
    minute: Number(map["minute"]),
    second: Number(map["second"]),
  };
}

/** Offset (mili giây) của múi giờ nghiệp vụ tại thời điểm `date`. */
function zoneOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Ngày `yyyy-MM-dd` hiện tại theo giờ Hà Nội — không phụ thuộc múi giờ máy người dùng. */
export function hanoiToday(): string {
  const p = zonedParts(new Date());
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `yyyy-MM-dd` + `HH:mm` giờ Hà Nội → ISO UTC để lưu database. */
export function hanoiToUtcISO(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  const naiveUtc = Date.UTC(y!, m! - 1, d!, hh!, mm!, 0);
  // Ước lượng rồi hiệu chỉnh một vòng để chính xác quanh mốc đổi offset.
  let instant = new Date(naiveUtc - zoneOffsetMs(new Date(naiveUtc)));
  instant = new Date(naiveUtc - zoneOffsetMs(instant));
  return instant.toISOString();
}

/** ISO UTC → `{ date: 'yyyy-MM-dd', time: 'HH:mm' }` theo giờ Hà Nội (cho input form). */
export function utcToHanoiInputs(value: string | null): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  const p = zonedParts(parsed);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Hiển thị `dd/MM/yyyy` theo giờ Hà Nội. */
export function formatHanoiDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const p = zonedParts(parsed);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** Hiển thị `dd/MM/yyyy HH:mm` theo giờ Hà Nội. */
export function formatHanoiDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const p = zonedParts(parsed);
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Chỉ giờ phút `HH:mm` theo giờ Hà Nội. */
export function formatHanoiTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const p = zonedParts(parsed);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Mốc 00:00 giờ Hà Nội của một ngày `yyyy-MM-dd`, tính bằng epoch ms. */
export function hanoiStartOfDayMs(dateStr: string): number | null {
  const iso = hanoiToUtcISO(dateStr, "00:00");
  return iso ? new Date(iso).getTime() : null;
}

/** true nếu thời điểm UTC đã qua so với hiện tại. */
export function isPastInstant(value: string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

/** Nhận diện chuỗi ISO thời điểm (để định dạng trong Audit Log). */
export function isIsoInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}
