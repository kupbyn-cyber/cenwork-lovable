/**
 * CEN-MB-02 — Thực thi query plan trên PostgreSQL thuần.
 *
 * Mọi truy vấn của người dùng đã đăng nhập chạy trong transaction có
 * `SET LOCAL ROLE cen_app` + `cen.user_id`, nên toàn bộ RLS hiện có tiếp tục
 * là ranh giới bảo mật thật sự — server không tin bất kỳ thông tin quyền nào
 * do client gửi lên.
 */
import type { PoolClient } from "pg";

import { withAnon, withUser } from "@/db/pool.server";
import { withPrivileged } from "@/db/pool.server";
import { compileQuery, compileRpc, QueryCompileError } from "@/lib/db/compile.server";
import type { DbWireResponse, JsonValue, QueryPlan, RestError, RpcPlan } from "@/lib/db/query-plan";

/**
 * Danh tính chạy truy vấn:
 * - `cookie`  : lấy từ phiên đăng nhập của request (mặc định, dùng cho trình duyệt).
 * - `user`    : danh tính đã được máy chủ xác thực trước đó (middleware server function).
 * - `privileged`: tác vụ quản trị của chính máy chủ (tạo tài khoản, gửi Telegram...).
 */
export type DbIdentity =
  | { mode: "cookie" }
  | { mode: "user"; userId: string }
  | { mode: "privileged" };

async function currentUserId(): Promise<string | null> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    const { resolveSession, SESSION_COOKIE } = await import("@/lib/auth/session.server");
    const session = await resolveSession(getCookie(SESSION_COOKIE));
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

async function runScoped<T>(
  identity: DbIdentity,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (identity.mode === "privileged") return withPrivileged(fn);
  const userId = identity.mode === "user" ? identity.userId : await currentUserId();
  return userId ? withUser(userId, fn) : withAnon(fn);
}

function toRestError(error: unknown): RestError {
  if (error instanceof QueryCompileError) {
    return { message: error.message, code: error.code };
  }
  const pg = error as { message?: string; code?: string; detail?: string; hint?: string };
  return {
    message: pg?.message ?? "Lỗi truy vấn dữ liệu.",
    ...(pg?.code ? { code: pg.code } : {}),
    ...(pg?.detail ? { details: pg.detail } : {}),
    ...(pg?.hint ? { hint: pg.hint } : {}),
  };
}

function failure(error: unknown): DbWireResponse {
  const rest = toRestError(error);
  const status = rest.code === "42501" ? 403 : rest.code === "23505" ? 409 : 400;
  return { data: null, error: rest, count: null, status, statusText: "Bad Request" };
}

function shapeSingle(rows: JsonValue[], mode: "one" | "maybe" | undefined): DbWireResponse {
  if (!mode) {
    return { data: rows, error: null, count: null, status: 200, statusText: "OK" };
  }
  if (rows.length > 1) {
    return {
      data: null,
      error: {
        message: "Truy vấn trả về nhiều hơn một dòng.",
        code: "PGRST116",
      },
      count: null,
      status: 406,
      statusText: "Not Acceptable",
    };
  }
  if (rows.length === 0) {
    if (mode === "maybe") {
      return { data: null, error: null, count: null, status: 200, statusText: "OK" };
    }
    return {
      data: null,
      error: { message: "Không tìm thấy dữ liệu.", code: "PGRST116" },
      count: null,
      status: 406,
      statusText: "Not Acceptable",
    };
  }
  return { data: rows[0] ?? null, error: null, count: null, status: 200, statusText: "OK" };
}

export async function runQueryPlan(
  plan: QueryPlan,
  identity: DbIdentity = { mode: "cookie" },
): Promise<DbWireResponse> {
  try {
    const compiled = await compileQuery(plan);

    const result = await runScoped(identity, async (client) => {
      let rows: JsonValue[] = [];
      let count: number | null = null;
      if (compiled.data) {
        const { rows: dataRows } = await client.query<{ data: JsonValue[] }>(
          compiled.data.text,
          compiled.data.values,
        );
        rows = dataRows[0]?.data ?? [];
      }
      if (compiled.count) {
        const { rows: countRows } = await client.query<{ total: string }>(
          compiled.count.text,
          compiled.count.values,
        );
        count = Number(countRows[0]?.total ?? 0);
      }
      return { rows, count };
    });

    if (plan.head) {
      return { data: null, error: null, count: result.count, status: 200, statusText: "OK" };
    }
    if (plan.select === undefined) {
      return { data: null, error: null, count: result.count, status: 201, statusText: "Created" };
    }
    const shaped = shapeSingle(result.rows, plan.single);
    return { ...shaped, count: result.count };
  } catch (error) {
    return failure(error);
  }
}

export async function runRpcPlan(
  plan: RpcPlan,
  identity: DbIdentity = { mode: "cookie" },
): Promise<DbWireResponse> {
  try {
    const compiled = await compileRpc(plan);

    const value: JsonValue = await runScoped(identity, async (client) => {
      const { rows } = await client.query<{ data: JsonValue }>(compiled.text, compiled.values);
      return rows[0]?.data ?? null;
    });

    if (!compiled.returnsSet) {
      return { data: value ?? null, error: null, count: null, status: 200, statusText: "OK" };
    }
    const rows = Array.isArray(value) ? value : [];
    return shapeSingle(rows, plan.single);
  } catch (error) {
    return failure(error);
  }
}