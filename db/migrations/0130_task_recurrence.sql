-- TASK-RECUR-01 — Công việc lặp theo ngày / tuần / tháng.
CREATE TYPE public.task_recurrence_freq AS ENUM ('daily','weekly','monthly');
CREATE TYPE public.task_recurrence_status AS ENUM ('active','stopped','archived');

CREATE TABLE public.task_recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id),
  assignee_id uuid NOT NULL REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  participant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  priority public.task_priority NOT NULL DEFAULT 'medium',
  reviewer_type text,
  reviewer_id uuid REFERENCES public.profiles(id),
  freq public.task_recurrence_freq NOT NULL,
  start_date date NOT NULL,
  end_date date,
  deadline_time time NOT NULL DEFAULT '17:00',
  weekdays smallint[] NOT NULL DEFAULT '{}'::smallint[],
  month_day smallint,
  status public.task_recurrence_status NOT NULL DEFAULT 'active',
  last_generated_date date,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.task_recurrence_rules TO authenticated;
GRANT ALL ON public.task_recurrence_rules TO service_role;
ALTER TABLE public.task_recurrence_rules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_task_recurrence_updated_at BEFORE UPDATE ON public.task_recurrence_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Liên kết ngược từ Task đã sinh về lịch lặp + kỳ tương ứng.
ALTER TABLE public.tasks
  ADD COLUMN recurrence_rule_id uuid REFERENCES public.task_recurrence_rules(id),
  ADD COLUMN occurrence_date date;

-- Chống trùng tuyệt đối: một kỳ chỉ có đúng một Task.
CREATE UNIQUE INDEX tasks_recurrence_occurrence_uidx
  ON public.tasks (recurrence_rule_id, occurrence_date)
  WHERE recurrence_rule_id IS NOT NULL;

CREATE INDEX idx_task_recurrence_active ON public.task_recurrence_rules (status, start_date);

