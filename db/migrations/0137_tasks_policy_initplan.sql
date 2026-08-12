-- CEN-PERF-04 — Bỏ chi phí gọi hàm quyền theo từng dòng Task.
-- Các giá trị chỉ phụ thuộc người dùng (perm_scope, leader_team_id, auth.uid())
-- được bọc trong scalar subquery để PostgreSQL tính MỘT LẦN cho mỗi câu lệnh
-- (InitPlan) thay vì gọi lại cho từng dòng. Điều kiện được phép xem Task
-- giữ nguyên tuyệt đối so với 0136.
DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    created_by = (SELECT auth.uid())
    OR assignee_id = (SELECT auth.uid())
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id AND p.deleted_at IS NOT NULL
      )
      AND CASE (SELECT public.perm_scope(auth.uid(), 'tasks.view'))
        WHEN 'none' THEN false
        WHEN 'organization' THEN true
        ELSE (
          (SELECT public.perm_scope(auth.uid(), 'tasks.view')) <> 'own'
          AND EXISTS (
            SELECT 1 FROM public.task_participants tp
            WHERE tp.task_id = tasks.id AND tp.user_id = (SELECT auth.uid())
          )
        )
        OR (
          (SELECT public.perm_scope(auth.uid(), 'tasks.view')) IN ('team', 'related_projects')
          AND tasks.team_id IS NOT NULL
          AND (
            tasks.team_id IN (SELECT public.my_team_ids())
            OR tasks.team_id = (SELECT public.leader_team_id(auth.uid()))
          )
        )
        OR (
          (SELECT public.perm_scope(auth.uid(), 'tasks.view')) IN ('team', 'related_projects')
          AND tasks.project_id IS NOT NULL
          AND tasks.project_id IN (
            SELECT p.id FROM public.projects p WHERE public.can_view_project(p.id)
          )
        )
      END
    )
  )
);

-- Người tham gia: giữ nguyên điều kiện của can_view_task nhưng đánh giá theo tập hợp,
-- không gọi can_view_task() lại cho từng Task.
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
      AND NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = t.project_id AND p.deleted_at IS NOT NULL
      )
      AND ctx.scope <> 'none'
      AND (
        ctx.scope = 'organization'
        OR t.created_by = ctx.uid
        OR t.assignee_id = ctx.uid
        OR (ctx.scope <> 'own' AND EXISTS (
              SELECT 1 FROM public.task_participants tp
              WHERE tp.task_id = t.id AND tp.user_id = ctx.uid))
        OR (ctx.scope IN ('team','related_projects') AND t.team_id IS NOT NULL
            AND (t.team_id IN (SELECT public.my_team_ids()) OR t.team_id = ctx.lteam))
        OR (ctx.scope IN ('team','related_projects') AND t.project_id IS NOT NULL
            AND t.project_id IN (SELECT p.id FROM public.projects p WHERE public.can_view_project(p.id)))
      )
  )
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp, ctx
  WHERE ctx.uid IS NOT NULL
    AND (tp.user_id = ctx.uid OR tp.task_id IN (SELECT id FROM visible));
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible() TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_task_participants_user ON public.task_participants (user_id);
