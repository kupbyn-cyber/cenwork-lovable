/**
 * CEN-MB-02 — Lớp gọi dữ liệu CEN trên PostgreSQL thuần.
 *
 * Cung cấp đúng API mà toàn bộ module CEN đang dùng (`from().select().eq()...`,
 * `rpc()`, `auth`, `storage`) nhưng bên dưới chạy bằng SQL sinh ra từ query plan,
 * không còn phụ thuộc Supabase runtime.
 */
import { cenDbQuery, cenDbRpc } from "@/lib/db/db.functions";
import {
  parseOrExpression,
  type DbWireResponse,
  type FilterOperator,
  type PlanCondition,
  type PlanOrder,
  type QueryPlan,
  type RestResponse,
  type RpcPlan,
} from "@/lib/db/query-plan";

type AnyRecord = Record<string, unknown>;

/**
 * Kênh gửi query plan xuống PostgreSQL. Mặc định đi qua server function
 * (trình duyệt); phía máy chủ có thể truyền kênh chạy thẳng trên pool.
 */
export interface CenTransport {
  query(plan: QueryPlan): Promise<DbWireResponse>;
  rpc(plan: RpcPlan): Promise<DbWireResponse>;
}

const defaultTransport: CenTransport = {
  query: (plan) => cenDbQuery({ data: plan }) as Promise<DbWireResponse>,
  rpc: (plan) => cenDbRpc({ data: plan }) as Promise<DbWireResponse>,
};

function parseFilterOperator(raw: string): { operator: FilterOperator; negate: boolean } {
  const negate = raw.startsWith("not.");
  const operator = (negate ? raw.slice(4) : raw) as FilterOperator;
  return { operator, negate };
}

class CenQueryBuilder<T = unknown> implements PromiseLike<RestResponse<T>> {
  private plan: QueryPlan;
  private shouldThrow = false;
  private transport: CenTransport;

  constructor(table: string, transport: CenTransport) {
    this.plan = { table, action: "select", conditions: [], order: [] };
    this.transport = transport;
  }

