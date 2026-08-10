import type { ProjectRow } from "@/lib/project-data";
import type { TaskRow } from "@/lib/task-data";

/**
 * CEN-VIEW-REPORT-UX-COMPACT-01 — bộ lọc nhanh "Của tôi".
 * Chỉ lọc hiển thị trên dữ liệu người dùng vốn đã được phép xem (RLS);
 * không mở thêm quyền xem và không đổi quyền thao tác.
 */
export interface MineScope {
  userId: string | null;
  /** Team người dùng đang thuộc về (Team chính) hoặc đang làm Leader. */
  teamIds: string[];
}

export function buildMineScope(
  userId: string | null,
  leaderTeamId: string | null,
  primaryTeamId: string | null,
): MineScope {
  const teamIds = [leaderTeamId, primaryTeamId].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return { userId, teamIds: [...new Set(teamIds)] };
}

function shareTeam(scope: MineScope, teamIds: (string | null | undefined)[]) {
  return teamIds.some((id) => Boolean(id) && scope.teamIds.includes(id!));
}

/** Task liên quan trực tiếp tới người dùng hiện tại. */
export function isTaskMine(
  task: TaskRow,
  scope: MineScope,
  projectById: Map<string, ProjectRow>,
): boolean {
  const me = scope.userId;
  if (!me) return false;
  if (task.assignee_id === me) return true;
  if (task.created_by === me) return true;
  if (task.reviewer_id === me) return true;
  if (task.participantIds.includes(me)) return true;
  if (task.projectOwnerId === me) return true;
  if (shareTeam(scope, [task.team_id, task.projectResponsibleTeamId])) return true;
  const project = task.project_id ? projectById.get(task.project_id) : undefined;
  if (project) {
    if (project.owner_id === me || project.created_by === me) return true;
    if (shareTeam(scope, [project.responsible_team_id, ...project.teamIds])) return true;
  }
  return false;
}

/** Dự án liên quan trực tiếp tới người dùng hiện tại. */
export function isProjectMine(
  project: ProjectRow,
  scope: MineScope,
  tasks: TaskRow[],
): boolean {
  const me = scope.userId;
  if (!me) return false;
  if (project.owner_id === me || project.created_by === me) return true;
  if (shareTeam(scope, [project.responsible_team_id, ...project.teamIds])) return true;
  return tasks.some(
    (task) =>
      task.project_id === project.id &&
      (task.assignee_id === me ||
        task.created_by === me ||
        task.reviewer_id === me ||
        task.participantIds.includes(me)),
  );
}
