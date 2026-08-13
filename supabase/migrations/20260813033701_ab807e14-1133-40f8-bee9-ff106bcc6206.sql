DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid);
DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, uuid);
DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, smallint);
DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, smallint, uuid);

CREATE FUNCTION public.task_member_submit(
  _project uuid, _name text, _description text, _start_date date,
  _deadline timestamp with time zone, _priority task_priority,
  _participants uuid[] DEFAULT '{}'::uuid[],
  _reviewer_type text DEFAULT NULL::text,
  _reviewer uuid DEFAULT NULL::uuid,
  _work_weight smallint DEFAULT 2::smallint,
  _assignee uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
        _rtype text := _reviewer_type; _rid uuid := _reviewer;
        _w smallint := COALESCE(_work_weight, 2::smallint);
        _person uuid := COALESCE(_assignee, auth.uid());
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF public.perm_scope(_uid,'tasks.create') = 'none' THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo công việc';
  END IF;
  IF _project IS NULL THEN RAISE EXCEPTION 'Cần chọn dự án'; END IF;
  IF COALESCE(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Nhập tên công việc'; END IF;
  IF _deadline IS NULL THEN RAISE EXCEPTION 'Nhập deadline'; END IF;
  IF _w NOT IN (1,2,3,5) THEN
    RAISE EXCEPTION 'Trọng số công việc chỉ nhận 1, 2, 3 hoặc 5';
  END IF;
  IF NOT public.can_set_work_weight(_uid, _w) THEN
    RAISE EXCEPTION 'Chỉ Leader, CMO hoặc Admin được đặt Trọng số Trọng điểm (5)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = _project AND p.deleted_at IS NULL
                   AND p.status <> 'archived' AND p.manually_archived_at IS NULL) THEN
    RAISE EXCEPTION 'Dự án không khả dụng để tạo công việc';
  END IF;
  IF NOT public.is_project_approved(_project) THEN
    RAISE EXCEPTION 'Dự án chưa được duyệt';
  END IF;
  IF NOT (public.is_in_project_scope(_project, _uid)
          OR EXISTS (SELECT 1 FROM public.project_members pm
                     WHERE pm.project_id = _project AND pm.user_id = _uid)) THEN
    RAISE EXCEPTION 'Bạn không thuộc phạm vi dự án này';
  END IF;

  IF _person <> _uid THEN
    IF NOT (public.is_in_project_scope(_project, _person)
            OR EXISTS (SELECT 1 FROM public.project_members pm
                       WHERE pm.project_id = _project AND pm.user_id = _person)) THEN
      RAISE EXCEPTION 'Người nhận việc không thuộc phạm vi dự án này';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _person AND pr.status = 'active') THEN
      RAISE EXCEPTION 'Người nhận việc không còn hoạt động';
    END IF;
    IF NOT public.can_assign_task(_project, NULL, _person) THEN
      RAISE EXCEPTION 'Bạn chỉ được giao việc cho người khác khi là Chủ dự án, Leader hoặc Admin/CMO';
    END IF;
  END IF;

  IF _rtype IS NULL OR _rid IS NULL THEN
    SELECT c.kind, c.user_id INTO _rtype, _rid
    FROM public.task_reviewer_candidates(_project, _uid) c
    WHERE c.kind = 'project_owner' LIMIT 1;
  END IF;
  IF _rtype IS NULL OR _rid IS NULL THEN
    RAISE EXCEPTION 'Cần chọn Người duyệt hợp lệ';
  END IF;
  IF NOT public.task_reviewer_is_valid(_project, _rtype, _rid, _uid) THEN
    RAISE EXCEPTION 'Người duyệt không hợp lệ. Chỉ được chọn Chủ dự án, Leader của bạn hoặc CMO.';
  END IF;

  SELECT responsible_team_id INTO _team FROM public.projects WHERE id = _project;
  IF _team IS NULL THEN
    RAISE EXCEPTION 'Dự án chưa có Team phụ trách. Vui lòng liên hệ Admin/CMO để cập nhật.';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);

  INSERT INTO public.tasks (name, description, project_id, assignee_id, team_id, start_date,
                            deadline, priority, work_weight, status, created_by,
                            approval_status, approval_round, submitted_at,
                            reviewer_type, reviewer_id)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _person, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), _w, 'not_started', _uid,
          'pending', 1, now(), _rtype, _rid)
  RETURNING id INTO _task;

  INSERT INTO public.task_participants (task_id, user_id)
  SELECT DISTINCT _task, u FROM unnest(COALESCE(_participants,'{}'::uuid[])) u
  WHERE u <> _person AND u <> _uid AND public.is_in_project_scope(_project, u)
  ON CONFLICT DO NOTHING;

  PERFORM public.task_log_approval_event(_task, 'submitted', 1, NULL);
  PERFORM public.write_audit('task.approval_requested','task',_task,NULL,
    jsonb_build_object('approval_status','pending','round',1), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
  RETURN _task;
END $function$;

REVOKE ALL ON FUNCTION public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, smallint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, smallint, uuid) TO authenticated;