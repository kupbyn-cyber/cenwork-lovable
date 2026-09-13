/**
 * CEN-AI-READ-01 — API đọc dữ liệu (read-only) cho GPT "CEN Analyst".
 *
 * Nguyên tắc:
 * - Chỉ SELECT. Không có bất kỳ nhánh code nào ghi dữ liệu nghiệp vụ.
 * - Truy vấn chạy dưới danh tính CEN_AI_VIEWER_USER_ID → RLS hiện có là ranh giới quyền.
 * - Không nhận SQL/tên bảng/tên cột từ client: resource, filter, sort đều theo allowlist.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createUserDataClient, createPrivilegedDataClient } from "@/lib/db/server-client.server";
import {
  createEntityResolver,
  EntityResolveError,
  type EntityType,
  type ResolvedFilterMeta,
} from "@/lib/ai-read-resolve.server";
import { shiftConfirmationStateOf, type ShiftConfirmationState } from "@/lib/daily-report-shift";

export const AI_READ_RESOURCES = [
  "tasks",
  "projects",
  "reports",
  "daily_reports",
  "announcements",
  "approvals",
  "performance",
  "members",
] as const;
export type AiReadResource = (typeof AI_READ_RESOURCES)[number];

export const AI_READ_LIMIT_DEFAULT = 100;
export const AI_READ_LIMIT_MAX = 500;

export interface AiReadRequest {
  resource: string;
  filters?: Record<string, unknown>;
  sort?: { field?: string; direction?: string } | null;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AiReadError {
  error: {
    code: string;
    message: string;
    allowed_filters?: string[];
    allowed_values?: string[];
    entity_type?: string;
    query?: string;
    candidates?: unknown[];
  };
}

export interface AiReadSuccess {
  resource: AiReadResource;
  data: unknown[];
  meta: {
    count: number;
    limit: number;
    offset: number;
    has_more: boolean;
    resolved_filters?: Record<string, ResolvedFilterMeta>;
  };
}

export type AiReadResult =
  { status: number; body: AiReadSuccess } | { status: number; body: AiReadError };

type FilterKind = "uuid" | "text" | "bool" | "date";

interface FilterDef {
  kind: FilterKind;
  /** Cột trong bảng; bỏ trống khi filter được xử lý riêng. */
  column?: string;
  op?: "eq" | "gte" | "lte" | "ilike";
  custom?: true;
}

interface ResourceDef {
  table: string;
  fields: string;
  sortable: string[];
  defaultSort: { field: string; ascending: boolean };
  filters: Record<string, FilterDef>;
}

const TASK_FIELDS =
  "id,name,status,priority,work_weight,deadline,start_date,completed_at,approval_status," +
  "project_id,assignee_id,team_id,reviewer_id,created_at,updated_at,cancelled_at";

const PROJECT_FIELDS =
  "id,name,objective,status,start_date,deadline,completed_at,owner_id,responsible_team_id," +
  "created_at,updated_at";

const REPORT_FIELDS =
  "id,report_type,period_key,status,author_id,team_id,project_id,due_at,first_submitted_at," +
  "last_submitted_at,reviewer_id,confirmed_at,current_version,revision_round,created_at,updated_at";

const MEMBER_FIELDS =
  "id,display_name,email,job_title,primary_team_id,status,locked_at,created_at,updated_at";

/**
 * CEN-N8N-R02A — Daily Report thật (bảng `daily_reports`, khác hoàn toàn bảng
 * `reports` generic ở resource "reports" — không dùng chung, không đổi resource cũ).
 */
const DAILY_REPORT_FIELDS =
  "id,report_date,author_id,team_id,status,results,blockers,next_plan,reviewer_id,review_note," +
  "submitted_at,reviewed_at";

const ANNOUNCEMENT_FIELDS =
  "id,title,body,status,due_at,published_at,created_by,created_at,updated_at";

const APPROVAL_FIELDS =
  "id,title,content,sender_id,approval_mode,status,due_at,current_version,approved_at," +
  "rejected_at,withdrawn_at,created_at,updated_at";

