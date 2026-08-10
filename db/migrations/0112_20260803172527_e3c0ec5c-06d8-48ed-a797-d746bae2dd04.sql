-- ============ B. Task approval event history ============
CREATE TABLE public.task_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('submitted','approved','changes_requested','resubmitted','withdrawn')),
  round integer NOT NULL DEFAULT 1,
  actor_id uuid,
  reason text,
  is_backfilled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.task_approval_events TO authenticated;
GRANT ALL ON public.task_approval_events TO service_role;

ALTER TABLE public.task_approval_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX task_approval_events_unique_action
  ON public.task_approval_events (task_id, event_type, round);
CREATE INDEX task_approval_events_task_created_idx
  ON public.task_approval_events (task_id, created_at);
CREATE INDEX task_approval_events_type_created_idx
  ON public.task_approval_events (event_type, created_at);

-- Task indexes used by dashboard aggregation
CREATE INDEX IF NOT EXISTS tasks_team_deadline_idx ON public.tasks (team_id, deadline);
CREATE INDEX IF NOT EXISTS tasks_assignee_deadline_idx ON public.tasks (assignee_id, deadline);
CREATE INDEX IF NOT EXISTS tasks_completed_at_idx ON public.tasks (completed_at);

-- Read scope helper (Admin/CMO: all, Leader: own team, Member: own tasks)
CREATE OR REPLACE FUNCTION public.can_view_task_approval_events(_task uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task
      AND (
        public.current_app_role() IN ('admin','cmo')
        OR (t.team_id IS NOT NULL AND t.team_id = public.leader_team_id(auth.uid()))
        OR t.assignee_id = auth.uid()
        OR t.created_by = auth.uid()
      )
  );
$$;

CREATE POLICY "task_approval_events_select" ON public.task_approval_events
  FOR SELECT TO authenticated
  USING (public.can_view_task_approval_events(task_id));

-- Append-only guard
CREATE OR REPLACE FUNCTION public.task_approval_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử duyệt công việc là dữ liệu chỉ ghi thêm';
END; $$;

CREATE TRIGGER task_approval_events_no_update
  BEFORE UPDATE OR DELETE ON public.task_approval_events
  FOR EACH ROW EXECUTE FUNCTION public.task_approval_events_append_only();

