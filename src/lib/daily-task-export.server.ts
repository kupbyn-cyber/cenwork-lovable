/**
 * TASK-DAILY-01A — Bộ xuất dữ liệu Công việc theo ngày nghiệp vụ (.xlsx).
 *
 * Nguyên tắc:
 * - Chỉ SELECT. Không ghi dữ liệu nghiệp vụ, không đổi Business Rule.
 * - Ngày nghiệp vụ tính theo Asia/Ho_Chi_Minh (không dùng lịch UTC).
 * - Truy vấn chạy dưới danh tính viewer báo cáo hiện có (CEN_AI_VIEWER_USER_ID)
 *   nên RLS hiện tại vẫn là ranh giới quyền — không bypass, không mở quyền.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createUserDataClient } from "@/lib/db/server-client.server";
import { hanoiToUtcISO } from "@/lib/datetime";

export const DAILY_EXPORT_SHEET = "Tasks";

/** Thứ tự cột là data contract ổn định cho các package automation sau. */
export const DAILY_EXPORT_COLUMNS = [
  "business_date",
  "exported_at",
  "task_id",
  "task_name",
  "task_status",
  "priority",
  "work_weight",
  "approval_status",
  "created_at",
  "start_date",
  "deadline",
  "completed_at",
  "cancelled_at",
  "project_id",
  "project_name",
  "team_id",
  "team_name",
  "assignee_id",
  "assignee_name",
  "reviewer_id",
  "reviewer_name",
  "participant_ids",
  "participant_names",
  "created_on_business_date",
  "deadline_on_business_date",
  "completed_on_business_date",
  "active_on_business_date",
  "overdue_as_of_business_date",
  "days_overdue_as_of_business_date",
] as const;

export type DailyExportColumn = (typeof DAILY_EXPORT_COLUMNS)[number];
export type DailyExportRow = Record<DailyExportColumn, string | number>;

export class DailyExportError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const PAGE_SIZE = 1000;
const DAY_MS = 86_400_000;

interface TaskRecord {
  id: string;
  name: string;
  status: string;
  priority: string;
  work_weight: number | null;
  approval_status: string;
  created_at: string;
  start_date: string | null;
  deadline: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  project_id: string | null;
  team_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
}

