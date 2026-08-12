-- MVP-FIX-03 — Trọng số công việc độc lập với Mức ưu tiên.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS work_weight smallint NOT NULL DEFAULT 2;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_work_weight_check;
UPDATE public.tasks SET work_weight = 2 WHERE work_weight NOT IN (1,2,3,5);
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_work_weight_check CHECK (work_weight IN (1,2,3,5));

ALTER TABLE public.task_recurrence_rules
  ADD COLUMN IF NOT EXISTS work_weight smallint NOT NULL DEFAULT 2;
ALTER TABLE public.task_recurrence_rules DROP CONSTRAINT IF EXISTS task_recurrence_rules_work_weight_check;
UPDATE public.task_recurrence_rules SET work_weight = 2 WHERE work_weight NOT IN (1,2,3,5);
ALTER TABLE public.task_recurrence_rules
  ADD CONSTRAINT task_recurrence_rules_work_weight_check CHECK (work_weight IN (1,2,3,5));

-- Chỉ Leader/CMO/Admin được đặt mức Trọng điểm (5).
CREATE OR REPLACE FUNCTION public.can_set_work_weight(_user uuid, _weight smallint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _weight IS NULL OR _weight <> 5 THEN true
    WHEN _user IS NULL THEN true
    ELSE EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = _user AND ur.role IN ('admin','cmo','leader'))
  END;
$$;
GRANT EXECUTE ON FUNCTION public.can_set_work_weight(uuid, smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.tasks_enforce_work_weight()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NEW.work_weight IS NULL THEN NEW.work_weight := 2; END IF;
  IF NEW.work_weight NOT IN (1,2,3,5) THEN
    RAISE EXCEPTION 'Trọng số công việc chỉ nhận 1, 2, 3 hoặc 5';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.work_weight IS DISTINCT FROM OLD.work_weight)
     AND NEW.work_weight = 5 AND _uid IS NOT NULL
     AND NOT public.can_set_work_weight(_uid, 5::smallint) THEN
    RAISE EXCEPTION 'Chỉ Leader, CMO hoặc Admin được đặt Trọng số Trọng điểm (5)';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.work_weight IS DISTINCT FROM OLD.work_weight THEN
    PERFORM public.write_audit('task.work_weight_changed','task', NEW.id,
      jsonb_build_object('work_weight', OLD.work_weight),
      jsonb_build_object('work_weight', NEW.work_weight), '{}'::jsonb);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tasks_enforce_work_weight() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_tasks_work_weight ON public.tasks;
CREATE TRIGGER trg_tasks_work_weight BEFORE INSERT OR UPDATE OF work_weight ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_enforce_work_weight();

CREATE OR REPLACE FUNCTION public.recurrence_enforce_work_weight()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NEW.work_weight IS NULL THEN NEW.work_weight := 2; END IF;
  IF NEW.work_weight NOT IN (1,2,3,5) THEN
    RAISE EXCEPTION 'Trọng số công việc chỉ nhận 1, 2, 3 hoặc 5';
  END IF;
  IF NEW.work_weight = 5 AND _uid IS NOT NULL
     AND NOT public.can_set_work_weight(_uid, 5::smallint) THEN
    RAISE EXCEPTION 'Chỉ Leader, CMO hoặc Admin được đặt Trọng số Trọng điểm (5)';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.recurrence_enforce_work_weight() FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_task_recurrence_work_weight ON public.task_recurrence_rules;
CREATE TRIGGER trg_task_recurrence_work_weight BEFORE INSERT OR UPDATE OF work_weight
ON public.task_recurrence_rules
FOR EACH ROW EXECUTE FUNCTION public.recurrence_enforce_work_weight();

