/**
 * CEN-MB-02 — Biên dịch query plan (kiểu PostgREST) sang SQL PostgreSQL thuần.
 *
 * Mọi giá trị đều đi qua tham số ($1, $2, ...); mọi định danh (bảng/cột) được
 * kiểm tra bằng danh sách trắng ký tự trước khi ghép chuỗi. Kết quả trả về được
 * Postgres tự chuyển sang JSON (to_jsonb) nên định dạng ngày/số giống hệt
 * PostgREST — giao diện hiện tại không phải sửa gì.
 */
import {
  isOrGroup,
  parseSelect,
  type PlanCondition,
  type PlanFilter,
  type PlanOrder,
  type QueryPlan,
  type RpcPlan,
  type SelectNode,
} from "@/lib/db/query-plan";
import { getCatalog, type ForeignKey, type FunctionInfo } from "@/lib/db/catalog.server";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class QueryCompileError extends Error {
  code = "PGRST100";
}

function ident(value: string): string {
  if (!IDENTIFIER.test(value)) throw new QueryCompileError(`Định danh không hợp lệ: ${value}`);
  return `"${value}"`;
}

interface Ctx {
  params: unknown[];
  seq: number;
}

function param(ctx: Ctx, value: unknown): string {
  ctx.params.push(value);
  return `$${ctx.params.length}`;
}

function nextAlias(ctx: Ctx): string {
  ctx.seq += 1;
  return `t${ctx.seq}`;
}

export interface CompiledStatement {
  text: string;
  values: unknown[];
}

export interface CompiledQuery {
  data?: CompiledStatement;
  count?: CompiledStatement;
}

/* ------------------------------------------------------------------ */
/* Quan hệ nhúng                                                        */
/* ------------------------------------------------------------------ */

interface EmbedLink {
  toOne: boolean;
  childTable: string;
  /** [cột bảng cha, cột bảng con] để nối. */
  pairs: Array<[string, string]>;
}

function resolveEmbed(
  parentTable: string,
  target: string,
  hint: string | undefined,
  fks: ForeignKey[],
  parentColumns: Set<string> | undefined,
): EmbedLink {
  const byName = hint ? fks.find((fk) => fk.name === hint) : undefined;
  if (byName) {
    if (byName.childTable === parentTable) {
      return {
        toOne: true,
        childTable: byName.parentTable,
        pairs: byName.childColumns.map((col, i) => [col, byName.parentColumns[i]!]),
      };
    }
    return {
      toOne: byName.childUnique,
      childTable: byName.childTable,
      pairs: byName.parentColumns.map((col, i) => [col, byName.childColumns[i]!]),
    };
  }

  // Nhúng theo tên cột khóa ngoại: profiles.teams:primary_team_id(name)
  if (parentColumns?.has(target)) {
    const fk = fks.find(
      (item) =>
        item.childTable === parentTable &&
        item.childColumns.length === 1 &&
        item.childColumns[0] === target,
    );
    if (fk) {
      return {
        toOne: true,
        childTable: fk.parentTable,
        pairs: [[target, fk.parentColumns[0]!]],
      };
    }
  }

  const outgoing = fks.filter(
    (fk) =>
      fk.childTable === parentTable &&
      fk.parentTable === target &&
      (!hint || fk.childColumns.includes(hint)),
  );
  if (outgoing.length === 1) {
    const fk = outgoing[0]!;
    return {
      toOne: true,
      childTable: target,
      pairs: fk.childColumns.map((col, i) => [col, fk.parentColumns[i]!]),
    };
  }

  const incoming = fks.filter(
    (fk) =>
      fk.childTable === target &&
      fk.parentTable === parentTable &&
      (!hint || fk.childColumns.includes(hint)),
  );
  if (incoming.length === 1) {
    const fk = incoming[0]!;
    return {
      toOne: fk.childUnique,
      childTable: target,
      pairs: fk.parentColumns.map((col, i) => [col, fk.childColumns[i]!]),
    };
  }

  if (outgoing.length > 1 || incoming.length > 1) {
    throw new QueryCompileError(
      `Quan hệ nhúng "${target}" không rõ ràng từ bảng "${parentTable}". Cần chỉ rõ khóa ngoại.`,
    );
  }
  throw new QueryCompileError(
    `Không tìm thấy quan hệ giữa "${parentTable}" và "${target}" để nhúng dữ liệu.`,
  );
}