const RESOURCES: Record<Exclude<AiReadResource, "performance">, ResourceDef> = {
  tasks: {
    table: "tasks",
    fields: TASK_FIELDS,
    sortable: [
      "deadline",
      "created_at",
      "updated_at",
      "completed_at",
      "priority",
      "status",
      "name",
    ],
    defaultSort: { field: "deadline", ascending: true },
    filters: {
      status: { kind: "text", column: "status", op: "eq" },
      project: { kind: "uuid", column: "project_id", op: "eq" },
      assignee: { kind: "uuid", column: "assignee_id", op: "eq" },
      member: { kind: "uuid", column: "assignee_id", op: "eq" },
      team: { kind: "uuid", column: "team_id", op: "eq" },
      priority: { kind: "text", column: "priority", op: "eq" },
      overdue: { kind: "bool", custom: true },
      from: { kind: "date", column: "deadline", op: "gte" },
      to: { kind: "date", column: "deadline", op: "lte" },
      search: { kind: "text", column: "name", op: "ilike" },
    },
  },
  projects: {
    table: "projects",
    fields: PROJECT_FIELDS,
    sortable: ["deadline", "created_at", "updated_at", "completed_at", "status", "name"],
    defaultSort: { field: "deadline", ascending: true },
    filters: {
      status: { kind: "text", column: "status", op: "eq" },
      leader: { kind: "uuid", column: "owner_id", op: "eq" },
      owner: { kind: "uuid", column: "owner_id", op: "eq" },
      team: { kind: "uuid", column: "responsible_team_id", op: "eq" },
      from: { kind: "date", column: "deadline", op: "gte" },
      to: { kind: "date", column: "deadline", op: "lte" },
      search: { kind: "text", column: "name", op: "ilike" },
    },
  },
  reports: {
    table: "reports",
    fields: REPORT_FIELDS,
    sortable: ["due_at", "created_at", "updated_at", "last_submitted_at", "status", "period_key"],
    defaultSort: { field: "due_at", ascending: false },
    filters: {
      report_type: { kind: "text", column: "report_type", op: "eq" },
      author: { kind: "uuid", column: "author_id", op: "eq" },
      member: { kind: "uuid", column: "author_id", op: "eq" },
      team: { kind: "uuid", column: "team_id", op: "eq" },
      project: { kind: "uuid", column: "project_id", op: "eq" },
      status: { kind: "text", column: "status", op: "eq" },
      from: { kind: "date", column: "due_at", op: "gte" },
      to: { kind: "date", column: "due_at", op: "lte" },
      search: { kind: "text", column: "period_key", op: "ilike" },
    },
  },
  daily_reports: {
    table: "daily_reports",
    fields: DAILY_REPORT_FIELDS,
    sortable: ["report_date", "submitted_at", "reviewed_at", "status"],
    defaultSort: { field: "report_date", ascending: false },
    filters: {
      status: { kind: "text", column: "status", op: "eq" },
      author: { kind: "uuid", column: "author_id", op: "eq" },
      member: { kind: "uuid", column: "author_id", op: "eq" },
      team: { kind: "uuid", column: "team_id", op: "eq" },
      from: { kind: "date", column: "report_date", op: "gte" },
      to: { kind: "date", column: "report_date", op: "lte" },
    },
  },
  announcements: {
    table: "announcements",
    fields: ANNOUNCEMENT_FIELDS,
    sortable: ["published_at", "due_at", "created_at", "updated_at"],
    defaultSort: { field: "published_at", ascending: false },
    filters: {
      status: { kind: "text", column: "status", op: "eq" },
      creator: { kind: "uuid", column: "created_by", op: "eq" },
      from: { kind: "date", column: "published_at", op: "gte" },
      to: { kind: "date", column: "published_at", op: "lte" },
    },
  },
  approvals: {
    table: "approval_requests",
    fields: APPROVAL_FIELDS,
    sortable: ["due_at", "created_at", "updated_at", "status"],
    defaultSort: { field: "due_at", ascending: true },
    filters: {
      status: { kind: "text", column: "status", op: "eq" },
      sender: { kind: "uuid", column: "sender_id", op: "eq" },
      mode: { kind: "text", column: "approval_mode", op: "eq" },
      from: { kind: "date", column: "due_at", op: "gte" },
      to: { kind: "date", column: "due_at", op: "lte" },
    },
  },
  members: {
    table: "profiles",
    fields: MEMBER_FIELDS,
    // Danh bạ (member_directory) không trả created_at/updated_at.
    sortable: ["display_name", "status"],
    defaultSort: { field: "display_name", ascending: true },
    filters: {
      team: { kind: "uuid", column: "primary_team_id", op: "eq" },
      status: { kind: "text", column: "status", op: "eq" },
      active: { kind: "bool", custom: true },
      role: { kind: "text", custom: true },
      search: { kind: "text", custom: true },
    },
  },
};

