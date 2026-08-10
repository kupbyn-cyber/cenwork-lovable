/**
 * CEN-MB-02 — Đọc metadata của PostgreSQL (khóa ngoại, khóa chính, cột, hàm).
 *
 * Dùng để dịch chuỗi select kiểu PostgREST sang SQL: xác định bảng nhúng là
 * quan hệ một-một hay một-nhiều, và ép kiểu đúng tham số khi gọi function.
 * Kết quả được cache trong tiến trình để không truy vấn catalog mỗi request.
 */
import type { PoolClient } from "pg";

import { withPrivileged } from "@/db/pool.server";

export interface ForeignKey {
  name: string;
  childTable: string;
  parentTable: string;
  childColumns: string[];
  parentColumns: string[];
  /** true khi tập cột con là duy nhất → quan hệ một-một dù FK nằm ở bảng con. */
  childUnique: boolean;
}

export interface TableInfo {
  columns: Set<string>;
  primaryKey: string[];
}

export interface FunctionInfo {
  name: string;
  returnsSet: boolean;
  returnsComposite: boolean;
  returnsVoid: boolean;
  argNames: string[];
  argTypes: string[];
  argDefaults: number;
}

interface Catalog {
  foreignKeys: ForeignKey[];
  tables: Map<string, TableInfo>;
  functions: Map<string, FunctionInfo[]>;
}

let cache: Promise<Catalog> | undefined;

export function resetCatalogCache(): void {
  cache = undefined;
}

export function getCatalog(): Promise<Catalog> {
  if (!cache) {
    cache = load().catch((error: unknown) => {
      cache = undefined;
      throw error;
    });
  }
  return cache;
}

async function load(): Promise<Catalog> {
  return withPrivileged(async (client) => ({
    foreignKeys: await loadForeignKeys(client),
    tables: await loadTables(client),
    functions: await loadFunctions(client),
  }));
}

async function loadForeignKeys(client: PoolClient): Promise<ForeignKey[]> {
  const { rows } = await client.query<{
    name: string;
    child_table: string;
    parent_table: string;
    child_columns: string[];
    parent_columns: string[];
    child_unique: boolean;
  }>(`
    SELECT c.conname AS name,
           child.relname AS child_table,
           parent.relname AS parent_table,
           (SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_columns,
           (SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_columns,
           EXISTS (
             SELECT 1 FROM pg_constraint u
              WHERE u.conrelid = c.conrelid
                AND u.contype IN ('p', 'u')
                AND u.conkey @> c.conkey AND c.conkey @> u.conkey
           ) AS child_unique
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'
  `);
  return rows.map((row) => ({
    name: row.name,
    childTable: row.child_table,
    parentTable: row.parent_table,
    childColumns: row.child_columns ?? [],
    parentColumns: row.parent_columns ?? [],
    childUnique: row.child_unique,
  }));
}

async function loadTables(client: PoolClient): Promise<Map<string, TableInfo>> {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
  `);
  const tables = new Map<string, TableInfo>();
  for (const row of rows) {
    let info = tables.get(row.table_name);
    if (!info) {
      info = { columns: new Set<string>(), primaryKey: [] };
      tables.set(row.table_name, info);
    }
    info.columns.add(row.column_name);
  }

  const { rows: pkRows } = await client.query<{ table_name: string; columns: string[] }>(`
    SELECT rel.relname AS table_name,
           (SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE c.contype = 'p' AND n.nspname = 'public'
  `);
  for (const row of pkRows) {
    const info = tables.get(row.table_name);
    if (info) info.primaryKey = row.columns ?? [];
  }
  return tables;
}

async function loadFunctions(client: PoolClient): Promise<Map<string, FunctionInfo[]>> {
  const { rows } = await client.query<{
    name: string;
    returns_set: boolean;
    return_kind: string;
    return_type: string;
    arg_names: string[] | null;
    arg_types: string[] | null;
    arg_defaults: number;
  }>(`
    SELECT p.proname AS name,
           p.proretset AS returns_set,
           t.typtype::text AS return_kind,
           format_type(p.prorettype, NULL) AS return_type,
           CASE
             WHEN p.proargmodes IS NULL THEN p.proargnames
             ELSE (SELECT array_agg(nm::text ORDER BY ord)
                     FROM unnest(p.proargnames, p.proargmodes) WITH ORDINALITY x(nm, md, ord)
                    WHERE md IN ('i', 'b', 'v'))
           END AS arg_names,
           (SELECT array_agg(format_type(a, NULL)::text ORDER BY ord)
              FROM unnest(p.proargtypes) WITH ORDINALITY x(a, ord)) AS arg_types,
           p.pronargdefaults AS arg_defaults
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  `);

  const functions = new Map<string, FunctionInfo[]>();
  for (const row of rows) {
    const info: FunctionInfo = {
      name: row.name,
      returnsSet: row.returns_set,
      returnsComposite: row.return_kind === "c" || row.return_type === "record",
      returnsVoid: row.return_type === "void",
      argNames: row.arg_names ?? [],
      argTypes: row.arg_types ?? [],
      argDefaults: row.arg_defaults ?? 0,
    };
    const list = functions.get(row.name);
    if (list) list.push(info);
    else functions.set(row.name, [info]);
  }
  return functions;
}