/**
 * CEN-MB-01 — Kết nối PostgreSQL thuần (deploy độc lập trên Mắt Bão).
 * Mỗi request chạy trong một transaction có đặt danh tính `cen.user_id`,
 * nên toàn bộ RLS/`auth.uid()` sẵn có tiếp tục hiệu lực y như trước.
 */
import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function databaseConfigured(): boolean {
  const url = process.env["DATABASE_URL"];
  return typeof url === "string" && url.trim().length > 0;
}

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("Thiếu DATABASE_URL.");

  const sslMode = (process.env["DATABASE_SSL"] ?? "").trim().toLowerCase();
  const ssl =
    sslMode === "disable" || sslMode === "false"
      ? false
      : sslMode === "no-verify"
        ? { rejectUnauthorized: false }
        : undefined;

  pool = new Pool({
    connectionString,
    ...(ssl === undefined ? {} : { ssl }),
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

async function runInTransaction<T>(
  setup: (client: PoolClient) => Promise<void>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Truy vấn dưới danh tính người dùng đã đăng nhập: role `cen_app` + `cen.user_id`.
 * RLS luôn được áp dụng — server không bao giờ tin dữ liệu quyền do client gửi lên.
 */
export function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(async (client) => {
    await client.query("SET LOCAL ROLE cen_app");
    await client.query("SELECT set_config('cen.user_id', $1, true)", [userId]);
  }, fn);
}

/** Truy vấn ẩn danh (chỉ dùng cho đăng nhập / bootstrap / kiểm tra hệ thống). */
export function withAnon<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(async (client) => {
    await client.query("SET LOCAL ROLE anon");
  }, fn);
}

/**
 * Truy vấn đặc quyền của chính máy chủ (tạo user, cấp phiên, bootstrap).
 * Chỉ dùng trong các luồng đã kiểm tra danh tính/token ở phía server.
 */
export function withPrivileged<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return runInTransaction(async () => undefined, fn);
}