-- Writer (idempotent)
CREATE OR REPLACE FUNCTION public.task_log_approval_event(
  _task uuid, _event_type text, _round integer, _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.task_approval_events (task_id, event_type, round, actor_id, reason)
  VALUES (_task, _event_type, COALESCE(_round, 1), auth.uid(),
          NULLIF(btrim(COALESCE(_reason, '')), ''))
  ON CONFLICT (task_id, event_type, round) DO NOTHING;
END; $$;

REVOKE ALL ON FUNCTION public.task_log_approval_event(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_log_approval_event(uuid, text, integer, text) TO service_role;

-- Cutoff: events recorded from this migration onward are trustworthy
CREATE OR REPLACE FUNCTION public.task_approval_events_since()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$ SELECT now() $$;

-- ============ Wire events into the existing workflow ============
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
  IF NOT EXISTS (SELECT 1 FROM public.project_members pm
                 WHERE pm.project_id = _project AND pm.user_id = _uid) THEN
    RAISE EXCEPTION 'Bạn không tham gia dự án này';
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

CREATE OR REPLACE FUNCTION public.task_approval_decide(_task uuid, _approve boolean, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; _link text; _pname text; _clean text := NULLIF(btrim(COALESCE(_note,'')),'');
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.approval_status NOT IN ('pending','changes_requested') THEN
    RAISE EXCEPTION 'Yêu cầu không ở trạng thái chờ xử lý';
  END IF;
  IF NOT public.can_approve_task_submission(_task) THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt công việc này';
  END IF;
  IF NOT _approve AND _clean IS NULL THEN
    RAISE EXCEPTION 'Cần nhập lý do yêu cầu chỉnh sửa';
  END IF;

  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = CASE WHEN _approve THEN 'approved'::public.task_approval_status
                                ELSE 'changes_requested'::public.task_approval_status END,
         status = 'not_started',
         approval_decided_at = now(),
         approval_decided_by = auth.uid(),
         approval_note = _clean
   WHERE id = _task;

  SELECT name INTO _pname FROM public.projects WHERE id = t.project_id;
  _link := '/tasks/' || _task::text;

  IF _approve THEN
    PERFORM public.task_log_approval_event(_task, 'approved', t.approval_round, _clean);
    PERFORM public.write_audit('task.approval_approved','task',_task,NULL,
      jsonb_build_object('approval_status','approved'), '{}'::jsonb);
    PERFORM public.notify_user(t.created_by, 'task.approval_approved', 'Công việc đã được duyệt',
      t.name || ' — Dự án: ' || COALESCE(_pname,'—'), 'task', _task, _link,
      'task.approval_approved:' || _task::text || ':' || t.approval_round::text);
  ELSE
    PERFORM public.task_log_approval_event(_task, 'changes_requested', t.approval_round, _clean);
    PERFORM public.write_audit('task.approval_changes_requested','task',_task,NULL,
      jsonb_build_object('approval_status','changes_requested','note',_clean), '{}'::jsonb);
    PERFORM public.notify_user(t.created_by, 'task.approval_changes_requested', 'Công việc cần chỉnh sửa',
      t.name || ' — Dự án: ' || COALESCE(_pname,'—') || E'\nLý do: ' || _clean, 'task', _task, _link,
      'task.approval_changes:' || _task::text || ':' || t.approval_round::text);
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.task_member_resubmit(_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được gửi lại'; END IF;
  IF t.approval_status <> 'changes_requested' THEN
    RAISE EXCEPTION 'Yêu cầu không ở trạng thái có thể gửi lại';
  END IF;
  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = 'pending', approval_round = approval_round + 1,
         submitted_at = now(), approval_decided_at = NULL, approval_decided_by = NULL
   WHERE id = _task;
  PERFORM public.task_log_approval_event(_task, 'resubmitted', t.approval_round + 1, NULL);
  PERFORM public.write_audit('task.approval_resubmitted','task',_task,NULL,
    jsonb_build_object('approval_status','pending'), '{}'::jsonb);
  PERFORM public.task_submission_notify(_task);
END; $function$;

CREATE OR REPLACE FUNCTION public.task_member_withdraw(_task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; _prev text; _actor text;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task AND deleted_at IS NULL FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công việc'; END IF;
  IF t.created_by <> auth.uid() THEN RAISE EXCEPTION 'Chỉ người gửi được thu hồi'; END IF;
  IF t.approval_status NOT IN ('pending','changes_requested') THEN
    RAISE EXCEPTION 'Yêu cầu này đã được xử lý và không thể thu hồi.';
  END IF;

  _prev := t.approval_status::text;
  SELECT COALESCE(display_name, email, 'Người dùng') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  PERFORM set_config('cen.task_approval','on',true);
  UPDATE public.tasks
     SET approval_status = 'withdrawn',
         approval_decided_at = now(),
         approval_decided_by = auth.uid()
   WHERE id = _task;

  UPDATE public.notifications
     SET read_at = now()
   WHERE entity_type = 'task'
     AND entity_id = _task
     AND read_at IS NULL
     AND event_type LIKE 'task.approval_request%';

  PERFORM public.task_log_approval_event(_task, 'withdrawn', t.approval_round, NULL);
  PERFORM public.write_audit('task.approval_withdrawn','task',_task,
    jsonb_build_object('approval_status', _prev),
    jsonb_build_object('approval_status','withdrawn'),
    jsonb_build_object(
      'message', COALESCE(_actor,'Người dùng') || ' đã thu hồi yêu cầu tạo công việc.',
      'task_name', t.name,
      'previous_status', _prev,
      'withdrawn_at', now()
    ));
END; $function$;

-- ============ D. Evidence-only backfill (marked as reference data) ============
INSERT INTO public.task_approval_events (task_id, event_type, round, actor_id, reason, is_backfilled, created_at)
SELECT t.id, 'submitted', 1, t.created_by, NULL, true, t.submitted_at
FROM public.tasks t
WHERE t.submitted_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.task_approval_events (task_id, event_type, round, actor_id, reason, is_backfilled, created_at)
SELECT t.id, t.approval_status::text, t.approval_round, t.approval_decided_by, t.approval_note, true, t.approval_decided_at
FROM public.tasks t
WHERE t.approval_decided_at IS NOT NULL
  AND t.approval_status IN ('approved','changes_requested','withdrawn')
ON CONFLICT DO NOTHING;

-- ============ A. Aggregated team average for members ============
CREATE OR REPLACE FUNCTION public.dashboard_member_team_average(p_from date, p_to date)
RETURNS TABLE (
  status text,
  team_size integer,
  completion_rate numeric,
  ontime_rate numeric,
  completed_tasks integer,
  open_tasks integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _team uuid;
  _size integer;
  _from timestamptz;
  _to timestamptz;
  _total integer := 0;
  _done integer := 0;
  _ontime integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập';
  END IF;

  SELECT p.primary_team_id INTO _team
  FROM public.profiles p
  WHERE p.id = _uid AND p.status = 'active' AND p.locked_at IS NULL;

  IF _team IS NULL THEN
    RETURN QUERY SELECT 'no_team'::text, 0, NULL::numeric, NULL::numeric, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT count(DISTINCT p.id) INTO _size
  FROM public.profiles p
  WHERE p.primary_team_id = _team AND p.status = 'active' AND p.locked_at IS NULL;

  IF _size < 3 THEN
    RETURN QUERY SELECT 'insufficient_team_size'::text, _size, NULL::numeric, NULL::numeric, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  _from := (COALESCE(p_from, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  _to := ((COALESCE(p_to, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE t.status = 'done')::int,
    count(*) FILTER (WHERE t.status = 'done' AND t.completed_at IS NOT NULL AND t.completed_at <= t.deadline)::int
  INTO _total, _done, _ontime
  FROM public.tasks t
  WHERE t.deleted_at IS NULL
    AND t.approval_status = 'approved'
    AND t.deadline >= _from AND t.deadline < _to
    AND t.assignee_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.primary_team_id = _team AND p.status = 'active' AND p.locked_at IS NULL
    );

  RETURN QUERY SELECT
    'ok'::text,
    _size,
    CASE WHEN _total = 0 THEN 0 ELSE round(_done::numeric * 100 / _total, 1) END,
    CASE WHEN _done = 0 THEN 0 ELSE round(_ontime::numeric * 100 / _done, 1) END,
    _done,
    (_total - _done);
END; $$;

REVOKE ALL ON FUNCTION public.dashboard_member_team_average(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_member_team_average(date, date) TO authenticated;

-- ============ C. Review stats from event history ============
CREATE OR REPLACE FUNCTION public.dashboard_task_review_stats(p_from date, p_to date, p_user uuid DEFAULT NULL)
RETURNS TABLE (
  status text,
  changes_requested_count integer,
  first_pass_tasks integer,
  evaluated_tasks integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role app_role;
  _scope_user uuid;
  _leader_team uuid;
  _from timestamptz;
  _to timestamptz;
  _cutoff timestamptz := public.task_approval_events_since();
  _status text;
  _cr integer := 0;
  _fp integer := 0;
  _ev integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bạn cần đăng nhập'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = _uid AND p.status = 'active' AND p.locked_at IS NULL) THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động';
  END IF;

  _role := public.current_app_role();
  _leader_team := public.leader_team_id(_uid);

  IF _role IN ('admin','cmo') THEN
    _scope_user := p_user;
  ELSIF _leader_team IS NOT NULL AND (p_user IS NULL OR EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.primary_team_id = _leader_team)) THEN
    _scope_user := p_user;
  ELSE
    _scope_user := _uid;
  END IF;

  _from := (COALESCE(p_from, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  _to := ((COALESCE(p_to, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  _status := CASE WHEN _from < _cutoff THEN 'historical_data_incomplete' ELSE 'ok' END;

  WITH scoped AS (
    SELECT t.id
    FROM public.tasks t
    WHERE t.deleted_at IS NULL
      AND (
        _role IN ('admin','cmo')
        OR (_leader_team IS NOT NULL AND t.team_id = _leader_team)
        OR t.assignee_id = _uid
      )
      AND (_scope_user IS NULL OR t.assignee_id = _scope_user)
  ),
  ev AS (
    SELECT e.*
    FROM public.task_approval_events e
    JOIN scoped s ON s.id = e.task_id
    WHERE e.created_at >= _from AND e.created_at < _to
  ),
  decisions AS (
    SELECT DISTINCT ON (e.task_id) e.task_id, e.event_type
    FROM ev e
    WHERE e.event_type IN ('approved','changes_requested')
      AND e.is_backfilled = false
    ORDER BY e.task_id, e.created_at, e.round
  )
  SELECT
    (SELECT count(*) FROM ev WHERE event_type = 'changes_requested')::int,
    (SELECT count(*) FROM decisions WHERE event_type = 'approved')::int,
    (SELECT count(*) FROM decisions)::int
  INTO _cr, _fp, _ev;

  RETURN QUERY SELECT _status, _cr, _fp, _ev;
END; $$;

REVOKE ALL ON FUNCTION public.dashboard_task_review_stats(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_task_review_stats(date, date, uuid) TO authenticated;