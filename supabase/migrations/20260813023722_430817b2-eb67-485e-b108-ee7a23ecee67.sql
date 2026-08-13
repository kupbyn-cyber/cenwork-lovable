CREATE OR REPLACE FUNCTION public.task_recurrence_create(
  _name text, _description text, _project uuid, _assignee uuid, _team uuid,
  _participants uuid[], _priority task_priority, _reviewer_type text, _reviewer uuid,
  _freq task_recurrence_freq, _start_date date, _end_date date,
  _deadline_time time without time zone, _weekdays smallint[], _month_day smallint,
  _work_weight smallint DEFAULT 2)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _rule uuid; _task uuid;
        _w smallint := COALESCE(_work_weight, 2::smallint);
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
  IF _w NOT IN (1,2,3,5) THEN
    RAISE EXCEPTION 'Trọng số công việc chỉ nhận 1, 2, 3 hoặc 5';
  END IF;
  IF NOT public.can_set_work_weight(_uid, _w) THEN
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
    _w, _reviewer_type, _reviewer, _freq, _start_date, _end_date,
    COALESCE(_deadline_time,'17:00'::time),
    COALESCE(_weekdays,'{}'::smallint[]), _month_day, _uid)
  RETURNING id INTO _rule;

  PERFORM public.write_audit('task_recurrence.created','task_recurrence', _rule, NULL,
    jsonb_build_object('name', btrim(_name), 'freq', _freq, 'start_date', _start_date,
      'end_date', _end_date, 'deadline_time', _deadline_time,
      'weekdays', to_jsonb(_weekdays), 'month_day', _month_day,
      'work_weight', _w), '{}'::jsonb);

  IF _start_date <= _today
     AND (_end_date IS NULL OR _today <= _end_date)
     AND public.task_recurrence_matches(_freq, COALESCE(_weekdays,'{}'::smallint[]), _month_day, _today) THEN
    _task := public.task_recurrence_generate(_rule, _today);
    UPDATE public.task_recurrence_rules SET last_generated_date = _today WHERE id = _rule;
  END IF;

  RETURN jsonb_build_object('rule_id', _rule, 'task_id', _task);
END; $function$;

DROP FUNCTION IF EXISTS public.can_set_work_weight(uuid, integer);