/* ------------------------------------------------------------------ */
/* Điều kiện lọc                                                        */
/* ------------------------------------------------------------------ */

function filterSql(alias: string, filter: PlanFilter, ctx: Ctx): string {
  const column = `${ident(alias)}.${ident(filter.column)}`;
  const { operator, value } = filter;
  let sql: string;

  switch (operator) {
    case "is":
      sql =
        value === null
          ? `${column} IS NULL`
          : value === true
            ? `${column} IS TRUE`
            : value === false
              ? `${column} IS FALSE`
              : `${column} IS NOT DISTINCT FROM ${param(ctx, value)}`;
      break;
    case "in": {
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0) {
        sql = "false";
        break;
      }
      sql = `${column} = ANY(${param(ctx, list)})`;
      break;
    }
    case "eq":
      sql = value === null ? `${column} IS NULL` : `${column} = ${param(ctx, value)}`;
      break;
    case "neq":
      sql = value === null ? `${column} IS NOT NULL` : `${column} <> ${param(ctx, value)}`;
      break;
    case "gt":
      sql = `${column} > ${param(ctx, value)}`;
      break;
    case "gte":
      sql = `${column} >= ${param(ctx, value)}`;
      break;
    case "lt":
      sql = `${column} < ${param(ctx, value)}`;
      break;
    case "lte":
      sql = `${column} <= ${param(ctx, value)}`;
      break;
    case "like":
      sql = `${column} LIKE ${param(ctx, value)}`;
      break;
    case "ilike":
      sql = `${column} ILIKE ${param(ctx, value)}`;
      break;
    case "cs":
      sql = `${column} @> ${param(ctx, value)}`;
      break;
    case "ov":
      sql = `${column} && ${param(ctx, value)}`;
      break;
    default:
      throw new QueryCompileError(`Toán tử không hỗ trợ: ${String(operator)}`);
  }

  return filter.negate ? `NOT (${sql})` : sql;
}

