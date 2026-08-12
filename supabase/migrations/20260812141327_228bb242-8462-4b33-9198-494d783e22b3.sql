CREATE OR REPLACE FUNCTION public.project_task_overview()
RETURNS TABLE(project_id uuid, total bigint, active bigint, overdue bigint, done bigint, mine boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH ctx AS (SELECT (SELECT auth.uid()) AS uid)
  SELECT t.project_id,
         count(*)::bigint AS total,
         count(*) FILTER (
           WHERE t.status <> 'done'
             AND t.is_archived = false
             AND t.manually_archived_at IS NULL
         )::bigint AS active,
         count(*) FILTER (
           WHERE t.status <> 'done'
             AND t.is_archived = false
             AND t.cancelled_at IS NULL
             AND t.deadline < now()
         )::bigint AS overdue,
         count(*) FILTER (WHERE t.status = 'done')::bigint AS done,
         bool_or(
           ctx.uid IS NOT NULL AND (
             t.assignee_id = ctx.uid
             OR t.created_by = ctx.uid
             OR t.reviewer_id = ctx.uid
             OR EXISTS (
               SELECT 1 FROM public.task_participants tp
               WHERE tp.task_id = t.id AND tp.user_id = ctx.uid
             )
           )
         ) AS mine
  FROM public.tasks t, ctx
  WHERE t.deleted_at IS NULL
    AND t.project_id IS NOT NULL
    AND (t.approval_status = 'approved' OR t.cancelled_at IS NOT NULL)
  GROUP BY t.project_id;
$$;

GRANT EXECUTE ON FUNCTION public.project_task_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.task_participants_visible(_project uuid)
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
      AND t.project_id = _project
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
              AND public.can_view_project(t.project_id)
            )
          END
        )
      )
  )
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp, ctx
  WHERE ctx.uid IS NOT NULL
    AND tp.task_id IN (SELECT id FROM visible);
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible(uuid) TO authenticated, service_role;