const PERFORMANCE_FILTERS = ["member", "team", "from", "to", "metric"];

/**
 * CEN-AI-READ-01.3 — filter nào nhận tên người dùng hiểu được (hoặc UUID / mảng).
 * Leader/Owner/Author/Assignee đều dùng chung Member Resolver.
 */
const ENTITY_FILTERS: Record<AiReadResource, Record<string, EntityType>> = {
  tasks: { team: "team", assignee: "member", member: "member", project: "project" },
  projects: { team: "team", leader: "member", owner: "member" },
  reports: { team: "team", author: "member", member: "member", project: "project" },
  daily_reports: { team: "team", author: "member", member: "member" },
  announcements: { creator: "member" },
  approvals: { sender: "member" },
  performance: { team: "team", member: "member" },
  members: { team: "team" },
};

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(code: string, message: string, extra?: Record<string, unknown>): AiReadResult {
  return { status: 400, body: { error: { code, message, ...extra } } as AiReadError };
}

function allowedFilterList(resource: AiReadResource): string[] {
  if (resource === "performance") return PERFORMANCE_FILTERS;
  return Object.keys(RESOURCES[resource as Exclude<AiReadResource, "performance">].filters);
}

function coerce(value: unknown, kind: FilterKind, key: string): unknown {
  if (kind === "bool") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Filter "${key}" phải là true/false.`);
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Filter "${key}" phải là chuỗi khác rỗng.`);
  }
  const text = value.trim();
  if (kind === "uuid" && !UUID_RE.test(text)) throw new Error(`Filter "${key}" phải là UUID.`);
  if (kind === "date" && !DAY_RE.test(text) && Number.isNaN(Date.parse(text))) {
    throw new Error(`Filter "${key}" phải là ngày yyyy-MM-dd hoặc ISO datetime.`);
  }
  return text;
}

/** yyyy-MM-dd → mốc UTC đầu/cuối ngày theo giờ Hà Nội. */
function dayBound(value: string, edge: "start" | "end"): string {
  if (!DAY_RE.test(value)) return value;
  return edge === "start" ? `${value}T00:00:00+07:00` : `${value}T23:59:59+07:00`;
}

