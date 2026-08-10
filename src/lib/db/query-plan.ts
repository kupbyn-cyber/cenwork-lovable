/**
 * CEN-MB-02 — Mô tả truy vấn (query plan) đi giữa trình duyệt và máy chủ CEN.
 *
 * Đây là "hợp đồng" duy nhất giữa lớp gọi dữ liệu (giống PostgREST) ở phía client
 * và bộ biên dịch SQL ở phía server. Nhờ vậy 160+ lời gọi dữ liệu hiện có giữ
 * nguyên cú pháp, còn hạ tầng bên dưới đổi từ Supabase sang PostgreSQL thuần.
 *
 * File này KHÔNG được import bất kỳ thứ gì thuộc về server.
 */

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "cs"
  | "ov";

export interface PlanFilter {
  /** Có thể là "col" hoặc "embed.col" (lọc theo bảng nhúng). */
  column: string;
  operator: FilterOperator;
  value: unknown;
  negate?: boolean;
}

/** Nhóm điều kiện OR (mỗi phần tử là một điều kiện đơn). */
export interface PlanOrGroup {
  or: PlanFilter[];
}

export type PlanCondition = PlanFilter | PlanOrGroup;

export function isOrGroup(condition: PlanCondition): condition is PlanOrGroup {
  return Array.isArray((condition as PlanOrGroup).or);
}

export interface PlanOrder {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
}

export type PlanAction = "select" | "insert" | "update" | "upsert" | "delete";

export interface QueryPlan {
  table: string;
  action: PlanAction;
  /** Chuỗi select kiểu PostgREST; rỗng nghĩa là không trả về dữ liệu. */
  select?: string;
  values?: Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  conditions: PlanCondition[];
  order: PlanOrder[];
  limit?: number;
  offset?: number;
  single?: "one" | "maybe";
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

export interface RpcPlan {
  fn: string;
  args: Record<string, unknown>;
  conditions: PlanCondition[];
  order: PlanOrder[];
  limit?: number;
  offset?: number;
  single?: "one" | "maybe";
  select?: string;
}

export interface RestError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface RestResponse<T = unknown> {
  data: T | null;
  error: RestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Định dạng phản hồi truyền qua ranh giới client/server (luôn là JSON thuần). */
export interface DbWireResponse {
  data: JsonValue | null;
  error: RestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

/* ------------------------------------------------------------------ */
/* Bộ phân tích chuỗi select kiểu PostgREST                            */
/* ------------------------------------------------------------------ */

export type SelectNode =
  | { kind: "star" }
  | { kind: "column"; name: string; alias?: string }
  | {
      kind: "embed";
      target: string;
      hint?: string;
      inner: boolean;
      alias: string;
      children: SelectNode[];
    };

/** Tách chuỗi theo dấu phẩy ở cấp ngoài cùng (bỏ qua phần trong ngoặc). */
export function splitTopLevel(input: string, separator = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === separator && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function parseSelect(input: string): SelectNode[] {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized) return [{ kind: "star" }];

  return splitTopLevel(normalized).map<SelectNode>((part) => {
    if (part === "*") return { kind: "star" };

    const open = part.indexOf("(");
    if (open >= 0 && part.endsWith(")")) {
      const head = part.slice(0, open);
      const body = part.slice(open + 1, -1);
      const colon = head.indexOf(":");
      const alias = colon >= 0 ? head.slice(0, colon) : undefined;
      const rest = colon >= 0 ? head.slice(colon + 1) : head;
      const bang = rest.indexOf("!");
      const target = bang >= 0 ? rest.slice(0, bang) : rest;
      const rawHint = bang >= 0 ? rest.slice(bang + 1) : undefined;
      const inner = rawHint === "inner";
      const hint = rawHint && rawHint !== "inner" && rawHint !== "left" ? rawHint : undefined;
      return {
        kind: "embed",
        target,
        ...(hint ? { hint } : {}),
        inner,
        alias: alias ?? target,
        children: parseSelect(body),
      };
    }

    const colon = part.indexOf(":");
    if (colon > 0) {
      return { kind: "column", name: part.slice(colon + 1), alias: part.slice(0, colon) };
    }
    return { kind: "column", name: part };
  });
}

/* ------------------------------------------------------------------ */
/* Bộ phân tích chuỗi .or("a.eq.1,b.is.null")                          */
/* ------------------------------------------------------------------ */

const OPERATORS = new Set<string>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "cs",
  "ov",
]);

function parseScalar(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

/** "author_id.eq.<uuid>" / "archived_at.not.is.null" / "id.in.(a,b)" */
export function parseOrExpression(expression: string): PlanFilter[] {
  return splitTopLevel(expression).map((item) => {
    const parts = item.split(".");
    const column = parts[0] ?? "";
    let index = 1;
    let negate = false;
    if (parts[index] === "not") {
      negate = true;
      index += 1;
    }
    const operator = parts[index] ?? "eq";
    const rawValue = parts.slice(index + 1).join(".");

    if (!OPERATORS.has(operator)) {
      throw new Error(`Toán tử lọc không hỗ trợ: ${operator}`);
    }

    let value: unknown;
    if (operator === "in") {
      const body = rawValue.replace(/^\(/, "").replace(/\)$/, "");
      value = body.length ? splitTopLevel(body).map(parseScalar) : [];
    } else {
      value = parseScalar(rawValue);
    }

    return { column, operator: operator as FilterOperator, value, ...(negate ? { negate } : {}) };
  });
}