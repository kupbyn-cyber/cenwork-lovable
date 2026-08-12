-- TASK-PERF-01 — chính sách xem Task viết lại thành dạng tập hợp.
-- Điều kiện y hệt can_view_task(id) nhưng phép kiểm tra dự án chạy một lần cho
-- toàn truy vấn (IN (SELECT ...)) thay vì gọi lại cho từng dòng Task.
DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id AND p.deleted_at IS NOT NULL
      )
      AND CASE public.perm_scope(auth.uid(), 'tasks.view')
        WHEN 'none' THEN false
        WHEN 'organization' THEN true
        ELSE (
          public.perm_scope(auth.uid(), 'tasks.view') <> 'own'
          AND EXISTS (
            SELECT 1 FROM public.task_participants tp
            WHERE tp.task_id = tasks.id AND tp.user_id = auth.uid()
          )
        )
        OR (
          public.perm_scope(auth.uid(), 'tasks.view') IN ('team', 'related_projects')
          AND tasks.team_id IS NOT NULL
          AND (
            tasks.team_id IN (SELECT public.my_team_ids())
            OR tasks.team_id = public.leader_team_id(auth.uid())
          )
        )
        OR (
          public.perm_scope(auth.uid(), 'tasks.view') IN ('team', 'related_projects')
          AND tasks.project_id IS NOT NULL
          AND tasks.project_id IN (
            SELECT p.id FROM public.projects p WHERE public.can_view_project(p.id)
          )
        )
      END
    )
  )
);
