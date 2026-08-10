#!/usr/bin/env node
/**
 * CEN-MB-01 — Chạy migration SQL theo thứ tự tên file trên PostgreSQL thuần.
 * Idempotent: mỗi file chỉ chạy một lần, ghi lại trong bảng public._cen_migrations.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
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

const applied = new Map(
  (await client.query("SELECT name, checksum FROM public._cen_migrations")).rows.map((r) => [
    r.name,
    r.checksum,
  ]),
);

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ran = 0;
for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const previous = applied.get(file);

  if (previous) {
    if (previous !== checksum) {
      console.error(`[cen] Migration đã chạy nhưng nội dung đã đổi: ${file}`);
      console.error("[cen] Không sửa migration cũ — hãy tạo migration mới.");
      process.exit(1);
    }
    continue;
  }

  process.stdout.write(`[cen] apply ${file} ... `);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO public._cen_migrations (name, checksum) VALUES ($1, $2)", [
      file,
      checksum,
    ]);
    await client.query("COMMIT");
    ran += 1;
    console.log("ok");
  } catch (error) {
    await client.query("ROLLBACK");
    console.log("FAILED");
    console.error(`[cen] ${file}: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(`[cen] Hoàn tất. Đã áp dụng ${ran} migration mới / tổng ${files.length}.`);
await client.end();
