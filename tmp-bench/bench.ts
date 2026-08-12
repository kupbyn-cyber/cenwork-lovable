import { withPrivileged } from "@/db/pool.server";
import { runQueryPlan, runRpcPlan } from "@/lib/db/executor.server";

const SELECT_OLD = `
  id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,
  is_archived,completed_at,manually_archived_at,manually_archived_by,
  cancelled_at,cancelled_by,cancel_reason,
  result_text,result_updated_at,result_updated_by,
  created_by,created_at,updated_at,
  approval_status,approval_round,submitted_at,approval_decided_at,approval_decided_by,approval_note,
  reviewer_type,reviewer_id,recurrence_rule_id,occurrence_date,
  project:projects(id,name,owner_id,manually_archived_at,responsible_team_id),
  assignee:profiles!tasks_assignee_id_fkey(id,display_name,primary_team_id),
  creator:profiles!tasks_created_by_fkey(id,display_name),
  resultAuthor:profiles!tasks_result_updated_by_fkey(id,display_name),
  reviewer:profiles!tasks_reviewer_id_fkey(id,display_name),
  team:teams(id,name),
  task_participants(user_id,profiles(display_name))
`;
const SELECT_NEW = `
  id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,
  is_archived,completed_at,manually_archived_at,manually_archived_by,
  cancelled_at,cancelled_by,cancel_reason,
  result_text,result_updated_at,result_updated_by,
  created_by,created_at,updated_at,
  approval_status,approval_round,submitted_at,approval_decided_at,approval_decided_by,approval_note,
  reviewer_type,reviewer_id,recurrence_rule_id,occurrence_date,
  task_participants(user_id)
`;

const plan = (select: string) => ({
  table: "tasks",
  action: "select" as const,
  select,
  conditions: [
    { column: "deleted_at", operator: "is" as const, value: null },
    { or: [
      { column: "approval_status", operator: "eq" as const, value: "approved" },
      { column: "cancelled_at", operator: "is" as const, value: null, negate: true },
    ] },
  ],
  order: [{ column: "deadline", ascending: true }],
});

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms`);
  return out;
}

const users = await withPrivileged((c) =>
  c.query(`select p.id, p.display_name, coalesce(r.role::text,'member') role from public.profiles p left join public.user_roles r on r.user_id=p.id where p.email like 'u%@cen.vn' order by p.email`).then((r) => r.rows),
);
const admin = users.find((u: any) => u.role === "admin");
const member = users.find((u: any) => u.role === "member");

for (const u of [admin, member]) {
  console.log(`\n=== ${u.display_name} (${u.role}) ===`);
  const id = { mode: "user" as const, userId: u.id };
  await time("locked_member_ids", () => runRpcPlan({ fn: "locked_member_ids", args: {}, conditions: [], order: [] }, id));
  await time("current_app_role", () => runRpcPlan({ fn: "current_app_role", args: {}, conditions: [], order: [] }, id));
  await time("member_directory", () => runRpcPlan({ fn: "member_directory", args: {}, conditions: [], order: [] }, id));
  const oldRes: any = await time("tasks SELECT (old, 7 embeds)", () => runQueryPlan(plan(SELECT_OLD), id));
  console.log("  rows:", Array.isArray(oldRes.data) ? oldRes.data.length : oldRes.error);
  const newRes: any = await time("tasks SELECT (new, flat + participants)", () => runQueryPlan(plan(SELECT_NEW), id));
  console.log("  rows:", Array.isArray(newRes.data) ? newRes.data.length : newRes.error);
  await time("projects lookup", () => runQueryPlan({ table: "projects", action: "select", select: "id,name,owner_id,manually_archived_at,responsible_team_id", conditions: [], order: [] }, id));
  await time("teams lookup", () => runQueryPlan({ table: "teams", action: "select", select: "id,name", conditions: [], order: [] }, id));
}
process.exit(0);
