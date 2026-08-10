CREATE OR REPLACE FUNCTION public.can_view_daily_report(_author uuid, _team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.can_view_weekly_report(_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
$$;

UPDATE public.role_permission_config SET data_scope = 'organization' WHERE permission_key = 'reports.view';