CREATE OR REPLACE FUNCTION public.announcement_team_member_ids(_teams uuid[])
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.primary_team_id = ANY(_teams)
      AND p.status = 'active'
      AND public.is_active_account(auth.uid())
  ), '{}'::uuid[]);
$function$;