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

export const AI_READ_RESOURCES = [
  "tasks",
  "projects",
  "reports",
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
  error: { code: string; message: string; allowed_filters?: string[]; allowed_values?: string[] };
}

export interface AiReadSuccess {
  resource: AiReadResource;
  data: unknown[];
  meta: { count: number; limit: number; offset: number; has_more: boolean };
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
  viewerId: string,
  filters: Record<string, unknown>,
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
  const teamId = typeof filters["team"] === "string" ? (filters["team"] as string) : null;
  const memberId = typeof filters["member"] === "string" ? (filters["member"] as string) : null;

  const client = createUserDataClient(viewerId) as any;
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
      meta: { count: data.length, limit, offset, has_more: false },
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
  viewerId: string,
  filters: Record<string, unknown>,
  sortField: string,
  ascending: boolean,
  limit: number,
  offset: number,
): Promise<AiReadResult> {
  const client = createUserDataClient(viewerId) as any;
  const { data, error } = await client.rpc("member_directory");
  if (error) {
    return { status: 400, body: { error: { code: "QUERY_FAILED", message: error.message } } };
  }
  let rows = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    email: row.email ?? null,
    job_title: row.job_title ?? null,
    primary_team_id: row.primary_team_id ?? null,
    status: row.status,
    locked_at: row.locked_at ?? null,
    role: row.role ?? null,
  }));

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      const value = coerce(rawValue, RESOURCES.members.filters[key]!.kind, key);
      if (key === "team") rows = rows.filter((row) => row.primary_team_id === value);
      else if (key === "status") rows = rows.filter((row) => row.status === value);
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
      meta: { count: total, limit, offset, has_more: offset + page.length < total },
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

  if (resource === "performance") return readPerformance(viewerId, filters, limit, offset);

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
    return readMembers(viewerId, filters, sortField, ascending, limit, offset);
  }

  const client = createUserDataClient(viewerId) as any;
  let query = client.from(def.table).select(def.fields, { count: "exact" });

  query = query.is("deleted_at", null);
  if (resource === "tasks") query = query.eq("is_archived", false);

  try {
    for (const [key, rawValue] of Object.entries(filters)) {
      const filterDef = def.filters[key]!;
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
      meta: { count: total, limit, offset, has_more: offset + rows.length < total },
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
