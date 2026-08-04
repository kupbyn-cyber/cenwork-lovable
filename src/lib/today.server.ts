import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { isSystemAdminRole, PERMISSIONS, type AppRoleKey } from "@/lib/permissions";
import {
  ACTION_REASON_WEIGHT,
  mergeActionItems,
  priorityOfWeight,
  type ActionItem,
  type ActionModule,
  type ActionReason,
  type QuickActionKind,
  type TodayHubResult,
} from "@/lib/today-hub";

/**
 * CEN TODAY-01 — tổng hợp việc cần xử lý cho Trang chủ.
 * Chạy bằng phiên của chính người gọi nên RLS vẫn là ranh giới dữ liệu cuối cùng;
 * phần lọc theo vai trò ở đây chỉ để không hiển thị việc không thuộc trách nhiệm.
 * Không tạo Business Rule mới: mọi trạng thái đều đọc từ bảng gốc của từng module.
 */
type Client = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
const HANOI_OFFSET_MS = 7 * 60 * 60 * 1000;

function hanoiToday(now = new Date()): string {
  return new Date(now.getTime() + HANOI_OFFSET_MS).toISOString().slice(0, 10);
}

/** Thứ Hai của tuần chứa ngày `dateStr` (theo lịch Hà Nội). */
function weekStartOf(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00+07:00`);
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - day * DAY_MS).toISOString().slice(0, 10);
}

function item(input: {
  module: ActionModule;
  objectId: string;
  title: string;
  summary?: string | null;
  reason: ActionReason;
  deadline?: string | null;
  createdAt?: string | null;
  route: string;
  quickAction?: QuickActionKind;
}): ActionItem {
  const weight = ACTION_REASON_WEIGHT[input.reason];
  return {
    key: `${input.module}:${input.objectId}`,
    module: input.module,
    object_id: input.objectId,
    title: input.title,
    summary: input.summary ?? null,
    reasons: [input.reason],
    priority: priorityOfWeight(weight),
    weight,
    deadline: input.deadline ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
    target_route: input.route,
    quick_action: input.quickAction ?? "open",
  };
}

export async function buildTodayHub(
  supabase: Client,
  userId: string,
  role: AppRoleKey | null,
  leaderTeamId: string | null,
): Promise<TodayHubResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + DAY_MS).toISOString();
  const today = hanoiToday(now);
  const thisWeek = weekStartOf(today);
  const privileged = isSystemAdminRole(role);

  // ROLE-01: quyền hiệu lực đọc từ database, fail closed khi không tải được.
  const permissionSet = new Set<string>();
  try {
    const perms = await supabase.rpc("perm_effective_for", { _user: userId });
    for (const row of (perms.data ?? []) as { permission_key: string; enabled: boolean }[]) {
      if (row.enabled) permissionSet.add(row.permission_key);
    }
  } catch (error) {
    console.error("[today-hub] permissions", error);
  }
  const can = (permission: string) => permissionSet.has(permission);

  const rows: ActionItem[] = [];
  const failedSources: string[] = [];

  async function source(name: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      console.error(`[today-hub] ${name}`, error);
      failedSources.push(name);
    }
  }

  function check(error: { message: string } | null) {
    if (error) throw new Error(error.message);
  }

  // 1 + 7. Thông báo nội bộ bắt buộc xác nhận (quá hạn = khóa thao tác).
  await source("announcements", async () => {
    const { data, error } = await supabase
      .from("announcement_recipients")
      .select(
        "id,announcement_id,status,due_at,created_at,announcements!inner(title,status,revoked_at,archived_at,published_at)",
      )
      .eq("user_id", userId)
      .in("status", ["unread", "reading"])
      .limit(100);
    check(error);
    for (const raw of data ?? []) {
      const announcement = raw.announcements as unknown as {
        title: string;
        status: string;
        revoked_at: string | null;
        archived_at: string | null;
        published_at: string | null;
      };
      if (announcement.status !== "published") continue;
      if (announcement.revoked_at || announcement.archived_at) continue;
      const overdue = new Date(raw.due_at).getTime() < now.getTime();
      rows.push(
        item({
          module: "announcement",
          objectId: raw.announcement_id,
          title: announcement.title,
          summary: overdue
            ? "Thông báo quá hạn — thao tác nghiệp vụ đang bị khóa."
            : "Cần xác nhận đã đọc.",
          reason: overdue ? "announcement_overdue" : "announcement_pending",
          deadline: raw.due_at,
          createdAt: announcement.published_at ?? raw.created_at,
          route: `/announcements/${raw.announcement_id}`,
          quickAction: "acknowledge_announcement",
        }),
      );
    }
  });

  // NAP-05. Yêu cầu phê duyệt đang chờ chính mình xử lý (chỉ phiên bản hiện tại).
  await source("approvals", async () => {
    const { data, error } = await supabase
      .from("approval_decisions")
      .select(
        "id,version_no,approval_request_id,decision_status,approval_requests!inner(id,title,status,due_at,current_version,created_at)",
      )
      .eq("approver_id", userId)
      .eq("decision_status", "pending")
      .limit(100);
    check(error);
    for (const raw of data ?? []) {
      const request = raw.approval_requests as unknown as {
        title: string;
        status: string;
        due_at: string;
        current_version: number;
        created_at: string;
      };
      if (raw.version_no !== request.current_version) continue;
      if (request.status !== "pending" && request.status !== "overdue") continue;
      const overdue = new Date(request.due_at).getTime() < now.getTime();
      rows.push(
        item({
          module: "approval",
          objectId: raw.approval_request_id,
          title: request.title,
          summary: overdue
            ? "Yêu cầu phê duyệt đã quá hạn xử lý."
            : "Yêu cầu phê duyệt đang chờ bạn quyết định.",
          reason: overdue ? "approval_overdue" : "awaiting_my_approval",
          deadline: request.due_at,
          createdAt: request.created_at,
          route: `/approvals/${raw.approval_request_id}`,
          quickAction: "open_review",
        }),
      );
    }
  });

  // 8. Nhắc tên và trả lời bình luận chưa đọc.

  await source("mentions", async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,entity_id,link,created_at,event_type")
      .is("read_at", null)
      .in("event_type", [
        "announcement.mentioned",
        "announcement.comment_replied",
        "approval.mentioned",
      ])
      .order("created_at", { ascending: false })
      .limit(50);
    check(error);
    for (const row of data ?? []) {
      rows.push(
        item({
          module: row.event_type.startsWith("approval.") ? "approval" : "announcement",
          objectId: row.entity_id ?? row.id,
          title: row.body ?? row.title,
          summary: row.title,
          reason: "mention",
          createdAt: row.created_at,
          route: row.link ?? "/notifications",
        }),
      );
    }
  });

  // 2 + 4 + 6 + 3(Task chờ kiểm tra). Một truy vấn duy nhất cho Task (không N+1).
  await source("tasks", async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id,name,status,deadline,priority,assignee_id,team_id,created_by,created_at,is_archived",
      )
      .is("deleted_at", null)
      .eq("approval_status", "approved")
      .eq("is_archived", false)
      .neq("status", "done")
      .limit(500);
    check(error);
    for (const task of data ?? []) {
      // TODAY-ACTION-SCOPE-01: chỉ người phụ trách mới có hành động cụ thể.
      // Người tham gia/phối hợp hoặc quyền xem toàn hệ thống không đưa Task vào đây.
      const mine = task.assignee_id === userId;
      const deadlineMs = new Date(task.deadline).getTime();
      const route = `/tasks/${task.id}`;

      if (mine && deadlineMs < now.getTime()) {
        rows.push(
          item({
            module: "task",
            objectId: task.id,
            title: task.name,
            summary: "Công việc của bạn đã quá hạn.",
            reason: "task_overdue",
            deadline: task.deadline,
            createdAt: task.created_at,
            route,
            quickAction: "complete_task",
          }),
        );
      } else if (mine && task.deadline <= soonIso && task.deadline >= nowIso) {
        rows.push(
          item({
            module: "task",
            objectId: task.id,
            title: task.name,
            summary: "Đến hạn trong 24 giờ tới.",
            reason: "task_due_soon",
            deadline: task.deadline,
            createdAt: task.created_at,
            route,
            quickAction: "complete_task",
          }),
        );
      }

      // Chỉ người kiểm tra đích danh: người tạo Task hoặc Leader của Team phụ trách.
      const canReview =
        task.status === "review" &&
        task.assignee_id !== userId &&
        (task.created_by === userId ||
          (leaderTeamId !== null && task.team_id === leaderTeamId));
      if (canReview) {
        rows.push(
          item({
            module: "task",
            objectId: task.id,
            title: task.name,
            summary: "Công việc đang chờ bạn kiểm tra.",
            reason: "awaiting_my_review",
            deadline: task.deadline,
            createdAt: task.created_at,
            route,
            quickAction: "open_review",
          }),
        );
      }
    }
  });

  // 3. Dự án đang chờ đúng bước duyệt của người dùng.
  await source("projects", async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,objective,status,responsible_team_id,created_by,submitted_at,created_at")
      .is("deleted_at", null)
      .in("status", ["leader_review", "proposal"])
      .limit(200);
    check(error);
    for (const project of data ?? []) {
      const stage = project.status === "leader_review" ? "leader" : "cmo";
      // Chỉ người duyệt đang đến lượt: CMO/Admin ở bước CMO, Leader phụ trách ở bước Leader.
      const canDecide =
        project.created_by !== userId &&
        (stage === "cmo"
          ? privileged
          : leaderTeamId !== null && project.responsible_team_id === leaderTeamId);
      if (!canDecide) continue;
      rows.push(
        item({
          module: "project",
          objectId: project.id,
          title: project.name,
          summary:
            stage === "leader" ? "Chờ duyệt ở bước Leader." : "Chờ duyệt ở bước CMO.",
          reason: "awaiting_my_approval",
          createdAt: project.submitted_at ?? project.created_at,
          route: `/projects/${project.id}`,
          quickAction: "open_review",
        }),
      );
    }
  });

  // 2 + 5 + 3. Báo cáo ngày: bị yêu cầu sửa, đến hạn hôm nay, chờ duyệt.
  await source("daily_reports", async () => {
    // REPORT-FIX-01: Admin/CMO được miễn báo cáo ngày.
    const exemptAuthors = new Set<string>();
    const { data: exemptRows } = await supabase
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["admin", "cmo"])
      .limit(1000);
    for (const row of exemptRows ?? []) exemptAuthors.add(row.user_id);

    const { data, error } = await supabase
      .from("daily_reports")
      .select("id,report_date,author_id,team_id,status,created_at,updated_at")
      .or(`author_id.eq.${userId},status.eq.submitted`)
      .gte("report_date", thisWeek)
      .limit(300);
    check(error);
    const list = data ?? [];

    for (const report of list) {
      if (exemptAuthors.has(report.author_id)) continue;
      if (report.author_id === userId && report.status === "changes_requested") {
        rows.push(
          item({
            module: "daily_report",
            objectId: report.id,
            title: `Báo cáo ngày ${report.report_date}`,
            summary: "Người duyệt yêu cầu bạn chỉnh sửa và gửi lại.",
            reason: "changes_requested",
            createdAt: report.updated_at,
            route: `/reports/daily/${report.id}`,
          }),
        );
        continue;
      }
      const canReviewDaily =
        report.status === "submitted" &&
        report.author_id !== userId &&
        (privileged || (leaderTeamId !== null && report.team_id === leaderTeamId)) &&
        can(PERMISSIONS.REPORTS_REVIEW_DAILY);
      if (canReviewDaily) {
        rows.push(
          item({
            module: "daily_report",
            objectId: report.id,
            title: `Báo cáo ngày ${report.report_date}`,
            summary: "Báo cáo đang chờ bạn duyệt.",
            reason: "awaiting_my_approval",
            createdAt: report.updated_at,
            route: `/reports/daily/${report.id}`,
            quickAction: "open_review",
          }),
        );
      }
    }

    if (can(PERMISSIONS.REPORTS_SUBMIT_DAILY) && !privileged) {
      const mineToday = list.find(
        (row) => row.author_id === userId && row.report_date === today,
      );
      const done = mineToday && (mineToday.status === "submitted" || mineToday.status === "approved");
      if (!done && !(mineToday && mineToday.status === "changes_requested")) {
        rows.push(
          item({
            module: "daily_report",
            objectId: mineToday?.id ?? `daily-${today}`,
            title: `Báo cáo ngày ${today}`,
            summary: mineToday ? "Bản nháp chưa được gửi." : "Bạn chưa gửi báo cáo hôm nay.",
            reason: "report_due",
            deadline: `${today}T18:00:00+07:00`,
            createdAt: mineToday?.created_at ?? `${today}T00:00:00+07:00`,
            route: mineToday ? `/reports/daily/${mineToday.id}` : "/reports",
            quickAction: "submit_daily_report",
          }),
        );
      }
    }
  });

  // 2 + 5 + 3. Báo cáo tuần của Team.
  await source("weekly_reports", async () => {
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("id,week_start,team_id,leader_id,status,created_at,updated_at")
      .gte("week_start", weekStartOf(hanoiToday(new Date(now.getTime() - 7 * DAY_MS))))
      .limit(200);
    check(error);
    const list = data ?? [];

    for (const report of list) {
      if (report.leader_id === userId && report.status === "changes_requested") {
        rows.push(
          item({
            module: "weekly_report",
            objectId: report.id,
            title: `Báo cáo tuần ${report.week_start}`,
            summary: "Người duyệt yêu cầu bạn chỉnh sửa và gửi lại.",
            reason: "changes_requested",
            createdAt: report.updated_at,
            route: `/reports/weekly/${report.id}`,
          }),
        );
        continue;
      }
      if (
        report.status === "submitted" &&
        report.leader_id !== userId &&
        can(PERMISSIONS.REPORTS_REVIEW_WEEKLY)
      ) {
        rows.push(
          item({
            module: "weekly_report",
            objectId: report.id,
            title: `Báo cáo tuần ${report.week_start}`,
            summary: "Báo cáo tuần đang chờ bạn duyệt.",
            reason: "awaiting_my_approval",
            createdAt: report.updated_at,
            route: `/reports/weekly/${report.id}`,
            quickAction: "open_review",
          }),
        );
      }
    }

    if (leaderTeamId && can(PERMISSIONS.REPORTS_SUBMIT_WEEKLY)) {
      const mine = list.find(
        (row) => row.team_id === leaderTeamId && row.week_start === thisWeek,
      );
      const done = mine && (mine.status === "submitted" || mine.status === "approved");
      if (!done && !(mine && mine.status === "changes_requested")) {
        rows.push(
          item({
            module: "weekly_report",
            objectId: mine?.id ?? `weekly-${thisWeek}`,
            title: `Báo cáo tuần ${thisWeek}`,
            summary: mine ? "Bản nháp chưa được gửi." : "Team của bạn chưa gửi báo cáo tuần.",
            reason: "report_due",
            createdAt: mine?.created_at ?? `${thisWeek}T00:00:00+07:00`,
            route: mine ? `/reports/weekly/${mine.id}` : "/reports",
          }),
        );
      }
    }
  });

  const items = mergeActionItems(rows);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of items) counts[row.priority] += 1;

  return {
    items,
    total: items.length,
    counts,
    failedSources,
    generated_at: nowIso,
  };
}
