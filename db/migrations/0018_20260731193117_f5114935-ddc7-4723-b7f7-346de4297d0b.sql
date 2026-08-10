REVOKE EXECUTE ON FUNCTION
  public.current_app_role(), public.my_team_ids(),
  public.can_view_project(uuid), public.can_manage_project(uuid), public.can_edit_project_row(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.current_app_role(), public.my_team_ids(),
  public.can_view_project(uuid), public.can_manage_project(uuid), public.can_edit_project_row(uuid)
TO authenticated, service_role;