-- 1) Reviewer columns
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reviewer_type text,
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_reviewer_type_check') THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_reviewer_type_check
      CHECK (reviewer_type IS NULL OR reviewer_type IN ('project_owner','my_leader','cmo'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_reviewer_id_idx ON public.tasks(reviewer_id);

-- 2) Reviewer candidates for a given project + a given actor
CREATE OR REPLACE FUNCTION public.task_reviewer_candidates(_project uuid, _actor uuid DEFAULT NULL)
RETURNS TABLE(kind text, user_id uuid, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT COALESCE(_actor, auth.uid()) AS uid)
  SELECT 'project_owner'::text, p.id, p.display_name
  FROM public.projects pj
  JOIN public.profiles p ON p.id = pj.owner_id AND p.status = 'active'
  WHERE _project IS NOT NULL AND pj.id = _project
  UNION ALL
  SELECT 'my_leader'::text, p.id, p.display_name
  FROM me
  JOIN public.profiles mine ON mine.id = me.uid
  JOIN public.teams t ON t.id = mine.primary_team_id
  JOIN public.profiles p ON p.id = t.leader_id AND p.status = 'active'
  WHERE p.id IS NOT NULL
  UNION ALL
  SELECT 'cmo'::text, p.id, p.display_name
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id AND p.status = 'active'
  WHERE ur.role = 'cmo'
  ORDER BY 1, 3
$$;

GRANT EXECUTE ON FUNCTION public.task_reviewer_candidates(uuid, uuid) TO authenticated;

-- 3) Validation helper
CREATE OR REPLACE FUNCTION public.task_reviewer_is_valid(_project uuid, _type text, _reviewer uuid, _actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_reviewer_candidates(_project, _actor) c
    WHERE c.kind = _type AND c.user_id = _reviewer
  );
$$;

GRANT EXECUTE ON FUNCTION public.task_reviewer_is_valid(uuid, text, uuid, uuid) TO authenticated;

-- 4) Enforce on write
CREATE OR REPLACE FUNCTION public.tasks_enforce_reviewer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _actor uuid := COALESCE(auth.uid(), NEW.created_by);
BEGIN
  IF NEW.reviewer_type IS NULL AND NEW.reviewer_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT 'project_owner', owner_id INTO NEW.reviewer_type, NEW.reviewer_id
    FROM public.projects WHERE id = NEW.project_id AND owner_id IS NOT NULL;
    RETURN NEW;
  END IF;

  IF NEW.reviewer_type IS NULL AND NEW.reviewer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.reviewer_type IS NOT DISTINCT FROM OLD.reviewer_type
     AND NEW.reviewer_id IS NOT DISTINCT FROM OLD.reviewer_id THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewer_type IS NULL OR NEW.reviewer_id IS NULL THEN
    RAISE EXCEPTION 'Cần chọn Người duyệt hợp lệ';
  END IF;

  IF NOT public.task_reviewer_is_valid(NEW.project_id, NEW.reviewer_type, NEW.reviewer_id, _actor) THEN
    RAISE EXCEPTION 'Người duyệt không hợp lệ. Chỉ được chọn Chủ dự án, Leader của bạn hoặc CMO.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_enforce_reviewer_trg ON public.tasks;
CREATE TRIGGER tasks_enforce_reviewer_trg
  BEFORE INSERT OR UPDATE OF reviewer_type, reviewer_id, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_enforce_reviewer();

-- 5) Backfill existing project tasks
UPDATE public.tasks t
   SET reviewer_type = 'project_owner', reviewer_id = p.owner_id
  FROM public.projects p
 WHERE t.project_id = p.id
   AND t.reviewer_id IS NULL
   AND p.owner_id IS NOT NULL;

-- 6) Member submission carries the reviewer choice
CREATE OR REPLACE FUNCTION public.task_member_submit(
  _project uuid, _name text, _description text, _start_date date,
  _deadline timestamp with time zone, _priority task_priority,
  _participants uuid[] DEFAULT '{}'::uuid[],
  _reviewer_type text DEFAULT NULL, _reviewer uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
        _rtype text := _reviewer_type; _rid uuid := _reviewer;
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
  IF NOT (public.is_in_project_scope(_project, _uid)
          OR EXISTS (SELECT 1 FROM public.project_members pm
                     WHERE pm.project_id = _project AND pm.user_id = _uid)) THEN
    RAISE EXCEPTION 'Bạn không thuộc phạm vi dự án này';
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
                            deadline, priority, status, created_by,
                            approval_status, approval_round, submitted_at,
                            reviewer_type, reviewer_id)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _uid, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), 'not_started', _uid,
          'pending', 1, now(), _rtype, _rid)
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
END $$;

-- 7) Notify stakeholders on cancel
CREATE OR REPLACE FUNCTION public.task_cancel_notify(_task uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE t public.tasks%ROWTYPE; r uuid;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task;
  IF t.id IS NULL THEN RETURN; END IF;
  FOREACH r IN ARRAY ARRAY[t.assignee_id, t.created_by, t.reviewer_id] LOOP
    IF r IS NOT NULL THEN
      PERFORM public.notify_user(
        r, 'task.cancelled', 'Công việc đã bị hủy',
        t.name || CASE WHEN COALESCE(t.cancel_reason,'') = '' THEN '' ELSE ' — Lý do: ' || t.cancel_reason END,
        'task', t.id, '/tasks/' || t.id::text,
        'task.cancelled:' || t.id::text || ':' || r::text);
    END IF;
  END LOOP;
END $$;