  private push(condition: PlanCondition): this {
    this.plan.conditions.push(condition);
    return this;
  }

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.plan.select = columns;
    if (options?.count) this.plan.count = options.count;
    if (options?.head) this.plan.head = true;
    return this;
  }

  insert(values: AnyRecord | AnyRecord[]) {
    this.plan.action = "insert";
    this.plan.values = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: AnyRecord) {
    this.plan.action = "update";
    this.plan.values = [values];
    return this;
  }

  upsert(
    values: AnyRecord | AnyRecord[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.plan.action = "upsert";
    this.plan.values = Array.isArray(values) ? values : [values];
    if (options?.onConflict) this.plan.onConflict = options.onConflict;
    if (options?.ignoreDuplicates) this.plan.ignoreDuplicates = true;
    return this;
  }

  delete() {
    this.plan.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    return this.push({ column, operator: "eq", value });
  }
  neq(column: string, value: unknown) {
    return this.push({ column, operator: "neq", value });
  }
  gt(column: string, value: unknown) {
    return this.push({ column, operator: "gt", value });
  }
  gte(column: string, value: unknown) {
    return this.push({ column, operator: "gte", value });
  }
  lt(column: string, value: unknown) {
    return this.push({ column, operator: "lt", value });
  }
  lte(column: string, value: unknown) {
    return this.push({ column, operator: "lte", value });
  }
  like(column: string, value: string) {
    return this.push({ column, operator: "like", value });
  }
  ilike(column: string, value: string) {
    return this.push({ column, operator: "ilike", value });
  }
  is(column: string, value: unknown) {
    return this.push({ column, operator: "is", value });
  }
  in(column: string, values: readonly unknown[]) {
    return this.push({ column, operator: "in", value: [...values] });
  }
  contains(column: string, value: unknown) {
    return this.push({ column, operator: "cs", value });
  }
  overlaps(column: string, value: unknown) {
    return this.push({ column, operator: "ov", value });
  }
  not(column: string, operator: string, value: unknown) {
    const parsed = parseFilterOperator(operator);
    return this.push({ column, operator: parsed.operator, value, negate: !parsed.negate });
  }
  filter(column: string, operator: string, value: unknown) {
    const parsed = parseFilterOperator(operator);
    return this.push({
      column,
      operator: parsed.operator,
      value,
      ...(parsed.negate ? { negate: true } : {}),
    });
  }
  match(criteria: AnyRecord) {
    for (const [column, value] of Object.entries(criteria)) this.eq(column, value);
    return this;
  }
  or(expression: string, options?: { foreignTable?: string; referencedTable?: string }) {
    const prefix = options?.referencedTable ?? options?.foreignTable;
    const filters = parseOrExpression(expression).map((filter) =>
      prefix ? { ...filter, column: `${prefix}.${filter.column}` } : filter,
    );
    return this.push({ or: filters });
  }

  order(
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
      foreignTable?: string;
      referencedTable?: string;
    },
  ) {
    const entry: PlanOrder = {
      column,
      ascending: options?.ascending !== false,
    };
    if (options?.nullsFirst !== undefined) entry.nullsFirst = options.nullsFirst;
    const foreign = options?.referencedTable ?? options?.foreignTable;
    if (foreign) entry.foreignTable = foreign;
    this.plan.order.push(entry);
    return this;
  }

  limit(count: number) {
    this.plan.limit = count;
    return this;
  }

  range(from: number, to: number) {
    this.plan.offset = from;
    this.plan.limit = to - from + 1;
    return this;
  }

  single() {
    this.plan.single = "one";
    if (this.plan.select === undefined) this.plan.select = "*";
    return this;
  }

  maybeSingle() {
    this.plan.single = "maybe";
    if (this.plan.select === undefined) this.plan.select = "*";
    return this;
  }

  throwOnError() {
    this.shouldThrow = true;
    return this;
  }

  async execute(): Promise<RestResponse<T>> {
    const response = await this.transport.query(this.plan);
    if (this.shouldThrow && response.error) throw new Error(response.error.message);
    return response as RestResponse<T>;
  }

  then<TResult1 = RestResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: RestResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class CenRpcBuilder<T = unknown> implements PromiseLike<RestResponse<T>> {
  private plan: RpcPlan;
  private shouldThrow = false;
  private transport: CenTransport;

  constructor(fn: string, args: AnyRecord, transport: CenTransport) {
    this.plan = { fn, args, conditions: [], order: [] };
    this.transport = transport;
  }

  private push(condition: PlanCondition): this {
    this.plan.conditions.push(condition);
    return this;
  }

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    return this.push({ column, operator: "eq", value });
  }
  neq(column: string, value: unknown) {
    return this.push({ column, operator: "neq", value });
  }
  in(column: string, values: readonly unknown[]) {
    return this.push({ column, operator: "in", value: [...values] });
  }
  is(column: string, value: unknown) {
    return this.push({ column, operator: "is", value });
  }
  gte(column: string, value: unknown) {
    return this.push({ column, operator: "gte", value });
  }
  lte(column: string, value: unknown) {
    return this.push({ column, operator: "lte", value });
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const entry: PlanOrder = { column, ascending: options?.ascending !== false };
    if (options?.nullsFirst !== undefined) entry.nullsFirst = options.nullsFirst;
    this.plan.order.push(entry);
    return this;
  }
  limit(count: number) {
    this.plan.limit = count;
    return this;
  }
  single() {
    this.plan.single = "one";
    return this;
  }
  maybeSingle() {
    this.plan.single = "maybe";
    return this;
  }
  throwOnError() {
    this.shouldThrow = true;
    return this;
  }

  async execute(): Promise<RestResponse<T>> {
    const response = await this.transport.rpc(this.plan);
    if (this.shouldThrow && response.error) throw new Error(response.error.message);
    return response as RestResponse<T>;
  }

  then<TResult1 = RestResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: RestResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createCenDataClient(transport: CenTransport = defaultTransport) {
  return {
    from<T = unknown>(table: string) {
      return new CenQueryBuilder<T>(table, transport);
    },
    rpc<T = unknown>(fn: string, args: AnyRecord = {}) {
      return new CenRpcBuilder<T>(fn, args, transport);
    },
  };
}

export type CenDataClient = ReturnType<typeof createCenDataClient>;