-- ===== Quyền =====
CREATE OR REPLACE FUNCTION public.task_recurrence_can_view(_rule uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (
        SELECT 1 FROM public.task_recurrence_rules r
        WHERE r.id = _rule
          AND (
            r.created_by = auth.uid()
            OR r.assignee_id = auth.uid()
            OR r.reviewer_id = auth.uid()
            OR auth.uid() = ANY (r.participant_ids)
            OR (r.team_id IS NOT NULL AND r.team_id = public.leader_team_id(auth.uid()))
            OR (r.project_id IS NOT NULL AND public.can_view_project(r.project_id))
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.task_recurrence_can_manage(_rule uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'cmo')
      OR EXISTS (
        SELECT 1 FROM public.task_recurrence_rules r
        WHERE r.id = _rule
          AND (
            r.created_by = auth.uid()
            OR (r.project_id IS NOT NULL AND public.can_manage_project(r.project_id))
            OR (public.leader_team_id(auth.uid()) IS NOT NULL
                AND r.team_id = public.leader_team_id(auth.uid()))
          )
      );
$$;

CREATE POLICY task_recurrence_select_scoped ON public.task_recurrence_rules
FOR SELECT TO authenticated USING (public.task_recurrence_can_view(id));

-- ===== Tính kỳ =====
CREATE OR REPLACE FUNCTION public.task_recurrence_matches(
  _freq public.task_recurrence_freq, _weekdays smallint[], _month_day smallint, _d date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _freq
    WHEN 'daily' THEN true
    WHEN 'weekly' THEN EXTRACT(isodow FROM _d)::smallint = ANY (COALESCE(_weekdays,'{}'::smallint[]))
    WHEN 'monthly' THEN _month_day IS NOT NULL
      AND EXTRACT(day FROM _d)::smallint = LEAST(
        _month_day,
        EXTRACT(day FROM (date_trunc('month', _d::timestamp) + interval '1 month - 1 day'))::smallint)
    ELSE false
  END;
$$;

-- Sinh Task cho một kỳ; idempotent nhờ unique index.
CREATE OR REPLACE FUNCTION public.task_recurrence_generate(_rule uuid, _d date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.task_recurrence_rules%ROWTYPE; _task uuid;
BEGIN
  SELECT * INTO _r FROM public.task_recurrence_rules WHERE id = _rule;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.tasks (
    name, description, project_id, assignee_id, team_id, start_date, deadline,
    priority, status, created_by, reviewer_type, reviewer_id,
    recurrence_rule_id, occurrence_date)
  VALUES (
    _r.name, _r.description, _r.project_id, _r.assignee_id, _r.team_id, _d,
    ((_d + _r.deadline_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'),
    _r.priority, 'not_started', _r.created_by, _r.reviewer_type, _r.reviewer_id,
    _r.id, _d)
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

-- Tác vụ định kỳ: sinh Task cho các kỳ đến hôm nay (bù tối đa 31 ngày bỏ sót).
CREATE OR REPLACE FUNCTION public.task_recurrence_run()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  _r public.task_recurrence_rules%ROWTYPE;
  _d date; _from date; _count integer := 0;
BEGIN
  FOR _r IN SELECT * FROM public.task_recurrence_rules
            WHERE status = 'active' AND start_date <= _today
              AND (end_date IS NULL OR end_date >= start_date)
  LOOP
    _from := GREATEST(_r.start_date, COALESCE(_r.last_generated_date + 1, _r.start_date), _today - 31);
    _d := _from;
    WHILE _d <= _today LOOP
      IF (_r.end_date IS NULL OR _d <= _r.end_date)
         AND public.task_recurrence_matches(_r.freq, _r.weekdays, _r.month_day, _d) THEN
        IF public.task_recurrence_generate(_r.id, _d) IS NOT NULL THEN
          _count := _count + 1;
        END IF;
      END IF;
      _d := _d + 1;
    END LOOP;
    UPDATE public.task_recurrence_rules SET last_generated_date = _today WHERE id = _r.id;
  END LOOP;
  RETURN _count;
END; $$;

-- ===== Thao tác của người dùng =====
CREATE OR REPLACE FUNCTION public.task_recurrence_create(
  _name text, _description text, _project uuid, _assignee uuid, _team uuid,
  _participants uuid[], _priority public.task_priority,
  _reviewer_type text, _reviewer uuid,
  _freq public.task_recurrence_freq, _start_date date, _end_date date,
  _deadline_time time, _weekdays smallint[], _month_day smallint)
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
    reviewer_type, reviewer_id, freq, start_date, end_date, deadline_time,
    weekdays, month_day, created_by)
  VALUES (
    btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _project, _assignee, _team,
    COALESCE(_participants,'{}'::uuid[]), COALESCE(_priority,'medium'),
    _reviewer_type, _reviewer, _freq, _start_date, _end_date,
    COALESCE(_deadline_time,'17:00'::time),
    COALESCE(_weekdays,'{}'::smallint[]), _month_day, _uid)
  RETURNING id INTO _rule;

  PERFORM public.write_audit('task_recurrence.created','task_recurrence', _rule, NULL,
    jsonb_build_object('name', btrim(_name), 'freq', _freq, 'start_date', _start_date,
      'end_date', _end_date, 'deadline_time', _deadline_time,
      'weekdays', _weekdays, 'month_day', _month_day), '{}'::jsonb);

  -- Kỳ của hôm nay (nếu đã tới) được sinh ngay để người phụ trách thấy việc.
  IF _start_date <= _today
     AND (_end_date IS NULL OR _today <= _end_date)
     AND public.task_recurrence_matches(_freq, COALESCE(_weekdays,'{}'::smallint[]), _month_day, _today) THEN
    _task := public.task_recurrence_generate(_rule, _today);
    UPDATE public.task_recurrence_rules SET last_generated_date = _today WHERE id = _rule;
  END IF;

  RETURN jsonb_build_object('rule_id', _rule, 'task_id', _task);
END; $$;

CREATE OR REPLACE FUNCTION public.task_recurrence_update(
  _rule uuid, _freq public.task_recurrence_freq, _start_date date, _end_date date,
  _deadline_time time, _weekdays smallint[], _month_day smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _before jsonb;
BEGIN
  IF NOT public.task_recurrence_can_manage(_rule) THEN
    RAISE EXCEPTION 'Bạn không có quyền chỉnh lịch lặp này';
  END IF;
  IF _end_date IS NOT NULL AND _start_date IS NOT NULL AND _end_date < _start_date THEN
    RAISE EXCEPTION 'Ngày kết thúc không được trước ngày bắt đầu';
  END IF;
  IF _freq = 'weekly' AND COALESCE(array_length(_weekdays,1),0) = 0 THEN
    RAISE EXCEPTION 'Chọn ít nhất một thứ trong tuần';
  END IF;
  IF _freq = 'monthly' AND (_month_day IS NULL OR _month_day < 1 OR _month_day > 31) THEN
    RAISE EXCEPTION 'Chọn ngày lặp trong tháng (1–31)';
  END IF;

  SELECT to_jsonb(r) INTO _before FROM public.task_recurrence_rules r WHERE r.id = _rule;

  UPDATE public.task_recurrence_rules
  SET freq = _freq,
      start_date = COALESCE(_start_date, start_date),
      end_date = _end_date,
      deadline_time = COALESCE(_deadline_time, deadline_time),
      weekdays = COALESCE(_weekdays,'{}'::smallint[]),
      month_day = _month_day
  WHERE id = _rule;

  PERFORM public.write_audit('task_recurrence.updated','task_recurrence', _rule,
    jsonb_build_object('freq', _before->>'freq', 'start_date', _before->>'start_date',
      'end_date', _before->>'end_date', 'deadline_time', _before->>'deadline_time',
      'weekdays', _before->'weekdays', 'month_day', _before->>'month_day'),
    jsonb_build_object('freq', _freq, 'start_date', _start_date, 'end_date', _end_date,
      'deadline_time', _deadline_time, 'weekdays', to_jsonb(_weekdays), 'month_day', _month_day),
    '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.task_recurrence_set_status(
  _rule uuid, _status public.task_recurrence_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _old public.task_recurrence_status;
BEGIN
  IF NOT public.task_recurrence_can_manage(_rule) THEN
    RAISE EXCEPTION 'Bạn không có quyền thay đổi lịch lặp này';
  END IF;
  SELECT status INTO _old FROM public.task_recurrence_rules WHERE id = _rule;
  IF _old IS NULL THEN RAISE EXCEPTION 'Không tìm thấy lịch lặp'; END IF;

  UPDATE public.task_recurrence_rules SET status = _status WHERE id = _rule;

  PERFORM public.write_audit(
    CASE _status WHEN 'stopped' THEN 'task_recurrence.stopped'
                 WHEN 'archived' THEN 'task_recurrence.archived'
                 ELSE 'task_recurrence.resumed' END,
    'task_recurrence', _rule,
    jsonb_build_object('status', _old), jsonb_build_object('status', _status), '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.task_recurrence_generate(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_recurrence_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_recurrence_create(text, text, uuid, uuid, uuid, uuid[], public.task_priority, text, uuid, public.task_recurrence_freq, date, date, time, smallint[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_recurrence_update(uuid, public.task_recurrence_freq, date, date, time, smallint[], smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_recurrence_set_status(uuid, public.task_recurrence_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_recurrence_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_recurrence_can_manage(uuid) TO authenticated;
