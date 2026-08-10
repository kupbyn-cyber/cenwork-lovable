CREATE OR REPLACE FUNCTION public.is_project_person(_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE (p.owner_id = _person OR p.created_by = _person
           OR EXISTS (SELECT 1 FROM public.project_members pm
                      WHERE pm.project_id = p.id AND pm.user_id = _person))
      AND public.can_view_project(p.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_team(_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_teams pt
    WHERE pt.team_id = _team AND public.can_view_project(pt.project_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_person(uuid), public.is_project_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_person(uuid), public.is_project_team(uuid) TO authenticated, service_role;

CREATE POLICY profiles_select_project_scope ON public.profiles
  FOR SELECT TO authenticated USING (public.is_project_person(id));

CREATE POLICY teams_select_project_scope ON public.teams
  FOR SELECT TO authenticated USING (public.is_project_team(id));