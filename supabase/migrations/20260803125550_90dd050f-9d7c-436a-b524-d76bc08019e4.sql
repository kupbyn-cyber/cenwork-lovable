CREATE OR REPLACE FUNCTION public.recognition_team_pulse(_team uuid DEFAULT NULL::uuid)
RETURNS TABLE(team_id uuid, team_name text, total_count integer, self_count integer, peer_recognized_members integer, active_members integer, missing_members integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _scope uuid;
  _from date;
  _to date;
  _today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  _scope := _team;
  IF _scope IS NULL THEN
    _scope := COALESCE(public.leader_team_id(_me),
                       (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = _me));
  ELSIF NOT public.is_system_admin(_me)
        AND _scope IS DISTINCT FROM public.leader_team_id(_me)
        AND _scope IS DISTINCT FROM (SELECT p.primary_team_id FROM public.profiles p WHERE p.id = _me) THEN
    RAISE EXCEPTION 'Bạn không xem được thống kê của Team này.';
  END IF;

  _from := _today - ((EXTRACT(ISODOW FROM _today)::int) - 1);
  _to := _from + 6;

  -- Không thuộc Team nào (ví dụ Admin hệ thống): xem phạm vi toàn tổ chức.
  RETURN QUERY
  WITH members AS (
    SELECT p.id
      FROM public.profiles p
     WHERE (_scope IS NULL OR p.primary_team_id = _scope)
       AND p.status = 'active'
       AND p.locked_at IS NULL
  ),
  week_rows AS (
    SELECT r.receiver_id, r.sender_id
      FROM public.recognitions r
     WHERE r.revoked_at IS NULL
       AND (_scope IS NULL OR r.receiver_team_id = _scope)
       AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN _from AND _to
  )
  SELECT _scope,
         (SELECT t.name FROM public.teams t WHERE t.id = _scope),
         (SELECT count(*)::int FROM week_rows),
         (SELECT count(*)::int FROM week_rows w WHERE w.sender_id = w.receiver_id),
         (SELECT count(DISTINCT w.receiver_id)::int FROM week_rows w
           JOIN members m ON m.id = w.receiver_id
          WHERE w.sender_id <> w.receiver_id),
         (SELECT count(*)::int FROM members),
         GREATEST(0,
           (SELECT count(*)::int FROM members)
           - (SELECT count(DISTINCT w.receiver_id)::int FROM week_rows w
               JOIN members m ON m.id = w.receiver_id
              WHERE w.sender_id <> w.receiver_id));
END;
$function$;