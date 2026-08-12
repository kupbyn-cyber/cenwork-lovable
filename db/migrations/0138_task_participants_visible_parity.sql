-- CEN-PERF-04.1 — Phục hồi parity semantics giữa task_participants_visible()
-- và policy tasks_select_scoped (0137). Chỉ sửa thứ tự điều kiện:
-- created_by / assignee_id được xét TRƯỚC, độc lập với project deleted và scope.
-- Vẫn giữ tối ưu set-based + tính uid/scope/leader team một lần (ctx).
CREATE OR REPLACE FUNCTION public.task_participants_visible()
RETURNS TABLE(task_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ctx AS (
    SELECT (SELECT auth.uid()) AS uid,
           (SELECT public.perm_scope(auth.uid(), 'tasks.view')) AS scope,
           (SELECT public.leader_team_id(auth.uid())) AS lteam
  ),
  visible AS (
    SELECT t.id
    FROM public.tasks t, ctx
    WHERE t.deleted_at IS NULL
      AND (
        t.created_by = ctx.uid
        OR t.assignee_id = ctx.uid
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = t.project_id AND p.deleted_at IS NOT NULL
          )
          AND CASE ctx.scope
            WHEN 'none' THEN false
            WHEN 'organization' THEN true
            ELSE (
              ctx.scope <> 'own'
              AND EXISTS (
                SELECT 1 FROM public.task_participants tp
                WHERE tp.task_id = t.id AND tp.user_id = ctx.uid
              )
            )
            OR (
              ctx.scope IN ('team','related_projects')
              AND t.team_id IS NOT NULL
              AND (t.team_id IN (SELECT public.my_team_ids()) OR t.team_id = ctx.lteam)
            )
            OR (
              ctx.scope IN ('team','related_projects')
              AND t.project_id IS NOT NULL
              AND t.project_id IN (
                SELECT p.id FROM public.projects p WHERE public.can_view_project(p.id)
              )
            )
          END
        )
      )
  )
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp, ctx
  WHERE ctx.uid IS NOT NULL
    AND (tp.user_id = ctx.uid OR tp.task_id IN (SELECT id FROM visible));
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible() TO authenticated, service_role;
