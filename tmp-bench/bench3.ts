import { withPrivileged, withUser } from "@/db/pool.server";
const SEL = `select id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,is_archived,completed_at,manually_archived_at,manually_archived_by,cancelled_at,cancelled_by,cancel_reason,result_text,result_updated_at,result_updated_by,created_by,created_at,updated_at,approval_status,approval_round,submitted_at,approval_decided_at,approval_decided_by,approval_note,reviewer_type,reviewer_id,recurrence_rule_id,occurrence_date from tasks where deleted_at is null and (approval_status='approved' or cancelled_at is not null) order by deadline`;

async function run(label: string, email: string) {
  const u = await withPrivileged((c) => c.query("select id from public.profiles where email=$1", [email]).then((r) => r.rows[0]));
  // 5 truy vấn chạy song song trên 5 kết nối, đúng như trình duyệt gọi 5 request
  const t0 = performance.now();
  const [tasks, parts, dir, projs, teams] = await Promise.all([
    withUser(u.id, (c) => c.query(SEL)),
    withUser(u.id, (c) => c.query("select * from task_participants_visible()")),
    withUser(u.id, (c) => c.query("select id,display_name,primary_team_id from member_directory()")),
    withUser(u.id, (c) => c.query("select id,name,owner_id,manually_archived_at,responsible_team_id from projects")),
    withUser(u.id, (c) => c.query("select id,name from teams")),
  ]);
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms tasks=${tasks.rowCount} participants=${parts.rowCount} directory=${dir.rowCount} projects=${projs.rowCount} teams=${teams.rowCount}`);
}
await run("admin", "u1@cen.vn");
await run("member", "u30@cen.vn");
process.exit(0);
