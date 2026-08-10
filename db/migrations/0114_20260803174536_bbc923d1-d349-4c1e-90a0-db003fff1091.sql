DROP FUNCTION IF EXISTS public.dashboard_task_review_stats(date, date, uuid);

CREATE OR REPLACE FUNCTION public.dashboard_task_review_stats(
  p_from date,
  p_to date,
  p_user uuid DEFAULT NULL::uuid,
  p_team uuid DEFAULT NULL::uuid
)
RETURNS TABLE(status text, changes_requested_count integer, first_pass_tasks integer, evaluated_tasks integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _role app_role;
  _scope_user uuid;
  _scope_team uuid;
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
    _scope_team := p_team;
  ELSIF _leader_team IS NOT NULL AND (p_user IS NULL OR EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.primary_team_id = _leader_team)) THEN
    _scope_user := p_user;
    _scope_team := _leader_team;
  ELSE
    _scope_user := _uid;
    _scope_team := NULL;
  END IF;

  _from := (COALESCE(p_from, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  _to := ((COALESCE(p_to, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  _status := CASE WHEN _from < _cutoff THEN 'historical_data_incomplete' ELSE 'ok' END;

  WITH scoped AS (
    SELECT t.id
    FROM public.tasks t
    WHERE t.deleted_at IS NULL
      AND t.approval_status NOT IN ('pending','withdrawn')
      AND (t.manually_archived_at IS NULL OR t.status = 'done')
      AND (
        _role IN ('admin','cmo')
        OR (_leader_team IS NOT NULL AND t.team_id = _leader_team)
        OR t.assignee_id = _uid
      )
      AND (_scope_user IS NULL OR t.assignee_id = _scope_user)
      AND (_scope_team IS NULL OR t.team_id = _scope_team)
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
END; $function$;

REVOKE ALL ON FUNCTION public.dashboard_task_review_stats(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_task_review_stats(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_task_review_stats(date, date, uuid, uuid) TO service_role;