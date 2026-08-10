/**
 * CEN-VIEW-REPORT-UX-COMPACT-01 — cấu trúc dùng chung cho Báo cáo ngày.
 * Form tạo và màn hình xem chi tiết cùng đọc 3 phần:
 * (1) Task đã hoàn thành hôm nay, (2) Tổng quan công việc còn lại, (3) Ghi chú / Ý kiến cá nhân.
 * Báo cáo cũ chỉ có text vẫn tách được tương đối, không làm mất dữ liệu.
 */

export interface DailyReportItem {
  name: string;
  result: string;
  projectName: string | null;
  completedAt?: string | null;
}

export interface DailyReportCounts {
  open: number;
  overdue: number;
  review: number;
}

export interface DailyReportContent {
  items: DailyReportItem[];
  /** Text kết quả không tách được thành item — hiển thị nguyên văn. */
  rawResults: string;
  counts: DailyReportCounts | null;
  /** Text tổng quan cũ không đúng định dạng số liệu. */
  rawSummary: string;
  note: string;
}

const EMPTY_RESULT_MARKERS = [
  "không có task hoàn thành",
  "không có công việc hoàn thành",
];

export const NO_NOTE_TEXT = "Không có ghi chú.";

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text === "null" || text === "undefined" || text === "[object Object]") return "";
  return text;
}

/** Một dòng nội dung: `Tên task (Dự án) — kết quả`. */
export function formatDailyItemLine(item: {
  name: string;
  result: string;
  projectName?: string | null;
}): string {
  const project = clean(item.projectName);
  const head = project ? `${item.name} (${project})` : item.name;
  return `${head} — ${item.result}`;
}

function parseItemLine(line: string): DailyReportItem | null {
  const text = clean(line).replace(/^[-•*\d.)\s]+/, "").trim();
  if (!text) return null;
  const match = text.match(/^([\s\S]*?)\s+[—–]\s+([\s\S]+)$/);
  const namePart = clean(match?.[1] ?? text);
  const result = clean(match?.[2] ?? "");
  if (!namePart) return null;
  const projectMatch = namePart.match(/^([\s\S]*?)\s*\(([^()]+)\)$/);
  return {
    name: clean(projectMatch?.[1] ?? namePart),
    projectName: clean(projectMatch?.[2] ?? "") || null,
    result,
  };
}

function parseCounts(value: string): DailyReportCounts | null {
  const pick = (label: RegExp) => {
    const match = value.match(label);
    return match ? Number(match[1]) : null;
  };
  const open = pick(/còn mở\s*:\s*(\d+)/i);
  const overdue = pick(/quá hạn\s*:\s*(\d+)/i);
  const review = pick(/chờ kiểm tra\s*:\s*(\d+)/i);
  if (open === null && overdue === null && review === null) return null;
  return { open: open ?? 0, overdue: overdue ?? 0, review: review ?? 0 };
}

/** Đọc báo cáo đã lưu (mới lẫn cũ) về cấu trúc 3 phần. */
export function parseDailyReportContent(report: {
  results?: string | null;
  blockers?: string | null;
  next_plan?: string | null;
}): DailyReportContent {
  const results = clean(report.results);
  const summary = clean(report.blockers);
  const note = clean(report.next_plan);

  const isEmptyResults =
    results === "" ||
    EMPTY_RESULT_MARKERS.some((marker) => results.toLowerCase().startsWith(marker));

  const lines = isEmptyResults ? [] : results.split(/\r?\n/);
  const items = lines
    .map(parseItemLine)
    .filter((item): item is DailyReportItem => item !== null);

  // Chỉ coi là tách được khi có ít nhất một item kèm kết quả rõ ràng.
  const parsed = items.length > 0 && items.some((item) => item.result !== "");

  const counts = parseCounts(summary);

  return {
    items: parsed ? items : [],
    rawResults: parsed || isEmptyResults ? "" : results,
    counts,
    rawSummary: counts ? "" : summary,
    note: note === NO_NOTE_TEXT ? "" : note,
  };
}

/** Nhóm theo Dự án khi báo cáo có từ 2 dự án trở lên. */
export function groupItemsByProject(
  items: DailyReportItem[],
): { project: string; items: DailyReportItem[] }[] {
  const map = new Map<string, DailyReportItem[]>();
  for (const item of items) {
    const key = item.projectName ?? "Công việc độc lập";
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()].map(([project, list]) => ({ project, items: list }));
}

/** Tóm tắt gọn cho cột "Kết quả" trong danh sách báo cáo. */
export function summarizeDailyResults(report: {
  results?: string | null;
  blockers?: string | null;
  next_plan?: string | null;
}): { count: number; highlights: string[]; fallback: string } {
  const content = parseDailyReportContent(report);
  if (content.items.length > 0) {
    return {
      count: content.items.length,
      highlights: content.items
        .slice(0, 2)
        .map((item) => (item.result ? `${item.name} — ${item.result}` : item.name)),
      fallback: "",
    };
  }
  return { count: 0, highlights: [], fallback: content.rawResults };
}