-- Sinh Task lặp mang theo trọng số của lịch lặp.
CREATE OR REPLACE FUNCTION public.task_recurrence_generate(_rule uuid, _d date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.task_recurrence_rules%ROWTYPE; _task uuid;
BEGIN
  SELECT * INTO _r FROM public.task_recurrence_rules WHERE id = _rule;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.tasks (
    name, description, project_id, assignee_id, team_id, start_date, deadline,
    priority, work_weight, status, created_by, reviewer_type, reviewer_id,
    recurrence_rule_id, occurrence_date)
  VALUES (
    _r.name, _r.description, _r.project_id, _r.assignee_id, _r.team_id, _d,
    ((_d + _r.deadline_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'),
    _r.priority, COALESCE(_r.work_weight,2), 'not_started', _r.created_by,
    _r.reviewer_type, _r.reviewer_id, _r.id, _d)
  ON CONFLICT (recurrence_rule_id, occurrence_date) WHERE recurrence_rule_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO _task;

  IF _task IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.task_participants (task_id, user_id)
  SELECT _task, u FROM unnest(_r.participant_ids) u WHERE u <> _r.assignee_id
  ON CONFLICT DO NOTHING;

  PERFORM public.write_audit('task.recurrence_generated','task', _task, NULL,
    jsonb_build_object('rule_id', _r.id, 'occurrence_date', _d), '{}'::jsonb);
  RETURN _task;
END; $$;
REVOKE ALL ON FUNCTION public.task_recurrence_generate(uuid, date) FROM PUBLIC, anon, authenticated;

-- Tạo lịch lặp: nhận trọng số công việc.
DROP FUNCTION IF EXISTS public.task_recurrence_create(text, text, uuid, uuid, uuid, uuid[], public.task_priority, text, uuid, public.task_recurrence_freq, date, date, time, smallint[], smallint);
CREATE OR REPLACE FUNCTION public.task_recurrence_create(
  _name text, _description text, _project uuid, _assignee uuid, _team uuid,
  _participants uuid[], _priority public.task_priority,
  _reviewer_type text, _reviewer uuid,
  _freq public.task_recurrence_freq, _start_date date, _end_date date,
  _deadline_time time, _weekdays smallint[], _month_day smallint,
  _work_weight smallint DEFAULT 2)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _rule uuid; _task uuid;
        _today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF COALESCE(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Nhập tên công việc'; END IF;
  IF NOT public.can_create_task(_project) THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo công việc trong phạm vi này';
  END IF;
  IF NOT public.can_assign_task(_project, _team, _assignee) THEN
    RAISE EXCEPTION 'Bạn không có quyền giao việc cho người này';
  END IF;
  IF COALESCE(_work_weight,2) NOT IN (1,2,3,5) THEN
    RAISE EXCEPTION 'Trọng số công việc chỉ nhận 1, 2, 3 hoặc 5';
  END IF;
  IF NOT public.can_set_work_weight(_uid, COALESCE(_work_weight,2)) THEN
    RAISE EXCEPTION 'Chỉ Leader, CMO hoặc Admin được đặt Trọng số Trọng điểm (5)';
  END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'Chọn ngày bắt đầu lịch lặp'; END IF;
  IF _end_date IS NOT NULL AND _end_date < _start_date THEN
    RAISE EXCEPTION 'Ngày kết thúc không được trước ngày bắt đầu';
  END IF;
  IF _freq = 'weekly' AND COALESCE(array_length(_weekdays,1),0) = 0 THEN
    RAISE EXCEPTION 'Chọn ít nhất một thứ trong tuần';
  END IF;
  IF _freq = 'monthly' AND (_month_day IS NULL OR _month_day < 1 OR _month_day > 31) THEN
    RAISE EXCEPTION 'Chọn ngày lặp trong tháng (1–31)';
  END IF;

  INSERT INTO public.task_recurrence_rules (
    name, description, project_id, assignee_id, team_id, participant_ids, priority,
    work_weight, reviewer_type, reviewer_id, freq, start_date, end_date, deadline_time,
    weekdays, month_day, created_by)
  VALUES (
    btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _assignee, _team,
    COALESCE(_participants,'{}'::uuid[]), COALESCE(_priority,'medium'),
    COALESCE(_work_weight,2), _reviewer_type, _reviewer, _freq, _start_date, _end_date,
    COALESCE(_deadline_time,'17:00'::time),
    COALESCE(_weekdays,'{}'::smallint[]), _month_day, _uid)
  RETURNING id INTO _rule;

  PERFORM public.write_audit('task_recurrence.created','task_recurrence', _rule, NULL,
    jsonb_build_object('name', btrim(_name), 'freq', _freq, 'start_date', _start_date,
      'end_date', _end_date, 'deadline_time', _deadline_time,
      'weekdays', to_jsonb(_weekdays), 'month_day', _month_day,
      'work_weight', COALESCE(_work_weight,2)), '{}'::jsonb);

  IF _start_date <= _today
     AND (_end_date IS NULL OR _today <= _end_date)
     AND public.task_recurrence_matches(_freq, COALESCE(_weekdays,'{}'::smallint[]), _month_day, _today) THEN
    _task := public.task_recurrence_generate(_rule, _today);
    UPDATE public.task_recurrence_rules SET last_generated_date = _today WHERE id = _rule;
  END IF;

  RETURN jsonb_build_object('rule_id', _rule, 'task_id', _task);
END; $$;
GRANT EXECUTE ON FUNCTION public.task_recurrence_create(text, text, uuid, uuid, uuid, uuid[], public.task_priority, text, uuid, public.task_recurrence_freq, date, date, time, smallint[], smallint, smallint) TO authenticated;

-- Gửi duyệt: nhận trọng số công việc.
DROP FUNCTION IF EXISTS public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid);
CREATE OR REPLACE FUNCTION public.task_member_submit(
  _project uuid, _name text, _description text, _start_date date,
  _deadline timestamp with time zone, _priority task_priority,
  _participants uuid[] DEFAULT '{}'::uuid[],
  _reviewer_type text DEFAULT NULL, _reviewer uuid DEFAULT NULL,
  _work_weight smallint DEFAULT 2)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _team uuid; _task uuid;
        _rtype text := _reviewer_type; _rid uuid := _reviewer;
        _w smallint := COALESCE(_work_weight, 2);
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
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _uid, _team, _start_date,
          _deadline, COALESCE(_priority,'medium'), _w, 'not_started', _uid,
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
GRANT EXECUTE ON FUNCTION public.task_member_submit(uuid, text, text, date, timestamptz, public.task_priority, uuid[], text, uuid, smallint) TO authenticated;