function orderSql(alias: string, orders: PlanOrder[]): string {
  if (orders.length === 0) return "";
  const parts = orders.map((order) => {
    const direction = order.ascending ? "ASC" : "DESC";
    const nulls =
      order.nullsFirst === undefined ? "" : order.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
    return `${ident(alias)}.${ident(order.column)} ${direction}${nulls}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

/* ------------------------------------------------------------------ */
/* Projection                                                           */
/* ------------------------------------------------------------------ */

interface BuildContext {
  ctx: Ctx;
  fks: ForeignKey[];
  columnsOf: (table: string) => Set<string> | undefined;
  /** Điều kiện lọc trên bảng nhúng: "alias.col". */
  embedFilters: Map<string, PlanFilter[]>;
  /** Sắp xếp trên bảng nhúng. */
  embedOrders: Map<string, PlanOrder[]>;
  /** Điều kiện EXISTS bắt buộc, ghép vào WHERE của bảng gốc. */
  innerConditions: string[];
}

function buildProjection(
  nodes: SelectNode[],
  table: string,
  alias: string,
  build: BuildContext,
): string {
  const pieces: string[] = [];

  for (const node of nodes) {
    if (node.kind === "star") {
      pieces.push(`${ident(alias)}.*`);
      continue;
    }
    if (node.kind === "column") {
      const expr = `${ident(alias)}.${ident(node.name)}`;
      pieces.push(node.alias ? `${expr} AS ${ident(node.alias)}` : expr);
      continue;
    }

    const link = resolveEmbed(table, node.target, node.hint, build.fks, build.columnsOf(table));
    const childAlias = nextAlias(build.ctx);
    const joinFor = (target: string) =>
      link.pairs
        .map(
          ([parentCol, childCol]) =>
            `${ident(target)}.${ident(childCol)} = ${ident(alias)}.${ident(parentCol)}`,
        )
        .join(" AND ");
    const join = joinFor(childAlias);

    const embedFilters = build.embedFilters.get(node.alias) ?? [];
    const extra = embedFilters.map((filter) => filterSql(childAlias, filter, build.ctx));
    const where = [join, ...extra].join(" AND ");
    const childProjection = buildProjection(node.children, link.childTable, childAlias, build);
    const childOrder = orderSql(childAlias, build.embedOrders.get(node.alias) ?? []);
    const source = `FROM ${ident("public")}.${ident(link.childTable)} ${ident(childAlias)} WHERE ${where}`;

    if (link.toOne) {
      pieces.push(
        `(SELECT to_jsonb(_e) FROM (SELECT ${childProjection} ${source} LIMIT 1) _e) AS ${ident(node.alias)}`,
      );
    } else {
      pieces.push(
        `(SELECT COALESCE(jsonb_agg(to_jsonb(_e)), '[]'::jsonb) FROM (SELECT ${childProjection} ${source}${childOrder}) _e) AS ${ident(node.alias)}`,
      );
    }

    if (node.inner || extra.length > 0) {
      const existsAlias = nextAlias(build.ctx);
      const existsWhere = [
        joinFor(existsAlias),
        ...embedFilters.map((filter) => filterSql(existsAlias, filter, build.ctx)),
      ].join(" AND ");
      build.innerConditions.push(
        `EXISTS (SELECT 1 FROM ${ident("public")}.${ident(link.childTable)} ${ident(existsAlias)} WHERE ${existsWhere})`,
      );
    }
  }

  return pieces.length > 0 ? pieces.join(", ") : `${ident(alias)}.*`;
}

/* ------------------------------------------------------------------ */
/* Biên dịch plan                                                       */
/* ------------------------------------------------------------------ */

function splitConditions(conditions: PlanCondition[]) {
  const base: PlanCondition[] = [];
  const embedFilters = new Map<string, PlanFilter[]>();
  for (const condition of conditions) {
    if (!isOrGroup(condition) && condition.column.includes(".")) {
      const [embed, ...rest] = condition.column.split(".");
      const list = embedFilters.get(embed!) ?? [];
      list.push({ ...condition, column: rest.join(".") });
      embedFilters.set(embed!, list);
      continue;
    }
    base.push(condition);
  }
  return { base, embedFilters };
}

function whereSql(alias: string, conditions: PlanCondition[], ctx: Ctx): string[] {
  return conditions.map((condition) => {
    if (isOrGroup(condition)) {
      const parts = condition.or.map((filter) => filterSql(alias, filter, ctx));
      return parts.length ? `(${parts.join(" OR ")})` : "true";
    }
    return filterSql(alias, condition, ctx);
  });
}

export async function compileQuery(plan: QueryPlan): Promise<CompiledQuery> {
  const catalog = await getCatalog();
  if (!catalog.tables.has(plan.table)) {
    throw new QueryCompileError(`Không tìm thấy bảng: ${plan.table}`);
  }

  const ctx: Ctx = { params: [], seq: 0 };
  const alias = nextAlias(ctx);
  const { base, embedFilters } = splitConditions(plan.conditions);

  const embedOrders = new Map<string, PlanOrder[]>();
  const rootOrders: PlanOrder[] = [];
  for (const order of plan.order) {
    if (order.foreignTable) {
      const list = embedOrders.get(order.foreignTable) ?? [];
      list.push(order);
      embedOrders.set(order.foreignTable, list);
    } else {
      rootOrders.push(order);
    }
  }

  const build: BuildContext = {
    ctx,
    fks: catalog.foreignKeys,
    columnsOf: (table) => catalog.tables.get(table)?.columns,
    embedFilters,
    embedOrders,
    innerConditions: [],
  };

  const wantsData = plan.select !== undefined && !plan.head;
  const nodes = parseSelect(plan.select ?? "*");
  const table = `${ident("public")}.${ident(plan.table)}`;

  let projection = "";
  let body = "";

  if (plan.action === "select") {
    projection = wantsData ? buildProjection(nodes, plan.table, alias, build) : "1";
    const conditions = [...whereSql(alias, base, ctx), ...build.innerConditions];
    body =
      `FROM ${table} ${ident(alias)}` +
      (conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "");
  } else {
    const mutation = await compileMutation(plan, ctx, alias, catalog.tables.get(plan.table)!);
    projection = wantsData ? buildProjection(nodes, plan.table, alias, build) : "1";
    body = `FROM _mutation ${ident(alias)}`;
    const compiled: CompiledQuery = {};
    if (wantsData) {
      const order = orderSql(alias, rootOrders);
      compiled.data = {
        text: `WITH _mutation AS (${mutation}) SELECT COALESCE(jsonb_agg(to_jsonb(_row)), '[]'::jsonb) AS data FROM (SELECT ${projection} ${body}${order}) _row`,
        values: ctx.params,
      };
    } else {
      compiled.data = {
        text: `WITH _mutation AS (${mutation}) SELECT '[]'::jsonb AS data FROM (SELECT 1 FROM _mutation) _row`,
        values: ctx.params,
      };
    }
    return compiled;
  }

  const compiled: CompiledQuery = {};
  const order = orderSql(alias, rootOrders);
  const limit = plan.limit === undefined ? "" : ` LIMIT ${Number(plan.limit)}`;
  const offset = plan.offset ? ` OFFSET ${Number(plan.offset)}` : "";

  if (!plan.head) {
    compiled.data = {
      text: `SELECT COALESCE(jsonb_agg(to_jsonb(_row)), '[]'::jsonb) AS data FROM (SELECT ${projection} ${body}${order}${limit}${offset}) _row`,
      values: [...ctx.params],
    };
  }
  if (plan.count) {
    compiled.count = {
      text: `SELECT count(*)::bigint AS total ${body}`,
      values: [...ctx.params],
    };
  }
  return compiled;
}

async function compileMutation(
  plan: QueryPlan,
  ctx: Ctx,
  alias: string,
  info: { columns: Set<string>; primaryKey: string[] },
): Promise<string> {
  const table = `${ident("public")}.${ident(plan.table)}`;
  const rows = plan.values ?? [];

  if (plan.action === "delete") {
    const conditions = whereSql(alias, splitConditions(plan.conditions).base, ctx);
    if (conditions.length === 0) {
      throw new QueryCompileError("Xóa dữ liệu phải có điều kiện lọc.");
    }
    return `DELETE FROM ${table} ${ident(alias)} WHERE ${conditions.join(" AND ")} RETURNING *`;
  }

  if (plan.action === "update") {
    const payload = rows[0] ?? {};
    const keys = Object.keys(payload).filter((key) => info.columns.has(key));
    if (keys.length === 0) throw new QueryCompileError("Không có cột hợp lệ để cập nhật.");
    const conditions = whereSql(alias, splitConditions(plan.conditions).base, ctx);
    if (conditions.length === 0) {
      throw new QueryCompileError("Cập nhật dữ liệu phải có điều kiện lọc.");
    }
    const source = param(ctx, JSON.stringify(payload));
    const assignments = keys.map((key) => `${ident(key)} = _v.${ident(key)}`).join(", ");
    return (
      `UPDATE ${table} ${ident(alias)} SET ${assignments} ` +
      `FROM (SELECT * FROM jsonb_populate_record(NULL::${table}, ${source}::jsonb)) _v ` +
      `WHERE ${conditions.join(" AND ")} RETURNING ${ident(alias)}.*`
    );
  }

  // insert / upsert
  if (rows.length === 0) throw new QueryCompileError("Không có dữ liệu để ghi.");
  const keys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row).filter((key) => info.columns.has(key)))),
  );
  if (keys.length === 0) throw new QueryCompileError("Không có cột hợp lệ để ghi.");
  const source = param(ctx, JSON.stringify(rows));
  const columnList = keys.map(ident).join(", ");
  let sql =
    `INSERT INTO ${table} AS ${ident(alias)} (${columnList}) ` +
    `SELECT ${columnList} FROM jsonb_populate_recordset(NULL::${table}, ${source}::jsonb)`;

  if (plan.action === "upsert") {
    const conflict = plan.onConflict
      ? plan.onConflict.split(",").map((col) => ident(col.trim()))
      : info.primaryKey.map(ident);
    if (conflict.length === 0) throw new QueryCompileError("Không xác định được cột xung đột.");
    if (plan.ignoreDuplicates) {
      sql += ` ON CONFLICT (${conflict.join(", ")}) DO NOTHING`;
    } else {
      const updates = keys
        .filter((key) => !plan.onConflict?.split(",").map((c) => c.trim()).includes(key))
        .map((key) => `${ident(key)} = EXCLUDED.${ident(key)}`);
      sql += updates.length
        ? ` ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${updates.join(", ")}`
        : ` ON CONFLICT (${conflict.join(", ")}) DO NOTHING`;
    }
  }

  return `${sql} RETURNING *`;
}

/* ------------------------------------------------------------------ */
/* Gọi function (RPC)                                                   */
/* ------------------------------------------------------------------ */

export interface CompiledRpc extends CompiledStatement {
  returnsSet: boolean;
  scalar: boolean;
}

function pickOverload(candidates: FunctionInfo[], args: Record<string, unknown>): FunctionInfo {
  const provided = Object.keys(args);
  const exact = candidates.find(
    (candidate) =>
      candidate.argNames.length === provided.length &&
      provided.every((name) => candidate.argNames.includes(name)),
  );
  if (exact) return exact;

  const compatible = candidates.find(
    (candidate) =>
      provided.every((name) => candidate.argNames.includes(name)) &&
      candidate.argNames.length - provided.length <= candidate.argDefaults,
  );
  if (compatible) return compatible;

  throw new QueryCompileError(
    `Tham số không khớp với function ${candidates[0]?.name ?? ""}: ${provided.join(", ")}`,
  );
}

export async function compileRpc(plan: RpcPlan): Promise<CompiledRpc> {
  const catalog = await getCatalog();
  const candidates = catalog.functions.get(plan.fn);
  if (!candidates || candidates.length === 0) {
    throw new QueryCompileError(`Không tìm thấy function: ${plan.fn}`);
  }

  const args = plan.args ?? {};
  const info = pickOverload(candidates, args);
  const ctx: Ctx = { params: [], seq: 0 };

  const callArgs = Object.entries(args).map(([name, value]) => {
    const index = info.argNames.indexOf(name);
    const type = index >= 0 ? info.argTypes[index] : undefined;
    const encoded =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? JSON.stringify(value)
        : Array.isArray(value) && type && /json/.test(type)
          ? JSON.stringify(value)
          : value;
    const placeholder = param(ctx, encoded);
    return `${ident(name)} => ${type ? `${placeholder}::${type}` : placeholder}`;
  });

  const call = `${ident("public")}.${ident(plan.fn)}(${callArgs.join(", ")})`;
  const scalar = !info.returnsComposite;

  if (!info.returnsSet) {
    if (info.returnsVoid) {
      return { text: `SELECT NULL::jsonb AS data FROM ${call} _v`, values: ctx.params, returnsSet: false, scalar: true };
    }
    return {
      text: `SELECT to_jsonb(${call}) AS data`,
      values: ctx.params,
      returnsSet: false,
      scalar,
    };
  }

  const alias = nextAlias(ctx);
  const conditions = whereSql(alias, plan.conditions, ctx);
  const order = orderSql(alias, plan.order);
  const limit = plan.limit === undefined ? "" : ` LIMIT ${Number(plan.limit)}`;
  const offset = plan.offset ? ` OFFSET ${Number(plan.offset)}` : "";
  const projection = scalar
    ? `to_jsonb(${ident(alias)}.${ident(plan.fn)})`
    : `to_jsonb(${ident(alias)})`;

  return {
    text:
      `SELECT COALESCE(jsonb_agg(_row.value), '[]'::jsonb) AS data FROM ` +
      `(SELECT ${projection} AS value FROM ${call} ${ident(alias)}` +
      (conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "") +
      `${order}${limit}${offset}) _row`,
    values: ctx.params,
    returnsSet: true,
    scalar,
  };
}