async function readPerformance(
  client: any,
  viewerId: string,
  filters: Record<string, unknown>,
  resolvedIds: Record<string, string[]>,
  resolvedMeta: Record<string, ResolvedFilterMeta>,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  const invalid = Object.keys(filters).filter((key) => !PERFORMANCE_FILTERS.includes(key));
  if (invalid.length > 0) {
    return badRequest("INVALID_FILTER", `Filter không hỗ trợ: ${invalid.join(", ")}.`, {
      allowed_filters: PERFORMANCE_FILTERS,
    });
  }
  const from = filters["from"];
  const to = filters["to"];
  if (
    typeof from !== "string" ||
    !DAY_RE.test(from) ||
    typeof to !== "string" ||
    !DAY_RE.test(to)
  ) {
    return badRequest("INVALID_FILTER", 'Performance cần "from" và "to" dạng yyyy-MM-dd.', {
      allowed_filters: PERFORMANCE_FILTERS,
    });
  }
  for (const key of ["team", "member"]) {
    if ((resolvedIds[key]?.length ?? 0) > 1) {
      return badRequest(
        "INVALID_FILTER",
        `Performance chỉ nhận một giá trị cho "${key}". Gọi nhiều lần để so sánh.`,
        { allowed_filters: PERFORMANCE_FILTERS },
      );
    }
  }
  const teamId = resolvedIds["team"]?.[0] ?? null;
  const memberId = resolvedIds["member"]?.[0] ?? null;

  const { resolveCallerRole } = await import("@/lib/permission-guard");
  const { buildPerformanceDashboard } = await import("@/lib/performance.server");
  const role = await resolveCallerRole(client, viewerId);
  const dashboard = await buildPerformanceDashboard(client, viewerId, role as any, {
    from,
    to,
    teamId,
    userId: memberId,
  });

  const metric = typeof filters["metric"] === "string" ? (filters["metric"] as string) : null;
  const full: Record<string, unknown> = {
    range: { from, to },
    scope: dashboard.scope,
    role: dashboard.role,
    totals: dashboard.totals,
    previous_totals: dashboard.previous_totals,
    trend: dashboard.trend,
    teams: dashboard.teams,
    team_details: dashboard.team_details,
    people: dashboard.people,
    alerts: dashboard.alerts,
    unavailable: dashboard.unavailable,
  };
  if (metric) {
    if (!(metric in full)) {
      return badRequest("INVALID_FILTER", `Chỉ số không hỗ trợ: ${metric}.`, {
        allowed_values: Object.keys(full),
      });
    }
  }
  const data = metric ? [{ metric, value: full[metric] }] : [full];
  return {
    status: 200,
    body: {
      resource: "performance",
      data,
      meta: {
        count: data.length,
        limit,
        offset,
        has_more: false,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

async function attachReportContent(client: any, rows: any[]): Promise<void> {
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data } = await client
    .from("report_sections")
    .select(
      "report_id,team_id,position,done_work,results,unfinished,blockers,next_plan,support_needed,no_work_flag,no_work_reason",
    )
    .in("report_id", ids)
    .order("position", { ascending: true });
  const grouped = new Map<string, unknown[]>();
  for (const section of (data ?? []) as any[]) {
    const list = grouped.get(section.report_id) ?? [];
    list.push(section);
    grouped.set(section.report_id, list);
  }
  for (const row of rows) row.sections = grouped.get(row.id) ?? [];
}

async function memberRoleFilter(client: any, role: string): Promise<string[]> {
  const { data } = await client.from("user_roles").select("user_id,role").eq("role", role);
  return ((data ?? []) as any[]).map((row) => row.user_id as string);
}

/**
 * CEN-AI-READ-01.2 — Members đi đúng data-access path của giao diện CEN.
 *
 * Giao diện đọc danh bạ bằng RPC `member_directory()` (SECURITY DEFINER, tự lọc
 * cột nhạy cảm theo quyền người gọi). Đọc thẳng bảng `profiles` như trước làm
 * AI Read chỉ thấy hồ sơ của chính viewer vì RLS của `profiles` rất hẹp.
 * Không mở RLS, không dùng đặc quyền — chỉ dùng lại đúng hàm UI đang dùng.
 */
async function readMembers(
  client: any,
  filters: Record<string, unknown>,
  resolvedIds: Record<string, string[]>,
  resolvedMeta: Record<string, ResolvedFilterMeta>,
  sortField: string,
  ascending: boolean,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  const { data, error } = await client.rpc("member_directory");
  const { data: teamRows } = await client.from("teams").select("id,name");
  const teamNames = new Map<string, string>();
  for (const row of (teamRows ?? []) as any[]) {
    if (row.id) teamNames.set(row.id, row.name ?? "");
  }
  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }
  let rows = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    email: row.email ?? null,
    job_title: row.job_title ?? null,
    primary_team_id: row.primary_team_id ?? null,
    team_name: row.primary_team_id ? (teamNames.get(row.primary_team_id) ?? null) : null,
    status: row.status,
    locked_at: row.locked_at ?? null,
    role: row.role ?? null,
  }));

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "team") {
        const ids = new Set(resolvedIds["team"] ?? []);
        rows = rows.filter((row) => row.primary_team_id && ids.has(row.primary_team_id));
        continue;
      }
      const value = coerce(rawValue, RESOURCES.members.filters[key]!.kind, key);
      if (key === "status") rows = rows.filter((row) => row.status === value);
      else if (key === "active") {
        rows = value
          ? rows.filter((row) => row.status === "active")
          : rows.filter((row) => row.status !== "active");
      } else if (key === "role") {
        const ids = new Set(await memberRoleFilter(client, String(value)));
        rows = rows.filter((row) => row.role === value || ids.has(row.id));
      } else if (key === "search") {
        const text = String(value).toLowerCase();
        rows = rows.filter(
          (row) =>
            String(row.display_name ?? "")
              .toLowerCase()
              .includes(text) ||
            String(row.email ?? "")
              .toLowerCase()
              .includes(text),
        );
      }
    }
  } catch (err) {
    return badRequest("INVALID_FILTER", (err as Error).message, {
      allowed_filters: Object.keys(RESOURCES.members.filters),
    });
  }

  rows.sort((a, b) => {
    const left = String((a as any)[sortField] ?? "");
    const right = String((b as any)[sortField] ?? "");
    return ascending ? left.localeCompare(right) : right.localeCompare(left);
  });

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  return {
    status: 200,
    body: {
      resource: "members",
      data: page,
      meta: {
        count: total,
        limit,
        offset,
        has_more: offset + page.length < total,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

/**
 * CEN-N8N-R02A — Trạng thái ca (WORKDAY-01) của đúng author_id + report_date,
 * dùng lại nguyên predicate `shiftConfirmationStateOf` (không suy diễn lại
 * Business Rule ca ở đây). RLS của `daily_work_records` tự giới hạn theo đúng
 * phạm vi viewer, giống hệt phạm vi RLS của `daily_reports`.
 */
async function loadShiftStatusMap(
  client: any,
  rows: { author_id: string; report_date: string }[],
): Promise<Map<string, ShiftConfirmationState>> {
  const map = new Map<string, ShiftConfirmationState>();
  if (rows.length === 0) return map;
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const reportDates = [...new Set(rows.map((row) => row.report_date))];
  const { data } = await client
    .from("daily_work_records")
    .select("user_id,work_date,day_status")
    .in("user_id", authorIds)
    .in("work_date", reportDates);
  for (const rec of (data ?? []) as {
    user_id: string;
    work_date: string;
    day_status: string | null;
  }[]) {
    map.set(`${rec.user_id}|${rec.work_date}`, shiftConfirmationStateOf(rec.day_status));
  }
  return map;
}

function mapDailyReportRow(
  row: any,
  shiftMap: Map<string, ShiftConfirmationState>,
): Record<string, unknown> {
  const author = row.author as { display_name: string } | null;
  const team = row.team as { name: string } | null;
  return {
    id: row.id,
    report_date: row.report_date,
    author_id: row.author_id,
    author_name: author?.display_name ?? null,
    team_id: row.team_id,
    team_name: team?.name ?? null,
    status: row.status,
    results: row.results,
    blockers: row.blockers,
    next_plan: row.next_plan,
    reviewer_id: row.reviewer_id,
    review_note: row.review_note,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    shift_status: shiftMap.get(`${row.author_id}|${row.report_date}`) ?? "NOT_CONFIRMED",
  };
}

/**
 * CEN-N8N-R02A — Daily Report thật cho n8n (khác bảng `reports` ở resource "reports").
 * Đọc thẳng `daily_reports` dưới đúng danh tính viewer (RLS `daily_reports_select_scoped`
 * là ranh giới quyền); chỉ enrich thêm tên hiển thị + trạng thái ca, không đổi nội dung gốc.
 */
async function readDailyReports(
  client: any,
  filters: Record<string, unknown>,
  resolvedIds: Record<string, string[]>,
  resolvedMeta: Record<string, ResolvedFilterMeta>,
  sortField: string,
  ascending: boolean,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  let query = client
    .from("daily_reports")
    .select(
      "id,report_date,author_id,team_id,status,results,blockers,next_plan,reviewer_id,review_note," +
        "submitted_at,reviewed_at," +
        "author:profiles!daily_reports_author_id_fkey(display_name)," +
        "team:teams(name)",
      { count: "exact" },
    );

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "author" || key === "member") {
        const ids = resolvedIds[key] ?? [];
        query = ids.length === 1 ? query.eq("author_id", ids[0]) : query.in("author_id", ids);
        continue;
      }
      if (key === "team") {
        const ids = resolvedIds["team"] ?? [];
        query = ids.length === 1 ? query.eq("team_id", ids[0]) : query.in("team_id", ids);
        continue;
      }
      if (key === "status") {
        query = query.eq("status", coerce(rawValue, "text", key));
        continue;
      }
      if (key === "from") {
        // report_date là cột `date` thuần — so sánh trực tiếp yyyy-MM-dd, không quy đổi múi giờ.
        query = query.gte("report_date", coerce(rawValue, "date", key));
        continue;
      }
      if (key === "to") {
        query = query.lte("report_date", coerce(rawValue, "date", key));
        continue;
      }
    }
  } catch (error) {
    return badRequest("INVALID_FILTER", (error as Error).message, {
      allowed_filters: Object.keys(RESOURCES.daily_reports.filters),
    });
  }

  const { data, error, count } = await query
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }

  const rows = (data ?? []) as any[];
  const shiftMap = await loadShiftStatusMap(client, rows);
  const total = typeof count === "number" ? count : offset + rows.length;
  return {
    status: 200,
    body: {
      resource: "daily_reports",
      data: rows.map((row) => mapDailyReportRow(row, shiftMap)),
      meta: {
        count: total,
        limit,
        offset,
        has_more: offset + rows.length < total,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

/**
 * Thông báo nhìn thấy theo RLS của viewer; trạng thái cá nhân chỉ lấy đúng dòng
 * recipient của viewer hiện tại, kể cả khi viewer có quyền xem recipient khác.
 */
async function readAnnouncements(
  client: any,
  viewerId: string,
  filters: Record<string, unknown>,
  resolvedIds: Record<string, string[]>,
  resolvedMeta: Record<string, ResolvedFilterMeta>,
  sortField: string,
  ascending: boolean,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  let query = client
    .from("announcements")
    .select(`${ANNOUNCEMENT_FIELDS},creator:profiles!announcements_created_by_fkey(display_name)`, {
      count: "exact",
    })
    .is("deleted_at", null);

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "creator") {
        const ids = resolvedIds[key] ?? [];
        query = ids.length === 1 ? query.eq("created_by", ids[0]) : query.in("created_by", ids);
        continue;
      }
      if (key === "status") {
        query = query.eq("status", coerce(rawValue, "text", key));
        continue;
      }
      if (key === "from") {
        query = query.gte(
          "published_at",
          dayBound(coerce(rawValue, "date", key) as string, "start"),
        );
        continue;
      }
      if (key === "to") {
        query = query.lte("published_at", dayBound(coerce(rawValue, "date", key) as string, "end"));
      }
    }
  } catch (error) {
    return badRequest("INVALID_FILTER", (error as Error).message, {
      allowed_filters: Object.keys(RESOURCES.announcements.filters),
    });
  }

  const { data, error, count } = await query
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }

  const rows = (data ?? []) as any[];
  const recipientByAnnouncement = new Map<
    string,
    { status: string; due_at: string; acknowledged_at: string | null }
  >();
  if (rows.length > 0) {
    const { data: recipients, error: recipientError } = await client
      .from("announcement_recipients")
      .select("announcement_id,status,due_at,acknowledged_at")
      .eq("user_id", viewerId)
      .in(
        "announcement_id",
        rows.map((row) => row.id),
      );
    if (recipientError) {
      return {
        status: 400,
        body: { error: { code: "QUERY_FAILED", message: recipientError.message } },
      };
    }
    for (const recipient of recipients ?? []) {
      recipientByAnnouncement.set(recipient.announcement_id, recipient);
    }
  }

  const total = typeof count === "number" ? count : offset + rows.length;
  return {
    status: 200,
    body: {
      resource: "announcements",
      data: rows.map((row) => {
        const recipient = recipientByAnnouncement.get(row.id);
        const creator = row.creator as { display_name: string } | null;
        return {
          id: row.id,
          title: row.title,
          body: row.body,
          status: row.status,
          due_at: row.due_at,
          published_at: row.published_at,
          created_by: row.created_by,
          creator_name: creator?.display_name ?? null,
          my_status: recipient?.status ?? null,
          my_due_at: recipient?.due_at ?? null,
          my_acknowledged_at: recipient?.acknowledged_at ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }),
      meta: {
        count: total,
        limit,
        offset,
        has_more: offset + rows.length < total,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

/**
 * Yêu cầu phê duyệt nhìn thấy theo RLS của viewer; quyết định cá nhân chỉ lấy
 * đúng approver_id của viewer và khớp current_version của từng yêu cầu.
 */
async function readApprovals(
  client: any,
  viewerId: string,
  filters: Record<string, unknown>,
  resolvedIds: Record<string, string[]>,
  resolvedMeta: Record<string, ResolvedFilterMeta>,
  sortField: string,
  ascending: boolean,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  let query = client
    .from("approval_requests")
    .select(`${APPROVAL_FIELDS},sender:profiles!approval_requests_sender_id_fkey(display_name)`, {
      count: "exact",
    })
    .is("archived_at", null);

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      if (key === "sender") {
        const ids = resolvedIds[key] ?? [];
        query = ids.length === 1 ? query.eq("sender_id", ids[0]) : query.in("sender_id", ids);
        continue;
      }
      if (key === "status") {
        query = query.eq("status", coerce(rawValue, "text", key));
        continue;
      }
      if (key === "mode") {
        query = query.eq("approval_mode", coerce(rawValue, "text", key));
        continue;
      }
      if (key === "from") {
        query = query.gte("due_at", dayBound(coerce(rawValue, "date", key) as string, "start"));
        continue;
      }
      if (key === "to") {
        query = query.lte("due_at", dayBound(coerce(rawValue, "date", key) as string, "end"));
      }
    }
  } catch (error) {
    return badRequest("INVALID_FILTER", (error as Error).message, {
      allowed_filters: Object.keys(RESOURCES.approvals.filters),
    });
  }

  const { data, error, count } = await query
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }

  const rows = (data ?? []) as any[];
  const decisionByRequestVersion = new Map<
    string,
    { decision_status: string; decision_at: string | null }
  >();
  if (rows.length > 0) {
    const { data: decisions, error: decisionError } = await client
      .from("approval_decisions")
      .select("approval_request_id,version_no,decision_status,decision_at")
      .eq("approver_id", viewerId)
      .in(
        "approval_request_id",
        rows.map((row) => row.id),
      );
    if (decisionError) {
      return {
        status: 400,
        body: { error: { code: "QUERY_FAILED", message: decisionError.message } },
      };
    }
    for (const decision of decisions ?? []) {
      decisionByRequestVersion.set(
        `${decision.approval_request_id}|${decision.version_no}`,
        decision,
      );
    }
  }

  const total = typeof count === "number" ? count : offset + rows.length;
  return {
    status: 200,
    body: {
      resource: "approvals",
      data: rows.map((row) => {
        const decision = decisionByRequestVersion.get(`${row.id}|${row.current_version}`);
        const sender = row.sender as { display_name: string } | null;
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          sender_id: row.sender_id,
          sender_name: sender?.display_name ?? null,
          approval_mode: row.approval_mode,
          status: row.status,
          due_at: row.due_at,
          current_version: row.current_version,
          my_decision_status: decision?.decision_status ?? null,
          my_decision_at: decision?.decision_at ?? null,
          approved_at: row.approved_at,
          rejected_at: row.rejected_at,
          withdrawn_at: row.withdrawn_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }),
      meta: {
        count: total,
        limit,
        offset,
        has_more: offset + rows.length < total,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

export async function runAiRead(viewerId: string, request: AiReadRequest): Promise<AiReadResult> {
  const resource = request.resource as AiReadResource;
  if (!AI_READ_RESOURCES.includes(resource)) {
    return badRequest("INVALID_RESOURCE", `Resource không hỗ trợ: ${String(request.resource)}.`, {
      allowed_values: [...AI_READ_RESOURCES],
    });
  }

  const rawLimit = Number(request.limit ?? AI_READ_LIMIT_DEFAULT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), AI_READ_LIMIT_MAX)
    : AI_READ_LIMIT_DEFAULT;
  const rawOffset = Number(request.offset ?? 0);
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  const filters = (request.filters ?? {}) as Record<string, unknown>;

  const client = createUserDataClient(viewerId) as any;
  const resolver = createEntityResolver(client);
  const resolvedIds: Record<string, string[]> = {};
  const resolvedMeta: Record<string, ResolvedFilterMeta> = {};
  for (const [key, type] of Object.entries(ENTITY_FILTERS[resource])) {
    if (!(key in filters)) continue;
    try {
      const outcome = await resolver.resolveFilter(type, filters[key]);
      resolvedIds[key] = outcome.ids;
      if (outcome.hasName) resolvedMeta[key] = outcome.meta;
    } catch (error) {
      if (error instanceof EntityResolveError) {
        return {
          status: 400,
          body: {
            error: {
              code: error.code,
              message: error.message,
              entity_type: error.entityType,
              query: error.query,
              ...(error.candidates ? { candidates: error.candidates } : {}),
            },
          },
        };
      }
      throw error;
    }
  }

  if (resource === "performance") {
    return readPerformance(client, viewerId, filters, resolvedIds, resolvedMeta, limit, offset);
  }

  const def = RESOURCES[resource as Exclude<AiReadResource, "performance">];
  const invalid = Object.keys(filters).filter((key) => !(key in def.filters));
  if (invalid.length > 0) {
    return badRequest("INVALID_FILTER", `Filter không hỗ trợ: ${invalid.join(", ")}.`, {
      allowed_filters: Object.keys(def.filters),
    });
  }

  let sortField = def.defaultSort.field;
  let ascending = def.defaultSort.ascending;
  if (request.sort?.field) {
    if (!def.sortable.includes(request.sort.field)) {
      return badRequest("INVALID_SORT", `Không sort được theo "${request.sort.field}".`, {
        allowed_values: def.sortable,
      });
    }
    sortField = request.sort.field;
  }
  if (request.sort?.direction) {
    if (request.sort.direction !== "asc" && request.sort.direction !== "desc") {
      return badRequest("INVALID_SORT", 'direction chỉ nhận "asc" hoặc "desc".', {
        allowed_values: ["asc", "desc"],
      });
    }
    ascending = request.sort.direction === "asc";
  }

  if (resource === "members") {
    return readMembers(
      client,
      filters,
      resolvedIds,
      resolvedMeta,
      sortField,
      ascending,
      limit,
      offset,
    );
  }

  if (resource === "daily_reports") {
    return readDailyReports(
      client,
      filters,
      resolvedIds,
      resolvedMeta,
      sortField,
      ascending,
      limit,
      offset,
    );
  }

  if (resource === "announcements") {
    return readAnnouncements(
      client,
      viewerId,
      filters,
      resolvedIds,
      resolvedMeta,
      sortField,
      ascending,
      limit,
      offset,
    );
  }

  if (resource === "approvals") {
    return readApprovals(
      client,
      viewerId,
      filters,
      resolvedIds,
      resolvedMeta,
      sortField,
      ascending,
      limit,
      offset,
    );
  }

  let query = client.from(def.table).select(def.fields, { count: "exact" });

  query = query.is("deleted_at", null);
  if (resource === "tasks") query = query.eq("is_archived", false);

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      const filterDef = def.filters[key]!;
      const entityIds = resolvedIds[key];
      if (entityIds) {
        query =
          entityIds.length === 1
            ? query.eq(filterDef.column!, entityIds[0])
            : query.in(filterDef.column!, entityIds);
        continue;
      }
      const value = coerce(rawValue, filterDef.kind, key);

      if (filterDef.custom) {
        if (resource === "tasks" && key === "overdue") {
          const nowIso = new Date().toISOString();
          query = value
            ? query.lt("deadline", nowIso).neq("status", "done")
            : query.gte("deadline", nowIso);
          continue;
        }
        continue;
      }

      const column = filterDef.column!;
      if (filterDef.op === "ilike") {
        query = query.ilike(column, `%${String(value)}%`);
      } else if (filterDef.op === "gte") {
        query = query.gte(column, dayBound(String(value), "start"));
      } else if (filterDef.op === "lte") {
        query = query.lte(column, dayBound(String(value), "end"));
      } else {
        query = query.eq(column, value);
      }
    }
  } catch (error) {
    return badRequest("INVALID_FILTER", (error as Error).message, {
      allowed_filters: Object.keys(def.filters),
    });
  }

  const { data, error, count } = await query
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }

  const rows = (data ?? []) as any[];
  if (resource === "reports") await attachReportContent(client, rows);

  const total = typeof count === "number" ? count : offset + rows.length;
  return {
    status: 200,
    body: {
      resource,
      data: rows,
      meta: {
        count: total,
        limit,
        offset,
        has_more: offset + rows.length < total,
        ...(Object.keys(resolvedMeta).length > 0 ? { resolved_filters: resolvedMeta } : {}),
      },
    },
  };
}

/**
 * Ghi Audit cho lần gọi API (bản ghi hệ thống duy nhất được phép ghi).
 * Không ghi key, không ghi dữ liệu trả về.
 */
export async function logAiRead(
  viewerId: string,
  entry: {
    resource: string;
    filters: string[];
    limit: number;
    offset: number;
    outcome: "success" | "error";
    returned: number;
    errorCode?: string;
  },
): Promise<void> {
  try {
    const admin = createPrivilegedDataClient() as any;
    await admin.from("audit_logs").insert({
      user_id: viewerId,
      action: "ai.read",
      entity_type: "ai_read",
      entity_id: null,
      metadata: entry,
    });
  } catch (error) {
    console.error("[ai-read] audit:", (error as Error).message);
  }
}
