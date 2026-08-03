DROP FUNCTION IF EXISTS public.recognition_stats(date, date, uuid, uuid, recognition_category);

CREATE OR REPLACE FUNCTION public.recognition_stats(
  _from date,
  _to date,
  _team uuid DEFAULT NULL::uuid,
  _user uuid DEFAULT NULL::uuid,
  _category recognition_category DEFAULT NULL::recognition_category
)
RETURNS TABLE(
  receiver_id uuid,
  display_name text,
  team_id uuid,
  team_name text,
  teamwork_count integer,
  initiative_count integer,
  creativity_count integer,
  effectiveness_count integer,
  progress_count integer,
  dedication_count integer,
  support_count integer,
  quality_count integer,
  speed_count integer,
  self_count integer,
  total_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _me uuid := auth.uid();
  _lead uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  _lead := public.leader_team_id(_me);

  IF NOT public.is_system_admin(_me) THEN
    IF _lead IS NULL THEN
      IF _user IS DISTINCT FROM _me THEN
        _user := _me;
      END IF;
      _team := NULL;
    ELSE
      IF _team IS NOT NULL AND _team <> _lead THEN
        RAISE EXCEPTION 'Bạn chỉ xem được thống kê Team mình quản lý.';
      END IF;
      _team := _lead;
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.receiver_id,
         p.display_name,
         r.receiver_team_id AS team_id,
         t.name AS team_name,
         count(*) FILTER (WHERE r.category = 'teamwork')::int,
         count(*) FILTER (WHERE r.category = 'initiative')::int,
         count(*) FILTER (WHERE r.category = 'creativity')::int,
         count(*) FILTER (WHERE r.category = 'effectiveness')::int,
         count(*) FILTER (WHERE r.category = 'progress')::int,
         count(*) FILTER (WHERE r.category = 'dedication')::int,
         count(*) FILTER (WHERE r.category = 'support')::int,
         count(*) FILTER (WHERE r.category = 'quality')::int,
         count(*) FILTER (WHERE r.category = 'speed')::int,
         count(*) FILTER (WHERE r.sender_id = r.receiver_id)::int,
         count(*)::int
    FROM public.recognitions r
    JOIN public.profiles p ON p.id = r.receiver_id
    LEFT JOIN public.teams t ON t.id = r.receiver_team_id
   WHERE r.revoked_at IS NULL
     AND (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN _from AND _to
     AND (_category IS NULL OR r.category = _category)
     AND (_team IS NULL OR r.receiver_team_id = _team)
     AND (_user IS NULL OR r.receiver_id = _user)
     AND (
       public.is_system_admin(_me)
       OR (_lead IS NOT NULL AND r.receiver_team_id = _lead)
       OR r.receiver_id = _me
     )
   GROUP BY r.receiver_id, p.display_name, r.receiver_team_id, t.name
   ORDER BY count(*) DESC, p.display_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.recognition_stats(date, date, uuid, uuid, recognition_category) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recognition_stats(date, date, uuid, uuid, recognition_category) TO authenticated;