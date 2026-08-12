#!/usr/bin/env node
/**
 * CEN-MB-01 / TASK-FIX-02 — Migration runner cho bản self-host PostgreSQL.
 *
 * Ba pha, mỗi file chạy trong MỘT transaction và được ghi nhận trong
 * public._cen_migrations nên deploy lại không chạy trùng:
 *   1. baseline  — database đã có schema nhưng chưa có bảng tracking:
 *                  đánh dấu các migration cũ là đã áp (không chạy lại).
 *   2. migrations— db/migrations/*.sql chưa áp dụng.
 *   3. repair    — db/repair/*.sql: script idempotent bù các schema còn thiếu
 *                  trên database đã tồn tại trước khi có tracking.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "db", "migrations");
const repairDir = join(root, "db", "repair");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[cen] Thiếu DATABASE_URL. Ví dụ: postgresql://user:pass@host:5432/cen_work");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ...(process.env.DATABASE_SSL === "require" ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  await client.connect();
} catch (error) {
  console.error(`[cen] Không kết nối được PostgreSQL: ${error.message}`);
  process.exit(1);
}

await client.query(`
  CREATE TABLE IF NOT EXISTS public._cen_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const list = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

const sha = (sql) => createHash("sha256").update(sql).digest("hex");

const loadApplied = async () =>
  new Map(
    (await client.query("SELECT name, checksum FROM public._cen_migrations")).rows.map((r) => [
      r.name,
      r.checksum,
    ]),
  );

let applied = await loadApplied();
const migrations = list(migrationsDir);
const repairs = list(repairDir);

// --- Pha 1: baseline cho database đã chạy trước khi có bảng tracking ---
if (applied.size === 0) {
  const { rows } = await client.query("SELECT to_regclass('public.tasks') IS NOT NULL AS has_schema");
  if (rows[0]?.has_schema) {
    for (const file of migrations) {
      await client.query(
        "INSERT INTO public._cen_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [file, sha(readFileSync(join(migrationsDir, file), "utf8"))],
      );
    }
    applied = await loadApplied();
    console.log(
      `[cen] Baseline: database đã có schema sẵn — đánh dấu ${migrations.length} migration là đã áp dụng.`,
    );
  }
}

async function runFile(dir, file, key) {
  const sql = readFileSync(join(dir, file), "utf8");
  const checksum = sha(sql);
  const previous = applied.get(key);

  if (previous) {
    if (previous !== checksum && dir === migrationsDir) {
      console.error(`[cen] Migration đã chạy nhưng nội dung đã đổi: ${key}`);
      console.error("[cen] Không sửa migration cũ — hãy tạo migration mới.");
      await client.end();
      process.exit(1);
    }
    return false;
  }

  process.stdout.write(`[cen] apply ${key} ... `);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO public._cen_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()",
      [key, checksum],
    );
    await client.query("COMMIT");
    console.log("ok");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.log("FAILED");
    console.error(`[cen] ${key}: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

let ran = 0;
for (const file of migrations) {
  if (await runFile(migrationsDir, file, file)) ran += 1;
}

let repaired = 0;
for (const file of repairs) {
  if (await runFile(repairDir, file, `repair/${file}`)) repaired += 1;
}

console.log(
  `[cen] Hoàn tất. Migration mới: ${ran}/${migrations.length}; repair mới: ${repaired}/${repairs.length}.`,
);
await client.end();
