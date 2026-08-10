CREATE OR REPLACE FUNCTION public.can_view_daily_report(_author uuid, _team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    _author = auth.uid()
    OR public.is_system_admin(auth.uid())
    OR (_team IS NOT NULL AND (
          public.report_team_leader(_team)
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.primary_team_id = _team)
          OR EXISTS (SELECT 1 FROM public.team_collaborators tc WHERE tc.team_id = _team AND tc.user_id = auth.uid())
    ))
    OR EXISTS (
      SELECT 1 FROM public.profiles a
      WHERE a.id = _author AND a.primary_team_id IS NOT NULL AND (
        public.report_team_leader(a.primary_team_id)
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.primary_team_id = a.primary_team_id)
        OR EXISTS (SELECT 1 FROM public.team_collaborators tc WHERE tc.team_id = a.primary_team_id AND tc.user_id = auth.uid())
      )
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_weekly_report(_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_system_admin(auth.uid())
    OR (_team IS NOT NULL AND (
          public.report_team_leader(_team)
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.primary_team_id = _team)
          OR EXISTS (SELECT 1 FROM public.team_collaborators tc WHERE tc.team_id = _team AND tc.user_id = auth.uid())
    ))
  )
$function$;