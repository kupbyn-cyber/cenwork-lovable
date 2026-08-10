import { describe, expect, it } from "vitest";

process.env["DATABASE_URL"] =
  `postgresql://${encodeURIComponent(process.env["PGUSER"]!)}:${encodeURIComponent(process.env["PGPASSWORD"]!)}@${process.env["PGHOST"]}:${process.env["PGPORT"] ?? 5432}/${process.env["PGDATABASE"]}`;
process.env["DATABASE_SSL"] = "no-verify";

const { compileQuery, compileRpc } = await import("@/lib/db/compile.server");
const { withPrivileged } = await import("@/db/pool.server");

async function run(sql: { text: string; values: unknown[] }) {
  return withPrivileged(async (c) => (await c.query(sql.text, sql.values)).rows);
}

describe("compiler", () => {
  it("select with embeds, or, order, count", async () => {
    const c = await compileQuery({
      table: "tasks",
      action: "select",
      select:
        "id, name, status, projects!inner(name), assignee:profiles!tasks_assignee_id_fkey(display_name, teams:primary_team_id(name)), task_participants(user_id)",
      conditions: [{ or: [{ column: "name", operator: "ilike", value: "%a%" }, { column: "created_at", operator: "is", value: null, negate: true }] }],
      order: [{ column: "created_at", ascending: false }],
      limit: 3,
      count: "exact",
    });
    console.log(c.data!.text);
    await run(c.data!);
    await run(c.count!);
  });

  it("embedded one-to-one via unique fk", async () => {
    const c = await compileQuery({
      table: "report_obligations",
      action: "select",
      select: "id, report:reports(status)",
      conditions: [],
      order: [],
      limit: 2,
    });
    console.log(c.data!.text);
    await run(c.data!);
  });

  it("rpc scalar and set", async () => {
    const a = await compileRpc({ fn: "has_role", args: { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" }, conditions: [], order: [] });
    console.log(a.text);
    expect(a.text).toContain("::app_role");

    const b = await compileRpc({ fn: "member_directory", args: {}, conditions: [], order: [] });
    console.log(b.text);
    expect(b.returnsSet).toBe(true);
  });
});
