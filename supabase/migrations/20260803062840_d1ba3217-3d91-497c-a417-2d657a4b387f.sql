-- Helper: thành viên đang hoạt động của một Team (dùng chung, không tạo cách tính song song)
CREATE OR REPLACE FUNCTION public.is_active_team_member(_team uuid, _person uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _team IS NOT NULL AND _person IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = _person
      AND pr.status = 'active'
      AND (
        pr.primary_team_id = _team
        OR EXISTS (SELECT 1 FROM public.team_collaborators tc
                   WHERE tc.team_id = _team AND tc.user_id = _person)
        OR EXISTS (SELECT 1 FROM public.teams t
                   WHERE t.id = _team AND t.leader_id = _person)
      )
  );
$function$;

-- Phạm vi Dự án tính động: Chủ dự án / người tạo / Team phụ trách / Team tham gia
CREATE OR REPLACE FUNCTION public.is_in_project_scope(_project uuid, _person uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND (p.owner_id = _person OR p.created_by = _person))
      OR EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project
                   AND public.is_active_team_member(p.responsible_team_id, _person))
      OR EXISTS (SELECT 1 FROM public.project_teams pt
                 WHERE pt.project_id = _project
                   AND public.is_active_team_member(pt.team_id, _person));
$function$;

-- Quyền xem Dự án dựa trên phạm vi động
CREATE OR REPLACE FUNCTION public.can_view_project(_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH s AS (SELECT public.perm_scope(auth.uid(),'projects.view') AS scope)
  SELECT CASE (SELECT scope FROM s)
    WHEN 'none' THEN false
    WHEN 'organization' THEN true
    ELSE
      EXISTS (SELECT 1 FROM public.projects p
              WHERE p.id = _project AND (p.created_by = auth.uid() OR p.owner_id = auth.uid()))
      OR ((SELECT scope FROM s) <> 'own' AND (
        public.is_in_project_scope(_project, auth.uid())
        OR EXISTS (SELECT 1 FROM public.projects p
                   WHERE p.id = _project AND p.responsible_team_id IS NOT NULL
                     AND p.responsible_team_id = public.leader_team_id(auth.uid()))
        OR EXISTS (SELECT 1 FROM public.projects p JOIN public.profiles c ON c.id = p.created_by
                   WHERE p.id = _project AND p.status = 'leader_review'
                     AND c.primary_team_id IS NOT NULL
                     AND c.primary_team_id = public.leader_team_id(auth.uid()))))
  END;
$function$;

-- Tạo Task: mọi người trong phạm vi Dự án; kết quả (duyệt ngay hay chờ duyệt) vẫn do system role quyết định
CREATE OR REPLACE FUNCTION public.can_create_task(_project uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _project IS NULL THEN public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.leader_team_id(auth.uid()) IS NOT NULL
    WHEN NOT public.is_project_approved(_project) THEN false
    ELSE public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR public.can_manage_project(_project)
      OR (public.leader_team_id(auth.uid()) IS NOT NULL AND public.can_view_project(_project))
      OR (public.is_in_project_scope(_project, auth.uid()) AND public.can_view_project(_project))
  END;
$function$;

COMMENT ON TABLE public.project_members IS 'DEPRECATED làm nguồn quyền: giữ dữ liệu lịch sử; phạm vi Dự án nay tính động qua public.is_in_project_scope().';