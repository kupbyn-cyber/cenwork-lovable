CREATE OR REPLACE FUNCTION public.task_member_submit(_project uuid, _name text, _description text, _start_date date, _deadline timestamp with time zone, _priority task_priority, _participants uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF public.perm_scope(_uid,'tasks.create') = 'none' THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo công việc';
  END IF;
  IF _project IS NULL THEN RAISE EXCEPTION 'Cần chọn dự án'; END IF;
  IF COALESCE(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Nhập tên công việc'; END IF;
  IF _deadline IS NULL THEN RAISE EXCEPTION 'Nhập deadline'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.deleted_at IS NULL
                   AND p.status <> 'archived' AND p.manually_archived_at IS NULL) THEN
    RAISE EXCEPTION 'Dự án không khả dụng để tạo công việc';
  END IF;
  IF NOT public.is_project_approved(_project) THEN
    RAISE EXCEPTION 'Dự án chưa được duyệt';
  END IF;
  -- Dự án liên quan: Chủ dự án / Người tạo / Team phụ trách / Team tham gia
  IF NOT (public.is_in_project_scope(_project, _uid)
          OR EXISTS (SELECT 1 FROM public.project_members pm
                     WHERE pm.project_id = _project AND pm.user_id = _uid)) THEN
    RAISE EXCEPTION 'Bạn không thuộc phạm vi dự án này';
  END IF;

  SELECT responsible_team_id INTO _team FROM public.projects WHERE id = _project;
  IF _team IS NULL THEN
    RAISE EXCEPTION 'Dự án chưa có Team phụ trách. Vui lòng liên hệ Admin/CMO để cập nhật.';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);

  INSERT INTO public.tasks (name, description, project_id, assignee_id, team_id, start_date,
                            deadline, priority, status, created_by,
                            approval_status, approval_round, submitted_at)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _uid, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), 'not_started', _uid,
          'pending', 1, now())
  RETURNING id INTO _task;

  INSERT INTO public.task_participants (task_id, user_id)
  SELECT _task, u FROM unnest(COALESCE(_participants,'{}'::uuid[])) u
  WHERE u <> _uid AND public.is_in_project_scope(_project, u)
  ON CONFLICT DO NOTHING;

  PERFORM public.task_log_approval_event(_task, 'submitted', 1, NULL);
  PERFORM public.write_audit('task.approval_requested','task',_task,NULL,
    jsonb_build_object('approval_status','pending','round',1), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
  RETURN _task;
END; $function$;

CREATE OR REPLACE FUNCTION public.project_scope_people(_project uuid)
 RETURNS TABLE(id uuid, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pr.id, pr.display_name
  FROM public.profiles pr
  WHERE _project IS NOT NULL
    AND public.can_view_project(_project)
    AND pr.status = 'active'
    AND (public.is_in_project_scope(_project, pr.id)
         OR EXISTS (SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = _project AND pm.user_id = pr.id))
  ORDER BY pr.display_name;
$function$;

REVOKE ALL ON FUNCTION public.project_scope_people(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_scope_people(uuid) TO authenticated;