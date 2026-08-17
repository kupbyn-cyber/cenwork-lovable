-- TASK-PERM-01 — Mọi user đã đăng nhập được XEM toàn bộ Project và Task thuộc Project.
-- Task độc lập (project_id IS NULL) giữ nguyên logic visibility cũ.
-- Chỉ thay đổi READ. Mọi quyền thao tác (edit/complete/approve/cancel/assign/deadline)
-- vẫn do can_manage_task / can_edit_task_row / các RPC kiểm tra như trước.
-- Giữ tối ưu PERF-04: uid/scope/leader_team tính một lần (InitPlan), set-based.

-- ============ PROJECT: mọi user đăng nhập đều xem được ============
DROP POLICY IF EXISTS projects_select_scoped ON public.projects;
CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (SELECT auth.uid()) IS NOT NULL);

-- ============ TASK: Task thuộc Project mở cho toàn CEN ============
DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
FOR SELECT
USING (
  deleted_at IS NULL
  AND (SELECT auth.uid()) IS NOT NULL
  AND (
    created_by = (SELECT auth.uid())
    OR assignee_id = (SELECT auth.uid())
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = tasks.project_id AND p.deleted_at IS NOT NULL
      )
      AND (
        -- Task thuộc Project: mọi user đăng nhập được xem
        tasks.project_id IS NOT NULL
        -- Task độc lập: giữ nguyên logic cũ
        OR CASE (SELECT public.perm_scope(auth.uid(), 'tasks.view'))
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
        END
      )
    )
  )
);

-- ============ can_view_task: parity với RLS mới ============
CREATE OR REPLACE FUNCTION public.can_view_task(_task uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ctx AS (
    SELECT auth.uid() AS uid,
           public.perm_scope(auth.uid(), 'tasks.view') AS scope,
           public.leader_team_id(auth.uid()) AS lteam
  )
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t, ctx
    WHERE t.id = _task
      AND t.deleted_at IS NULL
      AND ctx.uid IS NOT NULL
      AND (
        t.created_by = ctx.uid
        OR t.assignee_id = ctx.uid
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = t.project_id AND p.deleted_at IS NOT NULL
          )
          AND (
            t.project_id IS NOT NULL
            OR CASE ctx.scope
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
            END
          )
        )
      )
  );
$$;

-- ============ task_participants_visible: parity, giữ set-based ============
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
          AND (
            t.project_id IS NOT NULL
            OR CASE ctx.scope
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
            END
          )
        )
      )
  )
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp, ctx
  WHERE ctx.uid IS NOT NULL
    AND (tp.user_id = ctx.uid OR tp.task_id IN (SELECT id FROM visible));
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_task(uuid) TO authenticated, service_role;

-- ============ Bản theo dự án (CEN-PERF-05) đồng bộ visibility mới ============
CREATE OR REPLACE FUNCTION public.task_participants_visible(_project uuid)
RETURNS TABLE(task_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tp.task_id, tp.user_id
  FROM public.task_participants tp
  WHERE auth.uid() IS NOT NULL
    AND tp.task_id IN (
      SELECT t.id FROM public.tasks t
      WHERE t.deleted_at IS NULL
        AND t.project_id = _project
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR NOT EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = t.project_id AND p.deleted_at IS NOT NULL
          )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.task_participants_visible(uuid) TO authenticated, service_role;

-- ============ Dữ liệu phụ trợ của Project mở theo đúng READ mới ============
-- Chỉ READ. Quyền ghi/xóa vẫn dùng can_edit_project_row như trước.
DROP POLICY IF EXISTS project_teams_select ON public.project_teams;
CREATE POLICY project_teams_select ON public.project_teams
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = project_teams.project_id AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS project_facilities_select ON public.project_facilities;
CREATE POLICY project_facilities_select ON public.project_facilities
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = project_facilities.project_id AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = project_members.project_id AND p.deleted_at IS NULL));
