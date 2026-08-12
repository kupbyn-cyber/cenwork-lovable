import { withPrivileged } from "@/db/pool.server";
import { runQueryPlan } from "@/lib/db/executor.server";

const BASE = `id,name,project_id,assignee_id,team_id,deadline,priority,status,created_by,created_at,updated_at,approval_status,cancelled_at,manually_archived_at,reviewer_id`;

const plan = (select: string) => ({
  table: "tasks", action: "select" as const, select,
  conditions: [{ column: "deleted_at", operator: "is" as const, value: null }],
  order: [{ column: "deadline", ascending: true }],
});

async function time<T>(label: string, fn: () => Promise<T>) {
  const t0 = performance.now(); const out: any = await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms rows=${Array.isArray(out?.data) ? out.data.length : JSON.stringify(out?.error)}`);
  return out;
}

const admin = await withPrivileged((c) => c.query(`select p.id from public.profiles p join public.user_roles r on r.user_id=p.id where r.role='admin' and p.email like 'u%@cen.vn' limit 1`).then(r=>r.rows[0]));
const id = { mode: "user" as const, userId: admin.id };
await time("flat only", () => runQueryPlan(plan(BASE), id));
await time("flat + participants(user_id)", () => runQueryPlan(plan(BASE + ",task_participants(user_id)"), id));
await time("flat + 1 profile embed", () => runQueryPlan(plan(BASE + ",assignee:profiles!tasks_assignee_id_fkey(id,display_name)"), id));
await time("participants separate query", () => runQueryPlan({ table: "task_participants", action: "select", select: "task_id,user_id", conditions: [], order: [] }, id));
process.exit(0);
