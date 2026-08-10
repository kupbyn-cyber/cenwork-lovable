-- NAP-01: nới phạm vi gửi thông báo (an toàn, chạy lặp được)

CREATE OR REPLACE FUNCTION public.can_announce_to_user(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.is_active_account(auth.uid())
    AND (_target = auth.uid() OR public.is_active_account(_target));
$function$;

CREATE OR REPLACE FUNCTION public.can_announce_to_team(_team uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.is_active_account(auth.uid())
    AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = _team);
$function$;

CREATE OR REPLACE FUNCTION public.announcement_audience_users()
RETURNS TABLE (id uuid, display_name text, email text, primary_team_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.email, p.primary_team_id
  FROM public.profiles p
  WHERE p.status = 'active'
    AND public.is_active_account(auth.uid())
  ORDER BY p.display_name;
$function$;

CREATE OR REPLACE FUNCTION public.announcement_audience_teams()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.name
  FROM public.teams t
  WHERE public.is_active_account(auth.uid())
  ORDER BY t.name;
$function$;

CREATE OR REPLACE FUNCTION public.announcement_active_user_ids(_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT p.id FROM public.profiles p
    WHERE p.id = ANY(_ids) AND p.status = 'active'
      AND public.is_active_account(auth.uid())
  ), '{}'::uuid[]);
$function$;

CREATE OR REPLACE FUNCTION public.announcement_team_member_ids(_teams uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT x.uid FROM (
      SELECT p.id AS uid FROM public.profiles p
      WHERE p.primary_team_id = ANY(_teams) AND p.status = 'active'
      UNION
      SELECT tc.user_id FROM public.team_collaborators tc
      JOIN public.profiles p2 ON p2.id = tc.user_id AND p2.status = 'active'
      WHERE tc.team_id = ANY(_teams)
    ) x
    WHERE public.is_active_account(auth.uid())
  ), '{}'::uuid[]);
$function$;

GRANT EXECUTE ON FUNCTION public.can_announce_to_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_announce_to_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_audience_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_audience_teams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_active_user_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_team_member_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_account(uuid) TO authenticated;