export function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Khoảng [start, end) của ngày nghiệp vụ theo giờ Hà Nội, biểu diễn bằng epoch ms UTC. */
export function businessDayWindow(businessDate: string): { startMs: number; endMs: number } {
  const startIso = hanoiToUtcISO(businessDate, "00:00");
  const nextDay = new Date(Date.parse(`${businessDate}T00:00:00Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
  const endIso = hanoiToUtcISO(nextDay, "00:00");
  if (!startIso || !endIso) throw new DailyExportError("INVALID_DATE", "Ngày nghiệp vụ không hợp lệ.");
  return { startMs: Date.parse(startIso), endMs: Date.parse(endIso) };
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(parsed) ? null : parsed;
}

function bool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

/** Mốc 00:00 giờ Hà Nội của thời điểm chứa `instantMs` (dùng để đếm ngày trễ). */
function hanoiDayIndex(instantMs: number): number {
  return Math.floor((instantMs + 7 * 3_600_000) / DAY_MS);
}

async function fetchAll<T>(
  build: () => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new DailyExportError("QUERY_FAILED", error.message ?? "Không đọc được dữ liệu.");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

export interface DailyExportResult {
  businessDate: string;
  fileName: string;
  exportedAt: string;
  rows: DailyExportRow[];
}

/**
 * Danh tính đọc dữ liệu cho báo cáo điều hành.
 * Không có cấu hình hợp lệ → báo PERMISSION GAP thay vì tự tạo bypass.
 */
function reportingViewerId(): string {
  const viewerId = (process.env["CEN_AI_VIEWER_USER_ID"] ?? "").trim();
  if (!viewerId) {
    throw new DailyExportError(
      "PERMISSION_GAP",
      "PERMISSION GAP: chưa cấu hình CEN_AI_VIEWER_USER_ID — không có execution context đọc toàn tổ chức.",
    );
  }
  return viewerId;
}

export async function collectDailyTaskRows(businessDate: string): Promise<DailyExportResult> {
  if (!isValidBusinessDate(businessDate)) {
    throw new DailyExportError("INVALID_DATE", "business_date phải có dạng YYYY-MM-DD.");
  }
  const { startMs, endMs } = businessDayWindow(businessDate);
  const endIso = new Date(endMs).toISOString();
  const client = createUserDataClient(reportingViewerId());

  const tasks = await fetchAll<TaskRecord>(() =>
    client
      .from("tasks")
      .select(
        "id,name,status,priority,work_weight,approval_status,created_at,start_date,deadline,completed_at,cancelled_at,project_id,team_id,assignee_id,reviewer_id",
      )
      .is("deleted_at", null)
      .lt("created_at", endIso)
      .order("id", { ascending: true }),
  );

  const [projects, teams, participants] = await Promise.all([
    fetchAll<{ id: string; name: string | null }>(() =>
      client.from("projects").select("id,name").order("id", { ascending: true }),
    ),
    fetchAll<{ id: string; name: string | null }>(() =>
      client.from("teams").select("id,name").order("id", { ascending: true }),
    ),
    fetchAll<{ task_id: string; user_id: string }>(() =>
      client
        .from("task_participants")
        .select("task_id,user_id")
        .order("task_id", { ascending: true }),
    ),
  ]);

  const directory = await client.rpc("member_directory");
  const memberName = new Map<string, string>();
  for (const row of ((directory.data ?? []) as { id: string; display_name: string | null }[])) {
    if (row.id && row.display_name) memberName.set(row.id, row.display_name);
  }
  const projectName = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const teamName = new Map(teams.map((t) => [t.id, t.name ?? ""]));
  const byTask = new Map<string, string[]>();
  for (const row of participants) {
    const list = byTask.get(row.task_id) ?? [];
    list.push(row.user_id);
    byTask.set(row.task_id, list);
  }

  const exportedAt = new Date().toISOString();
  const businessDayIdx = hanoiDayIndex(startMs);
  const rows: DailyExportRow[] = [];

  for (const task of tasks) {
    const created = ms(task.created_at);
    const deadline = ms(task.deadline);
    const completed = ms(task.completed_at);
    const cancelled = ms(task.cancelled_at);
    if (created === null || created >= endMs) continue;

    const completedBeforeEnd = completed !== null && completed < endMs;
    const cancelledBeforeEnd = cancelled !== null && cancelled < endMs;
    const createdOn = created >= startMs && created < endMs;
    const deadlineOn = deadline !== null && deadline >= startMs && deadline < endMs;
    const completedOn = completed !== null && completed >= startMs && completed < endMs;
    const active =
      (completed === null || completed >= startMs) && (cancelled === null || cancelled >= startMs);
    const overdue =
      deadline !== null && deadline < endMs && !completedBeforeEnd && !cancelledBeforeEnd;
    const daysOverdue = overdue && deadline !== null
      ? Math.max(0, businessDayIdx - hanoiDayIndex(deadline))
      : 0;

    if (!(createdOn || deadlineOn || completedOn || active || overdue)) continue;

    const participantIds = byTask.get(task.id) ?? [];
    rows.push({
      business_date: businessDate,
      exported_at: exportedAt,
      task_id: task.id,
      task_name: task.name,
      task_status: task.status,
      priority: task.priority,
      work_weight: task.work_weight ?? 0,
      approval_status: task.approval_status,
      created_at: text(task.created_at),
      start_date: text(task.start_date),
      deadline: text(task.deadline),
      completed_at: text(task.completed_at),
      cancelled_at: text(task.cancelled_at),
      project_id: text(task.project_id),
      project_name: task.project_id ? (projectName.get(task.project_id) ?? "") : "",
      team_id: text(task.team_id),
      team_name: task.team_id ? (teamName.get(task.team_id) ?? "") : "",
      assignee_id: text(task.assignee_id),
      assignee_name: task.assignee_id ? (memberName.get(task.assignee_id) ?? "") : "",
      reviewer_id: text(task.reviewer_id),
      reviewer_name: task.reviewer_id ? (memberName.get(task.reviewer_id) ?? "") : "",
      participant_ids: participantIds.join(";"),
      participant_names: participantIds.map((id) => memberName.get(id) ?? id).join(";"),
      created_on_business_date: bool(createdOn),
      deadline_on_business_date: bool(deadlineOn),
      completed_on_business_date: bool(completedOn),
      active_on_business_date: bool(active),
      overdue_as_of_business_date: bool(overdue),
      days_overdue_as_of_business_date: daysOverdue,
    });
  }

  rows.sort((a, b) => {
    const byTeam = String(a.team_name).localeCompare(String(b.team_name), "vi");
    if (byTeam) return byTeam;
    const byAssignee = String(a.assignee_name).localeCompare(String(b.assignee_name), "vi");
    if (byAssignee) return byAssignee;
    const overdueRank =
      Number(b.overdue_as_of_business_date === "TRUE") -
      Number(a.overdue_as_of_business_date === "TRUE");
    if (overdueRank) return overdueRank;
    const byDeadline = String(a.deadline).localeCompare(String(b.deadline));
    if (byDeadline) return byDeadline;
    return String(a.task_name).localeCompare(String(b.task_name), "vi");
  });

  return {
    businessDate,
    fileName: `CEN_DAILY_TASKS_${businessDate}.xlsx`,
    exportedAt,
    rows,
  };
}

/** Tạo workbook .xlsx (một sheet `Tasks`) từ dữ liệu đã gom. */
export async function buildDailyTaskWorkbook(result: DailyExportResult): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(result.exportedAt);
  const sheet = workbook.addWorksheet(DAILY_EXPORT_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = DAILY_EXPORT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: Math.min(42, Math.max(14, key.length + 4)),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of result.rows) sheet.addRow(row);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: DAILY_EXPORT_COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** Điểm vào dùng chung: business_date → file .xlsx trong bộ nhớ. */
export async function generateDailyTaskReport(businessDate: string): Promise<{
  fileName: string;
  rowCount: number;
  content: Uint8Array;
}> {
  const result = await collectDailyTaskRows(businessDate);
  const content = await buildDailyTaskWorkbook(result);
  return { fileName: result.fileName, rowCount: result.rows.length, content };
}
